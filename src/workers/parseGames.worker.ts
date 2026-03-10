/**
 * Web Worker: parse PGN games into move histories.
 * Offloads parsing from main thread for older reports without pre-computed history.
 */

import { Chess } from 'chess.js';
import { loadPgn } from '../lib/pgnUtils';
import type { GameData } from '../types';

export type ParsedResult = { history: string[]; game: GameData } | null;

self.onmessage = (e: MessageEvent<{ games: GameData[] }>) => {
  const { games } = e.data;
  const results: ParsedResult[] = games.map((g) => {
    if (!g?.pgn || g.pgn.trim().length < 10) return null;
    const chess = loadPgn(g.pgn, Chess);
    return chess ? { history: chess.history(), game: g } : null;
  });
  self.postMessage({ results });
};
