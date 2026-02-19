import { fetchWithRetry } from '../lib/fetchWithRetry.js';
import { logger } from '../lib/logger.js';

const BASE_URL = 'https://lichess.org/api';
const GAMES_PER_REQUEST = 500;

export interface LichessGamesFetchResult {
  /** Raw NDJSON string of all games */
  ndjson: string;
  totalFetched: number;
}

/**
 * Fetch games from Lichess in NDJSON format.
 * Direct API call (no CORS proxy needed on server).
 */
export async function fetchLichessGames(
  username: string,
  limit = 5000,
  onProgress?: (current: number, total: number) => void,
): Promise<LichessGamesFetchResult> {
  if (!username) return { ndjson: '', totalFetched: 0 };

  const targetGames = Math.min(limit, 10000);
  const numRequests = Math.ceil(targetGames / GAMES_PER_REQUEST);

  logger.info(
    { username, targetGames, numRequests },
    '[Lichess] Fetching games',
  );

  const allLines: string[] = [];

  try {
    for (let i = 0; i < numRequests; i++) {
      const maxGames = Math.min(GAMES_PER_REQUEST, targetGames - i * GAMES_PER_REQUEST);
      const url = `${BASE_URL}/games/user/${username}?max=${maxGames}&opening=true&moves=true&pgnInJson=true`;

      logger.info({ batch: i + 1, numRequests, url }, '[Lichess] Fetching batch');

      const res = await fetchWithRetry(url, {
        headers: { Accept: 'application/x-ndjson' },
        timeoutMs: 30000,
      });

      if (!res.ok) {
        if (res.status === 429) {
          logger.warn('[Lichess] Rate limited');
          break;
        }
        logger.warn({ status: res.status }, '[Lichess] Batch failed');
        if (i === 0) throw new Error(`Lichess games fetch failed: ${res.status}`);
        break;
      }

      const text = await res.text();
      const lines = text
        .trim()
        .split('\n')
        .filter((l) => l.trim().length > 0);

      if (lines.length === 0) break;

      allLines.push(...lines);

      if (onProgress) {
        onProgress(allLines.length, targetGames);
      }

      logger.info(
        { batch: i + 1, batchSize: lines.length, total: allLines.length },
        '[Lichess] Batch complete',
      );

      if (lines.length < maxGames) break;

      // Respect rate limits
      if (i < numRequests - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const finalLines = allLines.slice(0, targetGames);
    const ndjson = finalLines.join('\n');

    logger.info(
      { username, total: allLines.length, returned: finalLines.length },
      '[Lichess] Games fetch complete',
    );

    return { ndjson, totalFetched: finalLines.length };
  } catch (err) {
    logger.error({ err, username }, '[Lichess] Games fetch error');
    // Return what we have
    const finalLines = allLines.slice(0, targetGames);
    return { ndjson: finalLines.join('\n'), totalFetched: finalLines.length };
  }
}
