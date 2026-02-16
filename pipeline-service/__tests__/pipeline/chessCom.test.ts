import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchChessComGames } from '../../src/pipeline/chessCom.js';

vi.mock('../../src/lib/fetchWithRetry.js', () => ({
  fetchWithRetry: vi.fn(),
}));

import { fetchWithRetry } from '../../src/lib/fetchWithRetry.js';
const mockedFetch = vi.mocked(fetchWithRetry);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchChessComGames', () => {
  it('returns empty for no username', async () => {
    const result = await fetchChessComGames('');
    expect(result.games).toEqual([]);
    expect(result.totalFetched).toBe(0);
  });

  it('fetches and returns games from archives', async () => {
    // Mock archives response
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        archives: [
          'https://api.chess.com/pub/player/test/games/2025/01',
          'https://api.chess.com/pub/player/test/games/2025/02',
        ],
      }),
    } as Response);

    // Mock archive game responses
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        games: [
          { end_time: 1000002, pgn: 'game2' },
          { end_time: 1000001, pgn: 'game1' },
        ],
      }),
    } as Response);

    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        games: [{ end_time: 1000000, pgn: 'game0' }],
      }),
    } as Response);

    const result = await fetchChessComGames('test', 10);
    expect(result.games.length).toBe(3);
    // Should be sorted by end_time descending
    expect((result.games[0] as any).end_time).toBe(1000002);
  });

  it('handles empty archives', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ archives: [] }),
    } as Response);

    const result = await fetchChessComGames('test');
    expect(result.games).toEqual([]);
  });

  it('respects game limit', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        archives: ['https://api.chess.com/pub/player/test/games/2025/01'],
      }),
    } as Response);

    const games = Array.from({ length: 10 }, (_, i) => ({
      end_time: i,
      pgn: `game${i}`,
    }));

    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ games }),
    } as Response);

    const result = await fetchChessComGames('test', 5);
    expect(result.games.length).toBe(5);
  });

  it('calls onProgress callback', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        archives: ['https://api.chess.com/pub/player/test/games/2025/01'],
      }),
    } as Response);

    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        games: [{ end_time: 1, pgn: 'game1' }],
      }),
    } as Response);

    const onProgress = vi.fn();
    await fetchChessComGames('test', 100, onProgress);
    expect(onProgress).toHaveBeenCalled();
  });
});
