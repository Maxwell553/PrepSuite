import { describe, it, expect } from 'vitest';
import { parseChessComGames, parseLichessGames } from '../../src/pipeline/gameParser.js';

// ── Chess.com game helpers ─────────────────────────────────────────

function makeChessComGame(overrides: Record<string, unknown> = {}) {
  return {
    uuid: 'abc-123',
    white: { username: 'MagnusCarlsen', result: 'win' },
    black: { username: 'HikaruNakamura', result: 'checkmated' },
    eco: 'B90',
    pgn: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 1-0',
    end_time: 1700000000,
    time_control: '600',
    ...overrides,
  };
}

// ── Lichess game helpers ───────────────────────────────────────────

function makeLichessGame(overrides: Record<string, unknown> = {}) {
  return {
    id: 'Li1234abcd',
    status: 'mate',
    players: {
      white: { user: { name: 'DrNykterstein', id: 'drnykterstein' } },
      black: { user: { name: 'Firouzja2003', id: 'firouzja2003' } },
    },
    winner: 'white' as const,
    moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O',
    createdAt: 1700000000000,
    speed: 'blitz',
    opening: { eco: 'C84', name: 'Ruy Lopez: Closed' },
    ...overrides,
  };
}

function toLichessNdjson(...games: Record<string, unknown>[]): string {
  return games.map((g) => JSON.stringify(g)).join('\n');
}

// ── parseChessComGames ─────────────────────────────────────────────

describe('parseChessComGames', () => {
  it('parses a valid game with all fields', () => {
    const game = makeChessComGame();
    const result = parseChessComGames([game], 'MagnusCarlsen');

    expect(result).toHaveLength(1);
    const g = result[0];
    expect(g.id).toBe('abc-123');
    expect(g.source).toBe('chess.com');
    expect(g.white).toBe('MagnusCarlsen');
    expect(g.black).toBe('HikaruNakamura');
    expect(g.result).toBe('1-0');
    expect(g.eco).toBe('B90');
    expect(g.pgn).toContain('1. e4 c5');
    expect(g.timeControl).toBe('600');
    expect(g.chessComWhiteResult).toBe('win');
    expect(g.chessComBlackResult).toBe('checkmated');
    // end_time 1700000000 seconds → valid ISO date
    expect(g.playedAt).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it('maps white win results correctly', () => {
    // white.result = 'win'
    const g1 = parseChessComGames([makeChessComGame({ white: { username: 'W', result: 'win' }, black: { username: 'B', result: 'checkmated' } })], 'W');
    expect(g1[0].result).toBe('1-0');

    // black.result = 'resign'
    const g2 = parseChessComGames([makeChessComGame({ white: { username: 'W', result: 'win' }, black: { username: 'B', result: 'resign' } })], 'W');
    expect(g2[0].result).toBe('1-0');

    // black.result = 'timeout'
    const g3 = parseChessComGames([makeChessComGame({ white: { username: 'W', result: '' }, black: { username: 'B', result: 'timeout' } })], 'W');
    expect(g3[0].result).toBe('1-0');

    // black.result = 'abandoned'
    const g4 = parseChessComGames([makeChessComGame({ white: { username: 'W', result: '' }, black: { username: 'B', result: 'abandoned' } })], 'W');
    expect(g4[0].result).toBe('1-0');
  });

  it('maps black win results correctly', () => {
    // black.result = 'win'
    const g1 = parseChessComGames([makeChessComGame({ white: { username: 'W', result: 'checkmated' }, black: { username: 'B', result: 'win' } })], 'W');
    expect(g1[0].result).toBe('0-1');

    // white.result = 'resign'
    const g2 = parseChessComGames([makeChessComGame({ white: { username: 'W', result: 'resign' }, black: { username: 'B', result: 'win' } })], 'W');
    expect(g2[0].result).toBe('0-1');

    // white.result = 'timeout'
    const g3 = parseChessComGames([makeChessComGame({ white: { username: 'W', result: 'timeout' }, black: { username: 'B', result: '' } })], 'W');
    expect(g3[0].result).toBe('0-1');

    // white.result = 'abandoned'
    const g4 = parseChessComGames([makeChessComGame({ white: { username: 'W', result: 'abandoned' }, black: { username: 'B', result: '' } })], 'W');
    expect(g4[0].result).toBe('0-1');
  });

  it('maps draw results correctly', () => {
    const drawConditions = ['stalemate', 'agreed', 'repetition', 'insufficient', '50move'];

    for (const cond of drawConditions) {
      const games = parseChessComGames(
        [makeChessComGame({ white: { username: 'W', result: cond }, black: { username: 'B', result: cond } })],
        'W',
      );
      expect(games[0].result).toBe('1/2-1/2');
    }
  });

  it('extracts ECO from a plain code string', () => {
    const games = parseChessComGames([makeChessComGame({ eco: 'C65' })], 'W');
    expect(games[0].eco).toBe('C65');
  });

  it('extracts ECO from a Chess.com URL', () => {
    const games = parseChessComGames(
      [makeChessComGame({ eco: 'https://www.chess.com/openings/Sicilian-Defense-Najdorf-Variation/B90' })],
      'W',
    );
    expect(games[0].eco).toBe('B90');
  });

  it('returns "Unknown" for missing or invalid ECO', () => {
    const g1 = parseChessComGames([makeChessComGame({ eco: undefined })], 'W');
    expect(g1[0].eco).toBe('Unknown');

    const g2 = parseChessComGames([makeChessComGame({ eco: 'not-an-eco' })], 'W');
    expect(g2[0].eco).toBe('Unknown');
  });

  it('returns empty array for empty input', () => {
    const result = parseChessComGames([], 'anyone');
    expect(result).toEqual([]);
  });

  it('generates a random id when uuid is missing', () => {
    const games = parseChessComGames([makeChessComGame({ uuid: undefined })], 'W');
    expect(games[0].id).toBeTruthy();
    expect(typeof games[0].id).toBe('string');
  });

  it('defaults pgn to empty string when missing', () => {
    const games = parseChessComGames([makeChessComGame({ pgn: undefined })], 'W');
    expect(games[0].pgn).toBe('');
  });
});

// ── parseLichessGames ──────────────────────────────────────────────

describe('parseLichessGames', () => {
  it('parses a valid NDJSON line with all fields', () => {
    const ndjson = toLichessNdjson(makeLichessGame());
    const result = parseLichessGames(ndjson, 'DrNykterstein');

    expect(result).toHaveLength(1);
    const g = result[0];
    expect(g.id).toBe('Li1234abcd');
    expect(g.source).toBe('lichess');
    expect(g.white).toBe('DrNykterstein');
    expect(g.black).toBe('Firouzja2003');
    expect(g.result).toBe('1-0');
    expect(g.eco).toBe('C84');
    expect(g.openingName).toBe('Ruy Lopez: Closed');
    expect(g.timeControl).toBe('blitz');
    expect(g.lichessStatus).toBe('mate');
    expect(g.playedAt).toBe(new Date(1700000000000).toISOString());
    // PGN constructed from moves string
    expect(g.pgn).toContain('1. e4 e5');
  });

  it('records outoftime status for clock stats', () => {
    const ndjson = toLichessNdjson(
      makeLichessGame({ winner: 'white', status: 'outoftime' }),
    );
    const result = parseLichessGames(ndjson, 'X');
    expect(result[0].lichessStatus).toBe('outoftime');
    expect(result[0].result).toBe('1-0');
  });

  it('maps winner=white to 1-0', () => {
    const ndjson = toLichessNdjson(makeLichessGame({ winner: 'white' }));
    const result = parseLichessGames(ndjson, 'X');
    expect(result[0].result).toBe('1-0');
  });

  it('maps winner=black to 0-1', () => {
    const ndjson = toLichessNdjson(makeLichessGame({ winner: 'black' }));
    const result = parseLichessGames(ndjson, 'X');
    expect(result[0].result).toBe('0-1');
  });

  it('maps no winner (draw) to 1/2-1/2', () => {
    const game = makeLichessGame();
    delete (game as any).winner;
    const ndjson = toLichessNdjson(game);
    const result = parseLichessGames(ndjson, 'X');
    expect(result[0].result).toBe('1/2-1/2');
  });

  it('constructs PGN from moves string when pgn field is absent', () => {
    const game = makeLichessGame({ moves: 'd4 d5 c4 e6 Nc3 Nf6', pgn: undefined });
    const ndjson = toLichessNdjson(game);
    const result = parseLichessGames(ndjson, 'X');
    expect(result[0].pgn).toBe('1. d4 d5 2. c4 e6 3. Nc3 Nf6');
  });

  it('uses provided pgn field when available', () => {
    const fullPgn = '[Event "Rated Blitz"]\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0';
    const game = makeLichessGame({ pgn: fullPgn, moves: undefined });
    const ndjson = toLichessNdjson(game);
    const result = parseLichessGames(ndjson, 'X');
    // standardizePgnForBoard ensures a blank line between headers and movetext
    expect(result[0].pgn).toBe('[Event "Rated Blitz"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0');
  });

  it('parses multiple NDJSON lines', () => {
    const game1 = makeLichessGame({ id: 'game1', winner: 'white' });
    const game2 = makeLichessGame({ id: 'game2', winner: 'black' });
    const game3 = makeLichessGame({ id: 'game3' });
    delete (game3 as any).winner;
    const ndjson = toLichessNdjson(game1, game2, game3);
    const result = parseLichessGames(ndjson, 'X');

    expect(result).toHaveLength(3);
    expect(result[0].result).toBe('1-0');
    expect(result[1].result).toBe('0-1');
    expect(result[2].result).toBe('1/2-1/2');
  });

  it('returns empty array for empty string', () => {
    expect(parseLichessGames('', 'anyone')).toEqual([]);
  });

  it('skips blank lines in NDJSON', () => {
    const game = makeLichessGame();
    const ndjson = '\n' + JSON.stringify(game) + '\n\n';
    const result = parseLichessGames(ndjson, 'X');
    expect(result).toHaveLength(1);
  });

  it('falls back to Anonymous when player names are missing', () => {
    const game = makeLichessGame({ players: {} });
    const ndjson = toLichessNdjson(game);
    const result = parseLichessGames(ndjson, 'X');
    expect(result[0].white).toBe('Anonymous');
    expect(result[0].black).toBe('Anonymous');
  });

  it('skips malformed JSON lines without crashing', () => {
    const good = JSON.stringify(makeLichessGame({ id: 'good' }));
    const ndjson = good + '\n{bad json here\n' + good;
    const result = parseLichessGames(ndjson, 'X');
    // Should parse the two valid lines and skip the bad one
    expect(result).toHaveLength(2);
  });

  it('uses eco fallback when opening object is missing', () => {
    const game = makeLichessGame({ opening: undefined, eco: 'D35' });
    const ndjson = toLichessNdjson(game);
    const result = parseLichessGames(ndjson, 'X');
    expect(result[0].eco).toBe('D35');
  });

  it('returns Unknown eco when no opening info is present', () => {
    const game = makeLichessGame({ opening: undefined, eco: undefined });
    const ndjson = toLichessNdjson(game);
    const result = parseLichessGames(ndjson, 'X');
    expect(result[0].eco).toBe('Unknown');
  });
});
