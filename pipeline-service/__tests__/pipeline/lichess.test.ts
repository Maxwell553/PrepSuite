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

  it('paginates with until cursor (no duplicate first page)', async () => {
    const batch1 = Array.from(
      { length: 500 },
      (_, i) => JSON.stringify({ id: `g${i}`, createdAt: 20_000 - i }),
    ).join('\n');
    const batch2 = Array.from(
      { length: 200 },
      (_, i) => JSON.stringify({ id: `h${i}`, createdAt: 10_000 - i }),
    ).join('\n');

    mockedFetch.mockImplementation((url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('until=')) {
        return Promise.resolve({ ok: true, text: async () => batch2 } as Response);
      }
      return Promise.resolve({ ok: true, text: async () => batch1 } as Response);
    });

    const result = await fetchLichessGames('testuser', 1000);
    expect(result.totalFetched).toBe(700);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    const firstUrl = String(mockedFetch.mock.calls[0][0]);
    const secondUrl = String(mockedFetch.mock.calls[1][0]);
    expect(firstUrl).not.toContain('until=');
    expect(secondUrl).toContain('until=');
    expect(firstUrl).toContain('moves=false');
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
