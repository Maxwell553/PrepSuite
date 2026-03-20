import { fetchWithRetry } from '../lib/fetchWithRetry.js';
import { logger } from '../lib/logger.js';

const BASE_URL = 'https://lichess.org/api';
const EXPORT_URL = 'https://lichess.org/games/export/_ids';
const GAMES_PER_REQUEST = 500;
const EXPORT_BATCH_SIZE = 300;

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
  const seenIds = new Set<string>();
  /** Oldest `createdAt` in the last batch — required so the next request is not a duplicate of the first page */
  let untilMs: number | undefined;

  try {
    for (let i = 0; i < numRequests && allLines.length < targetGames; i++) {
      const maxGames = Math.min(GAMES_PER_REQUEST, targetGames - allLines.length);
      const params = new URLSearchParams({
        max: String(maxGames),
        opening: 'true',
        // moves=true required for full PGN (repertoire board, move parsing); moves=false returns truncated PGN
        moves: 'true',
        pgnInJson: 'true',
      });
      if (untilMs !== undefined) {
        params.set('until', String(untilMs));
      }
      const url = `${BASE_URL}/games/user/${encodeURIComponent(username)}?${params.toString()}`;

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

      let added = 0;
      for (const line of lines) {
        let skip = false;
        try {
          const id = (JSON.parse(line) as { id?: string }).id;
          if (id) {
            if (seenIds.has(id)) {
              skip = true;
            } else {
              seenIds.add(id);
            }
          }
        } catch {
          /* keep unparsable lines (rare) */
        }
        if (skip) continue;
        allLines.push(line);
        added++;
        if (allLines.length >= targetGames) break;
      }

      if (lines.length > 0 && added === 0) {
        logger.warn({ batch: i + 1 }, '[Lichess] No new unique games in batch; stopping pagination');
        break;
      }

      if (onProgress) {
        onProgress(allLines.length, targetGames);
      }

      const lastLine = lines[lines.length - 1];
      let oldestCreated: number | undefined;
      try {
        oldestCreated = (JSON.parse(lastLine) as { createdAt?: number }).createdAt;
      } catch {
        oldestCreated = undefined;
      }

      logger.info(
        { batch: i + 1, batchSize: lines.length, uniqueAdded: added, total: allLines.length },
        '[Lichess] Batch complete',
      );

      if (lines.length < maxGames) break;
      if (typeof oldestCreated !== 'number') break;
      untilMs = oldestCreated;

      // Brief pause between batches to avoid rate limits (Lichess: one request at a time)
      if (allLines.length < targetGames) {
        await new Promise((r) => setTimeout(r, 150));
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

/**
 * Parse multi-game PGN from Lichess export API.
 * Returns a map of gameId -> full PGN string.
 */
function parseMultiGamePgn(pgnText: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!pgnText || !pgnText.trim()) return map;

  // Games are separated by blank line(s). Each game has [GameId "xxx"] header.
  const gameBlocks = pgnText.split(/\n\n(?=\[Event )/);
  for (const block of gameBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const gameIdMatch = trimmed.match(/\[GameId\s+"([^"]+)"\]/);
    if (gameIdMatch) {
      map.set(gameIdMatch[1], trimmed);
    }
  }
  return map;
}

/**
 * Fetch PGN for Lichess games via the export API.
 * Returns standard PGN format (same as Chess.com) for reliable board display.
 * Batches up to 300 IDs per request.
 */
export async function fetchLichessPgnBatch(
  gameIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (gameIds.length === 0) return result;

  const batches: string[][] = [];
  for (let i = 0; i < gameIds.length; i += EXPORT_BATCH_SIZE) {
    batches.push(gameIds.slice(i, i + EXPORT_BATCH_SIZE));
  }

  for (let b = 0; b < batches.length; b++) {
    const ids = batches[b];
    const body = ids.join(',');
    let success = false;
    for (let attempt = 0; attempt <= 3 && !success; attempt++) {
      try {
        const res = await fetchWithRetry(EXPORT_URL, {
          method: 'POST',
          body,
          headers: { Accept: 'application/x-chess-pgn' },
          timeoutMs: 60000,
          retries: 1,
          delayMs: 3000,
        });
        if (res.status === 429) {
          logger.warn({ batch: b + 1, attempt }, '[Lichess] Rate limited (429), waiting 60s before retry');
          await new Promise((r) => setTimeout(r, 60000));
          continue;
        }
        if (!res.ok) {
          logger.warn({ status: res.status, batch: b + 1 }, '[Lichess] PGN export batch failed');
          break;
        }
        const text = await res.text();
        const parsed = parseMultiGamePgn(text);
        for (const [id, pgn] of parsed) {
          result.set(id, pgn);
        }
        logger.info(
          { batch: b + 1, requested: ids.length, received: parsed.size },
          '[Lichess] PGN export batch complete',
        );
        success = true;
      } catch (err) {
        logger.warn({ err, batch: b + 1, attempt }, '[Lichess] PGN export failed');
        if (attempt < 3) await new Promise((r) => setTimeout(r, 60000));
      }
    }
    // Delay between batches to avoid rate limits (Lichess: one request at a time)
    if (b < batches.length - 1) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  return result;
}
