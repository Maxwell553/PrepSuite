import { logger } from '../lib/logger.js';
import { SSEStream } from '../lib/sse.js';
import { fetchChessComGames } from './chessCom.js';
import { fetchLichessGames } from './lichess.js';

export interface GameFetchResult {
  chessComGames: unknown[];
  lichessGamesNdjson: string;
  totalGames: number;
  durationMs: number;
}

/**
 * Fetch games from both platforms with SSE progress events.
 * Fetches Lichess first (to determine remaining budget for Chess.com).
 */
export async function fetchGames(
  chessComUsername: string,
  lichessUsername: string,
  gameLimit: number,
  sse: SSEStream,
): Promise<GameFetchResult> {
  const start = Date.now();

  sse.sendPhase({ phase: 'games', status: 'started' });

  let lichessNdjson = '';
  let lichessCount = 0;
  let chessComGames: unknown[] = [];

  // Fetch Lichess first
  if (lichessUsername) {
    logger.info({ username: lichessUsername, limit: gameLimit }, '[GameFetcher] Fetching Lichess');
    const lichessResult = await fetchLichessGames(lichessUsername, gameLimit, (current, total) => {
      sse.sendProgress({ phase: 'games', current, total });
    });
    lichessNdjson = lichessResult.ndjson;
    lichessCount = lichessResult.totalFetched;
    logger.info({ count: lichessCount }, '[GameFetcher] Lichess complete');
  }

  // Chess.com gets the remaining budget
  const chessComLimit = Math.max(0, gameLimit - lichessCount);
  if (chessComUsername && chessComLimit > 0) {
    logger.info(
      { username: chessComUsername, limit: chessComLimit },
      '[GameFetcher] Fetching Chess.com',
    );
    const chessComResult = await fetchChessComGames(
      chessComUsername,
      chessComLimit,
      (current, total) => {
        sse.sendProgress({ phase: 'games', current: lichessCount + current, total: gameLimit });
      },
    );
    chessComGames = chessComResult.games;
    logger.info({ count: chessComResult.totalFetched }, '[GameFetcher] Chess.com complete');
  }

  const totalGames = lichessCount + chessComGames.length;
  const durationMs = Date.now() - start;

  sse.sendPhase({
    phase: 'games',
    status: 'complete',
    durationMs,
    gameCount: totalGames,
  });

  return {
    chessComGames,
    lichessGamesNdjson: lichessNdjson,
    totalGames,
    durationMs,
  };
}
