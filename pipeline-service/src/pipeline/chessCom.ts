import { fetchWithRetry } from '../lib/fetchWithRetry.js';
import { logger } from '../lib/logger.js';

const BASE_URL = 'https://api.chess.com/pub/player';
const USER_AGENT = 'PrepSuite-Pipeline/1.0';
const BATCH_SIZE = 5;
const MAX_RECENT_ARCHIVES = 60;

export interface ChessComGamesFetchResult {
  games: unknown[];
  totalFetched: number;
}

/**
 * Fetch games from Chess.com for a player.
 * Direct API calls (no CORS proxy needed on server).
 */
export async function fetchChessComGames(
  username: string,
  limit = 5000,
  onProgress?: (current: number, total: number) => void,
): Promise<ChessComGamesFetchResult> {
  if (!username) return { games: [], totalFetched: 0 };

  const encoded = encodeURIComponent(username.toLowerCase());
  const archivesUrl = `${BASE_URL}/${encoded}/games/archives`;
  logger.info({ username, archivesUrl }, '[ChessCom] Fetching archives');

  const archivesRes = await fetchWithRetry(archivesUrl, {
    headers: { 'User-Agent': USER_AGENT },
    timeoutMs: 10000,
  });

  if (!archivesRes.ok) {
    logger.warn({ username, status: archivesRes.status }, '[ChessCom] Archives fetch failed');
    return { games: [], totalFetched: 0 };
  }

  const archivesData = (await archivesRes.json()) as { archives?: string[] };
  const archives = archivesData.archives;
  if (!archives || archives.length === 0) {
    logger.warn({ username }, '[ChessCom] No archives found');
    return { games: [], totalFetched: 0 };
  }

  // Most recent archives first
  const numArchives = Math.min(archives.length, MAX_RECENT_ARCHIVES);
  const recentArchives = archives.slice(-numArchives).reverse();

  logger.info(
    { username, archiveCount: recentArchives.length, totalArchives: archives.length },
    '[ChessCom] Processing archives',
  );

  const allGames: unknown[] = [];

  for (let i = 0; i < recentArchives.length; i += BATCH_SIZE) {
    if (allGames.length >= limit) break;

    const batch = recentArchives.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (url: string) => {
        try {
          // Direct URL — no proxy rewriting needed on server
          const res = await fetchWithRetry(url, {
            headers: { 'User-Agent': USER_AGENT },
            timeoutMs: 15000,
          });
          if (!res.ok) return [];
          const data = (await res.json()) as { games?: unknown[] };
          return data.games || [];
        } catch (err) {
          logger.warn({ url, err }, '[ChessCom] Archive fetch error');
          return [];
        }
      }),
    );

    for (const games of batchResults) {
      allGames.push(...games);
    }

    if (onProgress) {
      onProgress(allGames.length, limit);
    }

    // Respect rate limits
    if (i + BATCH_SIZE < recentArchives.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Sort by end_time descending (most recent first)
  const sorted = allGames.sort((a: any, b: any) => (b.end_time || 0) - (a.end_time || 0));
  const final = sorted.slice(0, limit);

  logger.info(
    { username, fetched: allGames.length, returned: final.length },
    '[ChessCom] Games fetch complete',
  );

  return { games: final, totalFetched: final.length };
}
