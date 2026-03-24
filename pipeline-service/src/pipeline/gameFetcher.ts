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
 * Fetch games from both platforms in parallel with SSE progress events.
 * Merges results and trims to gameLimit (most recent by date).
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
  let chessComGames: unknown[] = [];

  const hasLichess = !!lichessUsername;
  const hasChessCom = !!chessComUsername;

  if (hasLichess && hasChessCom) {
    // Parallel fetch: both platforms with full limit, merge and trim
    logger.info({ lichess: lichessUsername, chessCom: chessComUsername, limit: gameLimit }, '[GameFetcher] Fetching both platforms in parallel');
    let lichessCount = 0;
    let chessComCount = 0;
    const combinedTotal = gameLimit * 2;
    const onProgress = () => {
      const current = Math.min(lichessCount + chessComCount, combinedTotal);
      sse.sendProgress({ phase: 'games', current, total: combinedTotal });
    };
    const [lichessResult, chessComResult] = await Promise.all([
      fetchLichessGames(lichessUsername, gameLimit, (cur, _tot) => {
        lichessCount = Math.min(cur, gameLimit);
        onProgress();
      }),
      fetchChessComGames(chessComUsername, gameLimit, (cur, _tot) => {
        chessComCount = Math.min(cur, gameLimit);
        onProgress();
      }),
    ]);
    lichessNdjson = lichessResult.ndjson;
    chessComGames = chessComResult.games;
    logger.info({ lichess: lichessResult.totalFetched, chessCom: chessComResult.totalFetched }, '[GameFetcher] Both complete');
  } else if (hasLichess) {
    const lichessResult = await fetchLichessGames(lichessUsername, gameLimit, (current, total) => {
      sse.sendProgress({ phase: 'games', current, total });
    });
    lichessNdjson = lichessResult.ndjson;
    logger.info({ count: lichessResult.totalFetched }, '[GameFetcher] Lichess complete');
  } else if (hasChessCom) {
    const chessComResult = await fetchChessComGames(chessComUsername, gameLimit, (current, total) => {
      sse.sendProgress({ phase: 'games', current, total });
    });
    chessComGames = chessComResult.games;
    logger.info({ count: chessComResult.totalFetched }, '[GameFetcher] Chess.com complete');
  }

  const totalGames = (lichessNdjson ? lichessNdjson.split('\n').filter((l) => l.trim()).length : 0) + chessComGames.length;
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
