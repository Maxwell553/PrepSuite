import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameData } from '../../src/lib/types.js';

vi.mock('../../src/pipeline/openingClassifier.js', () => ({
  aggregateECO: vi.fn((eco: string, _pgn?: string, _side?: string) => {
    const map: Record<string, string> = {
      B20: 'Sicilian Defense',
      B90: 'Sicilian Najdorf',
      C60: 'Ruy Lopez',
      C50: 'Italian Game',
      D30: "Queen's Gambit Declined",
      Unknown: 'Unknown',
    };
    return map[eco] ?? 'Unknown';
  }),
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { generateStats } from '../../src/pipeline/statsAggregator.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGame(overrides: Partial<GameData> & { white: string; black: string }): GameData {
  return {
    id: `game-${Math.random().toString(36).slice(2, 8)}`,
    source: 'chess.com',
    result: '1-0',
    eco: 'B20',
    pgn: '1. e4 c5 2. Nf3 d6',
    playedAt: '2025-06-01T00:00:00Z',
    timeControl: '600',
    openingName: undefined,
    ...overrides,
  };
}

/** Generate N games with a given opening family for the target player on a given side. */
function makeGamesForOpening(
  count: number,
  opts: {
    side: 'white' | 'black';
    target: string;
    openingName?: string;
    eco?: string;
    result?: string;
  },
): GameData[] {
  return Array.from({ length: count }, (_, i) =>
    makeGame({
      white: opts.side === 'white' ? opts.target : 'opponent',
      black: opts.side === 'black' ? opts.target : 'opponent',
      openingName: opts.openingName,
      eco: opts.eco ?? 'B20',
      result: opts.result ?? '1-0',
      playedAt: `2025-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateStats', () => {
  it('returns empty array when the games list is empty', () => {
    const result = generateStats([], 'player1', 'white');
    expect(result).toEqual([]);
  });

  it('returns empty array when no games match the target on the requested side', () => {
    const games = makeGamesForOpening(12, {
      side: 'white',
      target: 'player1',
      openingName: 'Sicilian Defense',
    });
    // Ask for black side stats — player1 played white in all these games
    const result = generateStats(games, 'player1', 'black');
    expect(result).toEqual([]);
  });

  it('computes white stats correctly for a single opening above MIN_GAMES', () => {
    const games = makeGamesForOpening(15, {
      side: 'white',
      target: 'MagnusCarlsen',
      openingName: 'Sicilian Defense',
      result: '1-0',
    });

    const result = generateStats(games, 'MagnusCarlsen', 'white');

    expect(result.length).toBe(1);
    const stat = result[0];
    expect(stat.name).toBe('Sicilian Defense');
    expect(stat.totalGames).toBe(15);
    expect(stat.wins).toBe(15);
    expect(stat.losses).toBe(0);
    expect(stat.draws).toBe(0);
    expect(stat.winRate).toBe(1);
    expect(stat.lossRate).toBe(0);
    expect(stat.drawRate).toBe(0);
    expect(stat.frequency).toBeCloseTo(1.0, 5);
  });

  it('computes black stats with inverted result perspective', () => {
    // When result is '1-0' and target is black, that is a loss for target
    const games = makeGamesForOpening(12, {
      side: 'black',
      target: 'Hikaru',
      openingName: 'Ruy Lopez',
      result: '1-0', // white wins => target (black) loses
    });

    const result = generateStats(games, 'Hikaru', 'black');

    expect(result.length).toBe(1);
    const stat = result[0];
    expect(stat.wins).toBe(0);
    expect(stat.losses).toBe(12);
    expect(stat.draws).toBe(0);
    expect(stat.winRate).toBe(0);
    expect(stat.lossRate).toBe(1);
  });

  it('counts wins, losses, and draws correctly for mixed results', () => {
    const wins = makeGamesForOpening(5, {
      side: 'white',
      target: 'player1',
      openingName: 'Italian Game',
      result: '1-0',
    });
    const losses = makeGamesForOpening(3, {
      side: 'white',
      target: 'player1',
      openingName: 'Italian Game',
      result: '0-1',
    });
    const draws = makeGamesForOpening(4, {
      side: 'white',
      target: 'player1',
      openingName: 'Italian Game',
      result: '1/2-1/2',
    });

    const games = [...wins, ...losses, ...draws]; // 12 total, passes MIN_GAMES
    const result = generateStats(games, 'player1', 'white');

    expect(result.length).toBe(1);
    const stat = result[0];
    expect(stat.totalGames).toBe(12);
    expect(stat.wins).toBe(5);
    expect(stat.losses).toBe(3);
    expect(stat.draws).toBe(4);
    expect(stat.winRate).toBeCloseTo(5 / 12, 5);
    expect(stat.lossRate).toBeCloseTo(3 / 12, 5);
    expect(stat.drawRate).toBeCloseTo(4 / 12, 5);
  });

  it('strips variation details after colon for opening family aggregation', () => {
    // "Sicilian Defense: Najdorf" and "Sicilian Defense: Dragon" both map to "Sicilian Defense"
    const najdorf = makeGamesForOpening(7, {
      side: 'white',
      target: 'player1',
      openingName: 'Sicilian Defense: Najdorf',
      result: '1-0',
    });
    const dragon = makeGamesForOpening(6, {
      side: 'white',
      target: 'player1',
      openingName: 'Sicilian Defense: Dragon',
      result: '0-1',
    });

    const games = [...najdorf, ...dragon]; // 13 total under "Sicilian Defense"
    const result = generateStats(games, 'player1', 'white');

    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Sicilian Defense');
    expect(result[0].totalGames).toBe(13);
    expect(result[0].wins).toBe(7);
    expect(result[0].losses).toBe(6);
  });

  it('filters out openings below MIN_GAMES (10) threshold', () => {
    // 15 games of Sicilian (above threshold)
    const sicilian = makeGamesForOpening(15, {
      side: 'white',
      target: 'player1',
      openingName: 'Sicilian Defense',
    });
    // 5 games of Ruy Lopez (below threshold)
    const ruyLopez = makeGamesForOpening(5, {
      side: 'white',
      target: 'player1',
      openingName: 'Ruy Lopez',
    });

    const games = [...sicilian, ...ruyLopez];
    const result = generateStats(games, 'player1', 'white');

    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Sicilian Defense');
    // Ruy Lopez should be filtered out
    expect(result.find((s) => s.name === 'Ruy Lopez')).toBeUndefined();
  });

  it('passes exactly MIN_GAMES (10) through the filter', () => {
    const games = makeGamesForOpening(10, {
      side: 'white',
      target: 'player1',
      openingName: 'French Defense',
    });

    const result = generateStats(games, 'player1', 'white');
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('French Defense');
    expect(result[0].totalGames).toBe(10);
  });

  it('frequency values sum to approximately 1.0 across multiple openings', () => {
    const sicilian = makeGamesForOpening(20, {
      side: 'white',
      target: 'player1',
      openingName: 'Sicilian Defense',
    });
    const italian = makeGamesForOpening(15, {
      side: 'white',
      target: 'player1',
      openingName: 'Italian Game',
    });
    const french = makeGamesForOpening(10, {
      side: 'white',
      target: 'player1',
      openingName: 'French Defense',
    });

    const games = [...sicilian, ...italian, ...french]; // 45 games total, all above threshold
    const result = generateStats(games, 'player1', 'white');

    expect(result.length).toBe(3);

    const totalFreq = result.reduce((sum, s) => sum + s.frequency, 0);
    // All games pass the filter, so frequencies should sum to 1.0
    expect(totalFreq).toBeCloseTo(1.0, 5);

    // Sicilian played most, should have highest frequency
    expect(result[0].name).toBe('Sicilian Defense');
    expect(result[0].frequency).toBeCloseTo(20 / 45, 5);
  });

  it('performs case-insensitive matching on target username', () => {
    const games = makeGamesForOpening(12, {
      side: 'white',
      target: 'MagnusCarlsen',
      openingName: 'Sicilian Defense',
    });

    // Query with different casing
    const result = generateStats(games, 'magnuscarlsen', 'white');
    expect(result.length).toBe(1);
    expect(result[0].totalGames).toBe(12);
  });

  it('uses aggregateECO fallback when openingName is not provided', () => {
    const games = makeGamesForOpening(11, {
      side: 'white',
      target: 'player1',
      eco: 'C60',
    });
    // openingName defaults to undefined in makeGamesForOpening, so aggregateECO should be used.
    // Our mock maps C60 -> 'Ruy Lopez'

    const result = generateStats(games, 'player1', 'white');
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Ruy Lopez');
  });

  it('sorts results by frequency descending', () => {
    const sicilian = makeGamesForOpening(30, {
      side: 'white',
      target: 'player1',
      openingName: 'Sicilian Defense',
    });
    const french = makeGamesForOpening(10, {
      side: 'white',
      target: 'player1',
      openingName: 'French Defense',
    });
    const italian = makeGamesForOpening(20, {
      side: 'white',
      target: 'player1',
      openingName: 'Italian Game',
    });

    const games = [...sicilian, ...french, ...italian];
    const result = generateStats(games, 'player1', 'white');

    expect(result.length).toBe(3);
    expect(result[0].name).toBe('Sicilian Defense');
    expect(result[1].name).toBe('Italian Game');
    expect(result[2].name).toBe('French Defense');
  });
});
