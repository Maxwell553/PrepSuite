import { describe, it, expect } from 'vitest';
import { isValidPgn } from '../../src/pipeline/pgnValidator.js';

describe('isValidPgn', () => {
  it('accepts standard PGN with moves', () => {
    const pgn = `[Event "Rated Blitz"]
[White "player1"]
[Black "player2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0`;
    expect(isValidPgn(pgn)).toBe(true);
  });

  it('accepts PGN with numeric castling (0-0)', () => {
    const pgn = `[White "?"][Black "?"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. 0-0 Be7`;
    expect(isValidPgn(pgn)).toBe(true);
  });

  it('accepts movetext-only format (OTB style)', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6';
    expect(isValidPgn(pgn)).toBe(true);
  });

  it('accepts minimal PGN with result only', () => {
    const pgn = `[White "A"][Black "B"]

1-0`;
    expect(isValidPgn(pgn)).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidPgn('')).toBe(false);
  });

  it('rejects too short string', () => {
    expect(isValidPgn('1. e')).toBe(false);
  });

  it('rejects invalid movetext', () => {
    expect(isValidPgn('not chess moves at all xyz')).toBe(false);
  });
});
