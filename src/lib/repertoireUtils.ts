import { Chess } from 'chess.js';
import { GameData } from '../types';
import { loadPgn } from './pgnUtils';

/** Pre-parsed game: history only. Avoids repeated PGN parsing. */
export type ParsedGame = { history: string[]; game: GameData } | null;

/** Parse all games once. Returns array of { history, game } or null for invalid. */
export function parseGameHistories(games: GameData[]): ParsedGame[] {
  return games.map((g) => {
    if (!g?.pgn || g.pgn.trim().length < 10) return null;
    const chess = loadPgn(g.pgn, Chess);
    return chess ? { history: chess.history(), game: g } : null;
  });
}
