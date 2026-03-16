import { Chess } from 'chess.js';
import { fetchWithRetry } from '../lib/fetchWithRetry.js';
import { logger } from '../lib/logger.js';
import { standardizePgnForBoard } from './gameParser.js';
import { fetchLichessPgnBatch } from './lichess.js';
import type { GameData } from '../lib/types.js';

const USER_AGENT = 'PrepSuite-Pipeline/1.0';

/**
 * Validate that PGN can be loaded by chess.js.
 * Uses same approach as openingClassifier: try full PGN, then movetext with [White "?"][Black "?"] wrapper.
 * Accepts games with 0 moves (e.g. forfeit) — they can still be displayed at starting position.
 */
export function isValidPgn(pgn: string): boolean {
  if (!pgn || typeof pgn !== 'string' || pgn.trim().length < 5) return false;
  const tryLoad = (s: string): boolean => {
    try {
      const chess = new Chess();
      chess.loadPgn(s, { strict: false });
      return true; // chess.js returns undefined on success, throws on invalid
    } catch {
      return false;
    }
  };
  const standardized = standardizePgnForBoard(pgn);
  if (tryLoad(standardized)) return true;
  // OTB/some sources: movetext only or malformed headers — wrap like openingClassifier
  const movetext = standardized.includes('\n\n')
    ? standardized.split('\n\n').slice(1).join('\n\n').trim()
    : standardized.replace(/^[\s\S]*?\]\s*/, '').trim();
  if (movetext && /^[\d.]+\s*\./.test(movetext)) {
    return tryLoad(`[White "?"]\n[Black "?"]\n\n${movetext}`);
  }
  return false;
}

/**
 * Refetch PGN for a Chess.com game from the archive API.
 */
export async function refetchChessComPgn(
  username: string,
  gameId: string,
  playedAt: string,
): Promise<string | null> {
  if (!username || !gameId) return null;
  try {
    const date = new Date(playedAt);
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const archiveUrl = `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/${yyyy}/${mm}`;
    const res = await fetchWithRetry(archiveUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeoutMs: 10000,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { games?: { uuid?: string; pgn?: string }[] };
    const games = data.games || [];
    const match = games.find((g) => g.uuid === gameId);
    return match?.pgn ? standardizePgnForBoard(match.pgn) : null;
  } catch (err) {
    logger.warn({ err, username, gameId }, '[PgnValidator] Chess.com refetch failed');
    return null;
  }
}

/**
 * Refetch PGN for a Lichess game from the export API.
 */
export async function refetchLichessPgn(gameId: string): Promise<string | null> {
  if (!gameId) return null;
  try {
    const res = await fetchWithRetry('https://lichess.org/games/export/_ids', {
      method: 'POST',
      body: gameId,
      headers: { Accept: 'application/x-chess-pgn' },
      timeoutMs: 15000,
    });
    if (!res.ok) return null;
    const text = await res.text();
    const gameIdMatch = text.match(/\[GameId\s+"([^"]+)"\]/);
    if (!gameIdMatch) return null;
    return standardizePgnForBoard(text);
  } catch (err) {
    logger.warn({ err, gameId }, '[PgnValidator] Lichess refetch failed');
    return null;
  }
}

export interface ValidateAndRefetchResult {
  valid: GameData[];
  invalidCount: number;
}

/**
 * Validate and refetch PGN for games with missing/invalid notation.
 * Returns valid games and invalidCount so the caller can refetch to fill slots.
 */
export async function validateAndRefetchPgn(
  games: GameData[],
  chessComUsername: string,
  lichessUsername: string,
): Promise<ValidateAndRefetchResult> {
  const valid: GameData[] = [];
  const toRefetch: GameData[] = [];

  for (const g of games) {
    if (isValidPgn(g.pgn)) {
      valid.push(g);
      continue;
    }
    toRefetch.push(g);
  }

  if (toRefetch.length === 0) return { valid: games, invalidCount: 0 };

  logger.info(
    { total: games.length, toRefetch: toRefetch.length },
    '[PgnValidator] Refetching PGN for games with missing/invalid notation',
  );

  // Batch Lichess refetches (avoids 2000+ sequential requests)
  const lichessToRefetch = lichessUsername
    ? toRefetch.filter((g) => g.source === 'lichess')
    : [];
  if (lichessToRefetch.length > 0) {
    const lichessIds = lichessToRefetch.map((g) => g.id).filter(Boolean) as string[];
    const pgnMap = await fetchLichessPgnBatch(lichessIds);
    for (const g of lichessToRefetch) {
      const pgn = pgnMap.get(g.id);
      if (pgn && isValidPgn(pgn)) {
        g.pgn = standardizePgnForBoard(pgn);
        valid.push(g);
      }
    }
    const lichessFixed = lichessToRefetch.filter((g) => valid.includes(g)).length;
    logger.info({ lichessRefetched: lichessIds.length, lichessFixed }, '[PgnValidator] Lichess batch refetch complete');
  }

  // Chess.com and OTB: refetch one-by-one (no batch API)
  for (const g of toRefetch) {
    if (valid.includes(g)) continue; // Already fixed by Lichess batch
    let pgn: string | null = null;
    if (g.source === 'chess.com' && chessComUsername) {
      pgn = await refetchChessComPgn(chessComUsername, g.id, g.playedAt);
    }

    if (pgn && isValidPgn(pgn)) {
      g.pgn = pgn;
      valid.push(g);
    } else if (g.source === 'otb' && g.pgn && g.pgn.trim().length > 20) {
      valid.push(g);
    }
  }

  // invalidCount = how many we couldn't fix (slots to fill via refetching more games)
  const invalidCount = games.length - valid.length;
  return { valid, invalidCount };
}
