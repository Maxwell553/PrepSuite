/**
 * Compute move probability from opponent's repertoire for practice move history display.
 * Uses all games when available; falls back to mostPlayedLines (top 10 sequences).
 */

import type { MoveSequence } from '../types';
import type { ParsedGame } from './repertoireUtils';

function namesMatch(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return x === y || x.includes(y) || y.includes(x);
}

function normalizeSan(s: string): string {
  return s
    .replace(/[?!+#]$/, '')
    .replace(/^0-0$/, 'O-O')
    .replace(/^0-0-0$/, 'O-O-O')
    .toLowerCase();
}

/** Parse notation "1. e4 e5 2. Nf3" to ["e4", "e5", "Nf3"] */
function notationToMoves(notation: string): string[] {
  if (!notation || !notation.trim()) return [];
  return notation
    .replace(/\d+\.\s*/g, ' ')
    .split(/\s+/)
    .map((s) =>
      s
        .replace(/[?!+#]$/, '')
        .replace(/^0-0$/, 'O-O')
        .replace(/^0-0-0$/, 'O-O-O')
        .trim(),
    )
    .filter(
      (s) =>
        s.length >= 2 &&
        (s === 'O-O' ||
          s === 'O-O-O' ||
          /[a-h][1-8]/.test(s) ||
          /[NBRQK]/.test(s)),
    );
}

function getLineMoves(seq: MoveSequence): string[] {
  if (seq.notation) return notationToMoves(seq.notation);
  if (Array.isArray(seq.moves) && seq.moves.length > 0) {
    const first = seq.moves[0];
    return typeof first === 'string' && first.includes('.')
      ? notationToMoves(first)
      : (seq.moves as string[]);
  }
  return [];
}

export interface MoveProbabilityResult {
  /** Percentage 0–100, or null if deviation */
  pct: number | null;
  /** True when no repertoire data matches this position */
  isDeviation: boolean;
}

/**
 * Get probability from all games — simple iteration, exact string match (no indexing).
 */
function getMoveProbabilityFromGames(
  moveIndex: number,
  moveSan: string,
  history: string[],
  parsed: ParsedGame[],
  games: { white: string; black: string }[],
  identifiers: string[],
  opponentColor: 'white' | 'black',
): MoveProbabilityResult {
  let totalGames = 0;
  let gamesWithMove = 0;

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const p = parsed[i];
    if (!p || !g) continue;
    const isWhite = identifiers.some((id) => namesMatch(g.white, id));
    const isBlack = identifiers.some((id) => namesMatch(g.black, id));
    const hasSide = opponentColor === 'white' ? isWhite : isBlack;
    if (!hasSide || p.history.length <= moveIndex) continue;

    const gh = p.history;
    let match = true;
    for (let j = 0; j < moveIndex; j++) {
      if (normalizeSan(gh[j]) !== normalizeSan(history[j])) {
        match = false;
        break;
      }
    }
    if (!match) continue;

    totalGames++;
    if (normalizeSan(gh[moveIndex]) === normalizeSan(moveSan)) {
      gamesWithMove++;
    }
  }

  if (totalGames === 0) return { pct: null, isDeviation: true };
  return { pct: Math.round((gamesWithMove / totalGames) * 100), isDeviation: false };
}

/**
 * Get probability from mostPlayedLines (top 10 sequences).
 * Fallback when games aren't available.
 */
function getMoveProbabilityFromLines(
  moveIndex: number,
  moveSan: string,
  history: string[],
  mostPlayedLines: { white: MoveSequence[]; black: MoveSequence[] },
  opponentColor: 'white' | 'black',
): MoveProbabilityResult {
  const lines =
    opponentColor === 'white' ? mostPlayedLines.white : mostPlayedLines.black;
  if (!lines || lines.length === 0) {
    return { pct: null, isDeviation: true };
  }

  const hNorm = history.slice(0, moveIndex).map(normalizeSan);
  const moveNorm = normalizeSan(moveSan);

  let totalGames = 0;
  let gamesWithMove = 0;

  for (const seq of lines) {
    const lineMoves = getLineMoves(seq);
    if (lineMoves.length <= moveIndex) continue;

    const lNorm = lineMoves.map(normalizeSan);
    let match = true;
    for (let i = 0; i < hNorm.length; i++) {
      if (hNorm[i] !== lNorm[i]) {
        match = false;
        break;
      }
    }
    if (!match) continue;

    const games = seq.games ?? 0;
    totalGames += games;
    if (lNorm[moveIndex] === moveNorm) {
      gamesWithMove += games;
    }
  }

  if (totalGames === 0) {
    return { pct: null, isDeviation: true };
  }

  const pct = Math.round((gamesWithMove / totalGames) * 100);
  return { pct, isDeviation: false };
}

/**
 * Get probability that the opponent played this move based on their repertoire.
 * Uses all games when available; falls back to mostPlayedLines.
 */
export function getMoveProbability(
  moveIndex: number,
  moveSan: string,
  history: string[],
  mostPlayedLines: { white: MoveSequence[]; black: MoveSequence[] } | undefined,
  opponentColor: 'white' | 'black',
  parsedGames?: ParsedGame[] | null,
  games?: { white: string; black: string }[] | null,
  identifiers?: string[],
): MoveProbabilityResult {
  if (
    parsedGames?.length &&
    games?.length &&
    identifiers?.length &&
    parsedGames.length === games.length
  ) {
    const result = getMoveProbabilityFromGames(
      moveIndex,
      moveSan,
      history,
      parsedGames,
      games,
      identifiers,
      opponentColor,
    );
    if (!result.isDeviation) return result;
  }

  if (mostPlayedLines) {
    return getMoveProbabilityFromLines(
      moveIndex,
      moveSan,
      history,
      mostPlayedLines,
      opponentColor,
    );
  }
  return { pct: null, isDeviation: true };
}
