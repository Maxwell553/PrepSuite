import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchLichessGames } from '../../src/pipeline/lichess.js';

vi.mock('../../src/lib/fetchWithRetry.js', () => ({
  fetchWithRetry: vi.fn(),
}));

import { fetchWithRetry } from '../../src/lib/fetchWithRetry.js';
const mockedFetch = vi.mocked(fetchWithRetry);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchLichessGames', () => {
  it('returns empty for no username', async () => {
    const result = await fetchLichessGames('');
    expect(result.ndjson).toBe('');
    expect(result.totalFetched).toBe(0);
  });

  it('fetches NDJSON games', async () => {
    const ndjson = '{"id":"game1"}\n{"id":"game2"}\n{"id":"game3"}';
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => ndjson,
    } as Response);

    const result = await fetchLichessGames('testuser', 500);
    expect(result.totalFetched).toBe(3);
    expect(result.ndjson).toContain('game1');
    expect(result.ndjson).toContain('game3');
  });

  it('handles rate limiting gracefully', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as Response);

    const result = await fetchLichessGames('testuser', 100);
    expect(result.ndjson).toBe('');
  });

  it('paginates across multiple requests', async () => {
    // First batch: 500 games (full batch = more available)
    const batch1 = Array.from({ length: 500 }, (_, i) => `{"id":"game${i}"}`).join('\n');
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => batch1,
    } as Response);

    // Second batch: 200 games (less than 500 = end)
    const batch2 = Array.from({ length: 200 }, (_, i) => `{"id":"game${500 + i}"}`).join('\n');
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => batch2,
    } as Response);

    const result = await fetchLichessGames('testuser', 1000);
    expect(result.totalFetched).toBe(700);
  });

  it('calls onProgress callback', async () => {
    const ndjson = '{"id":"game1"}';
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => ndjson,
    } as Response);

    const onProgress = vi.fn();
    await fetchLichessGames('testuser', 500, onProgress);
    expect(onProgress).toHaveBeenCalledWith(1, 500);
  });

  it('stops when empty batch received', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '',
    } as Response);

    const result = await fetchLichessGames('testuser', 500);
    expect(result.totalFetched).toBe(0);
  });
});
