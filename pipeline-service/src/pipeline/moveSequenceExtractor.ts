/**
 * Move sequence extraction from PGN games.
 * Ported from src/services/moveSequenceExtractor.ts.
 */

import type { GameData, MoveSequence } from '../lib/types.js';

/** Parse PGN text into an array of individual moves */
export function parsePGNMoves(pgn: string): string[] {
  if (!pgn || pgn.trim().length === 0) return [];

  const cleanPgn = pgn
    .replace(/\{.*?\}/g, '')  // Remove comments
    .replace(/\[.*?\]/g, '')  // Remove metadata
    .replace(/[?!+#]/g, '')   // Remove annotations
    .trim();

  const moves: string[] = [];
  const moveSections = cleanPgn.split(/\d+\.\s*/);

  for (let i = 1; i < moveSections.length; i++) {
    const section = moveSections[i].trim();
    if (!section) continue;

    const tokens = section.split(/\s+/);
    for (const token of tokens) {
      if (!token || token.match(/^\d+$/) || token === '...') continue;
      if (
        token.match(
          /^([a-h][1-8](?:[a-h][1-8])?(?:=[QRBN])?|O-O(?:-O)?|[QRBNK][a-h1-8]?x?[a-h][1-8](?:=[QRBN])?|[a-h]x[a-h][1-8](?:=[QRBN])?|[QRBNK]x[a-h][1-8](?:=[QRBN])?)$/,
        )
      ) {
        moves.push(token);
      }
    }
  }

  return moves;
}

/** Format moves array into standard notation: "1. e4 e5 2. Nf3 Nc6" */
export function formatMoveSequence(moves: string[]): string {
  if (moves.length === 0) return '';

  const formatted: string[] = [];
  let num = 1;

  for (let i = 0; i < moves.length; i += 2) {
    const w = moves[i];
    const b = moves[i + 1];
    formatted.push(b ? `${num}. ${w} ${b}` : `${num}. ${w}`);
    num++;
  }

  return formatted.join(' ');
}

/**
 * Truncates a PGN to the first N moves (half-moves).
 * Preserves tag pairs and replaces the move text with truncated notation.
 */
export function truncatePGNToMoves(pgn: string, maxMoves: number): string {
  if (!pgn || pgn.trim().length === 0) return pgn;
  const moves = parsePGNMoves(pgn);
  if (moves.length <= maxMoves) return pgn;

  const lines = pgn.split('\n');
  const tagLines: string[] = [];
  let i = 0;
  while (i < lines.length && lines[i].trim().match(/^\[.*\]$/)) {
    tagLines.push(lines[i]);
    i++;
  }
  while (i < lines.length && !lines[i].trim()) i++;

  const truncatedMoves = moves.slice(0, maxMoves);
  const moveText = formatMoveSequence(truncatedMoves) + ' ...';
  return tagLines.join('\n') + '\n\n' + moveText;
}

/**
 * Extract the most-played opening move sequences, separated by color.
 */
export function extractMostPlayedLines(
  games: GameData[],
  targetUsername: string,
  maxSequences = 10,
  sequenceLength = 10,
): { white: MoveSequence[]; black: MoveSequence[] } {
  const targetLower = targetUsername.toLowerCase().trim();

  const whiteGames = games.filter(
    (g) => g.white.toLowerCase().trim() === targetLower && g.pgn,
  );
  const blackGames = games.filter(
    (g) => g.black.toLowerCase().trim() === targetLower && g.pgn,
  );

  function extractSequences(pool: GameData[]): MoveSequence[] {
    const seqMap = new Map<string, { moves: string[]; count: number }>();

    for (const game of pool) {
      const moves = parsePGNMoves(game.pgn);
      if (moves.length < sequenceLength) continue;

      const seq = moves.slice(0, sequenceLength);
      const key = seq.join(' ');
      const existing = seqMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        seqMap.set(key, { moves: seq, count: 1 });
      }
    }

    return Array.from(seqMap.values())
      .map(({ moves, count }) => {
        const notation = formatMoveSequence(moves);
        return {
          moves: [notation],
          notation,
          frequency: pool.length > 0 ? count / pool.length : 0,
          games: count,
        };
      })
      .sort((a, b) => b.games - a.games)
      .slice(0, maxSequences);
  }

  return {
    white: extractSequences(whiteGames),
    black: extractSequences(blackGames),
  };
}
