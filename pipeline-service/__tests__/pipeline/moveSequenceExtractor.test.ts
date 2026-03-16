import { describe, it, expect } from 'vitest';
import {
  parsePGNMoves,
  formatMoveSequence,
  extractMostPlayedLines,
} from '../../src/pipeline/moveSequenceExtractor.js';
import type { GameData } from '../../src/lib/types.js';

// ---------------------------------------------------------------------------
// parsePGNMoves
// ---------------------------------------------------------------------------
describe('parsePGNMoves', () => {
  it('parses standard PGN into moves array', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6';
    expect(parsePGNMoves(pgn)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('strips comments enclosed in curly braces', () => {
    const pgn = '1. e4 {good move} e5 2. Nf3 Nc6';
    expect(parsePGNMoves(pgn)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('strips annotation glyphs (!, ?, +, #)', () => {
    const pgn = '1. e4! e5? 2. Nf3+ Nc6#';
    expect(parsePGNMoves(pgn)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('returns an empty array for empty or whitespace-only input', () => {
    expect(parsePGNMoves('')).toEqual([]);
    expect(parsePGNMoves('   ')).toEqual([]);
  });

  it('handles castling notation (O-O and 0-0)', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. O-O Be7 5. d4 O-O';
    const moves = parsePGNMoves(pgn);
    expect(moves).toContain('O-O');
    const pgnZero = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. 0-0 Be7 5. d4 0-0';
    const movesZero = parsePGNMoves(pgnZero);
    expect(movesZero).toContain('0-0');
  });

  it('handles longer games with many moves', () => {
    const pgn =
      '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 Nbd7';
    const moves = parsePGNMoves(pgn);
    expect(moves.length).toBe(12);
    expect(moves[0]).toBe('d4');
    expect(moves[11]).toBe('Nbd7');
  });

  it('strips metadata in square brackets', () => {
    const pgn = '[Event "Test"] [Site "Internet"] 1. e4 e5 2. d4 d5';
    expect(parsePGNMoves(pgn)).toEqual(['e4', 'e5', 'd4', 'd5']);
  });
});

// ---------------------------------------------------------------------------
// formatMoveSequence
// ---------------------------------------------------------------------------
describe('formatMoveSequence', () => {
  it('formats an even number of moves with move numbers', () => {
    expect(formatMoveSequence(['e4', 'e5', 'Nf3', 'Nc6'])).toBe(
      '1. e4 e5 2. Nf3 Nc6',
    );
  });

  it('formats a single move', () => {
    expect(formatMoveSequence(['e4'])).toBe('1. e4');
  });

  it('returns empty string for empty array', () => {
    expect(formatMoveSequence([])).toBe('');
  });

  it('handles an odd number of moves (trailing white move)', () => {
    expect(formatMoveSequence(['e4', 'e5', 'Nf3'])).toBe(
      '1. e4 e5 2. Nf3',
    );
  });
});

// ---------------------------------------------------------------------------
// extractMostPlayedLines
// ---------------------------------------------------------------------------

/** Helper to build a GameData fixture */
function makeGame(
  overrides: Partial<GameData> & { white: string; black: string; pgn: string },
): GameData {
  return {
    id: overrides.id ?? `game-${Math.random().toString(36).slice(2, 8)}`,
    source: overrides.source ?? 'chess.com',
    white: overrides.white,
    black: overrides.black,
    result: overrides.result ?? '1-0',
    eco: overrides.eco ?? 'B00',
    pgn: overrides.pgn,
    playedAt: overrides.playedAt ?? '2025-01-15T12:00:00Z',
    timeControl: overrides.timeControl ?? '600',
  };
}

// PGNs with at least 16 half-moves for default sequenceLength
const ITALIAN_PGN =
  '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4 7. Nc3 Nxe4 8. O-O Bxc3 9. bxc3';
const SICILIAN_PGN =
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7';

describe('extractMostPlayedLines', () => {
  it('separates games by color for the target player', () => {
    const games: GameData[] = [
      makeGame({ white: 'Player1', black: 'Opponent', pgn: ITALIAN_PGN }),
      makeGame({ white: 'Opponent', black: 'Player1', pgn: SICILIAN_PGN }),
    ];

    const result = extractMostPlayedLines(games, 'Player1');
    expect(result.white.length).toBe(1);
    expect(result.black.length).toBe(1);
  });

  it('groups duplicate move sequences and calculates frequency', () => {
    const games: GameData[] = [
      makeGame({ id: 'g1', white: 'Player1', black: 'Opp', pgn: ITALIAN_PGN }),
      makeGame({ id: 'g2', white: 'Player1', black: 'Opp', pgn: ITALIAN_PGN }),
      makeGame({ id: 'g3', white: 'Player1', black: 'Opp', pgn: SICILIAN_PGN }),
    ];

    const result = extractMostPlayedLines(games, 'Player1');
    // All three are white games; Italian appears twice, Sicilian once
    expect(result.white.length).toBe(2);

    // Sorted by games descending, so Italian first
    const italian = result.white[0];
    expect(italian.games).toBe(2);
    expect(italian.frequency).toBeCloseTo(2 / 3);

    const sicilian = result.white[1];
    expect(sicilian.games).toBe(1);
    expect(sicilian.frequency).toBeCloseTo(1 / 3);
  });

  it('performs case-insensitive username matching', () => {
    const games: GameData[] = [
      makeGame({ white: 'PLAYER1', black: 'Opp', pgn: ITALIAN_PGN }),
      makeGame({ white: 'player1', black: 'Opp', pgn: ITALIAN_PGN }),
    ];

    const result = extractMostPlayedLines(games, 'Player1');
    expect(result.white.length).toBe(1);
    expect(result.white[0].games).toBe(2);
  });

  it('returns empty arrays when no games match', () => {
    const games: GameData[] = [
      makeGame({ white: 'Other', black: 'Another', pgn: ITALIAN_PGN }),
    ];

    const result = extractMostPlayedLines(games, 'Player1');
    expect(result.white).toEqual([]);
    expect(result.black).toEqual([]);
  });

  it('skips games whose PGN has fewer moves than sequenceLength', () => {
    const shortPgn = '1. e4 e5 2. Nf3 Nc6'; // only 4 half-moves
    const games: GameData[] = [
      makeGame({ white: 'Player1', black: 'Opp', pgn: shortPgn }),
      makeGame({ white: 'Player1', black: 'Opp', pgn: ITALIAN_PGN }),
    ];

    const result = extractMostPlayedLines(games, 'Player1');
    // Only the Italian game should be counted
    expect(result.white.length).toBe(1);
    expect(result.white[0].games).toBe(1);
  });

  it('respects the maxSequences parameter', () => {
    // Create 15 distinct openings for white (need 16+ half-moves for default sequenceLength)
    const games: GameData[] = [];
    for (let i = 0; i < 15; i++) {
      const suffix = ` 6. Be3 e${i % 8 === 5 ? '6' : String(i % 8)} 7. Qd2 O-O`;
      const pgn =
        '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6' + suffix;
      games.push(
        makeGame({ id: `g${i}`, white: 'Player1', black: 'Opp', pgn }),
      );
    }

    const result = extractMostPlayedLines(games, 'Player1', 5);
    expect(result.white.length).toBeLessThanOrEqual(5);
  });

  it('includes correct notation in each MoveSequence result', () => {
    const games: GameData[] = [
      makeGame({ white: 'Player1', black: 'Opp', pgn: ITALIAN_PGN }),
    ];

    const result = extractMostPlayedLines(games, 'Player1');
    const seq = result.white[0];

    // notation should be the formatted first 16 half-moves (default sequenceLength)
    expect(seq.notation).toBe(
      formatMoveSequence(parsePGNMoves(ITALIAN_PGN).slice(0, 16)),
    );
    // moves array should contain the notation string
    expect(seq.moves).toEqual([seq.notation]);
  });
});
