import { describe, it, expect } from 'vitest';
import { buildReportPrompt, stratifiedSample, reportResponseSchema } from '../../src/pipeline/promptBuilder.js';
import type {
  ResolvedIdentity,
  GameData,
  OpeningStat,
  MoveSequence,
  GameAnalysis,
} from '../../src/lib/types.js';

// ── Helper factories ──

function makeIdentity(overrides?: Partial<ResolvedIdentity>): ResolvedIdentity {
  return {
    verifiedName: 'Test Player',
    fideId: '1234567',
    chessComUsername: 'testplayer',
    lichessUsername: 'testlichess',
    fideProfile: {
      name: 'Test Player',
      federation: 'USA',
      birthYear: '1990',
      rating: 2200,
      title: 'FM',
    },
    uscfProfile: {
      id: '12345678',
      name: 'Test Player',
      rating: 2100,
      state: 'CA',
    },
    confidence: 1.0,
    ...overrides,
  };
}

function makeGame(eco: string, source: 'chess.com' | 'lichess' = 'chess.com'): GameData {
  return {
    id: `game-${eco}-${Math.random().toString(36).substr(2, 6)}`,
    white: 'testplayer',
    black: 'opponent',
    result: '1-0',
    eco,
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7',
    playedAt: '2025-01-01',
    timeControl: '600',
    source,
  };
}

function makeOpeningStat(name: string, eco: string, totalGames: number): OpeningStat {
  const wins = Math.round(totalGames * 0.55);
  const draws = Math.round(totalGames * 0.2);
  const losses = totalGames - wins - draws;
  return {
    name,
    eco,
    frequency: 0.3,
    winRate: 0.55,
    drawRate: totalGames > 0 ? draws / totalGames : 0,
    lossRate: totalGames > 0 ? losses / totalGames : 0,
    wins,
    draws,
    losses,
    totalGames,
    trend: 'stable',
  };
}

describe('buildReportPrompt', () => {
  it('builds prompt with all data present', () => {
    const identity = makeIdentity();
    const games = Array.from({ length: 5 }, () => makeGame('B20'));
    const whiteStats = [makeOpeningStat('Sicilian Defense', 'B20', 20)];
    const blackStats = [makeOpeningStat('French Defense', 'C00', 15)];
    const moveSequences: { white: MoveSequence[]; black: MoveSequence[] } = {
      white: [{ moves: ['1. e4 e5 2. Nf3 Nc6'], notation: '1. e4 e5 2. Nf3 Nc6', frequency: 0.5, games: 10 }],
      black: [{ moves: ['1. e4 c5 2. Nf3 d6'], notation: '1. e4 c5 2. Nf3 d6', frequency: 0.3, games: 6 }],
    };
    const engineAnalysis: GameAnalysis[] = [];

    const prompt = buildReportPrompt({
      identity,
      allGames: games,
      whiteStats,
      blackStats,
      moveSequences,
      engineAnalysis,
      targetUsername: 'testplayer',
    });

    expect(prompt).toContain('Test Player');
    expect(prompt).toContain('AGGREGATED OPENING STATS');
    expect(prompt).toContain('MOST PLAYED LINES');
    expect(prompt).toContain('GAME METADATA SUMMARY');
    expect(prompt).not.toContain('STOCKFISH ENGINE ANALYSIS');
  });

  it('builds prompt with missing FIDE profile', () => {
    const identity = makeIdentity({ fideProfile: null });
    const games = [makeGame('B20')];
    const whiteStats = [makeOpeningStat('Sicilian Defense', 'B20', 20)];
    const blackStats: OpeningStat[] = [];
    const moveSequences = { white: [], black: [] };
    const engineAnalysis: GameAnalysis[] = [];

    const prompt = buildReportPrompt({
      identity,
      allGames: games,
      whiteStats,
      blackStats,
      moveSequences,
      engineAnalysis,
      targetUsername: 'testplayer',
    });

    expect(prompt).toContain('Not found');
  });

  it('builds prompt with engine analysis', () => {
    const identity = makeIdentity();
    const game = makeGame('B20');
    const games = [game];
    const whiteStats = [makeOpeningStat('Sicilian Defense', 'B20', 20)];
    const blackStats: OpeningStat[] = [];
    const moveSequences = { white: [], black: [] };
    const engineAnalysis: GameAnalysis[] = [
      {
        gameId: game.id,
        criticalMistakes: [
          { moveNumber: 10, move: 'Bxf7', evaluationBefore: 50, evaluationAfter: -200, mistakeSeverity: 250 },
          { moveNumber: 15, move: 'Nxe5', evaluationBefore: 0, evaluationAfter: -180, mistakeSeverity: 180 },
        ],
        averageEvaluation: 50,
        evaluationTrend: 'stable',
        endgameAccuracy: 75,
      },
    ];

    const prompt = buildReportPrompt({
      identity,
      allGames: games,
      whiteStats,
      blackStats,
      moveSequences,
      engineAnalysis,
      targetUsername: 'testplayer',
    });

    expect(prompt).toContain('STOCKFISH ENGINE ANALYSIS');
  });

  it('builds prompt with empty engine analysis', () => {
    const identity = makeIdentity();
    const games = [makeGame('B20')];
    const engineAnalysis: GameAnalysis[] = [];

    const prompt = buildReportPrompt({
      identity,
      allGames: games,
      whiteStats: [],
      blackStats: [],
      moveSequences: { white: [], black: [] },
      engineAnalysis,
      targetUsername: 'testplayer',
    });

    expect(prompt).not.toContain('STOCKFISH ENGINE ANALYSIS');
  });
});

describe('stratifiedSample', () => {
  it('returns all when under limit', () => {
    const games = [makeGame('B20'), makeGame('C00'), makeGame('D00')];
    const result = stratifiedSample(games, (g) => g.eco, 10);
    expect(result).toHaveLength(3);
  });

  it('caps at maxSize', () => {
    const ecos = ['B20', 'C00', 'D00', 'E00', 'A00'];
    const games: GameData[] = [];
    for (const eco of ecos) {
      for (let i = 0; i < 10; i++) {
        games.push(makeGame(eco));
      }
    }
    expect(games).toHaveLength(50);

    const result = stratifiedSample(games, (g) => g.eco, 10);
    expect(result).toHaveLength(10);
  });

  it('preserves opening diversity', () => {
    const ecos = ['B20', 'C00', 'D00', 'E00', 'A00'];
    const games: GameData[] = [];
    for (const eco of ecos) {
      for (let i = 0; i < 10; i++) {
        games.push(makeGame(eco));
      }
    }

    const result = stratifiedSample(games, (g) => g.eco, 10);
    const representedEcos = new Set(result.map((g) => g.eco));

    for (const eco of ecos) {
      expect(representedEcos.has(eco)).toBe(true);
    }
  });
});

describe('reportResponseSchema', () => {
  it('has required fields', () => {
    expect(Array.isArray(reportResponseSchema.required)).toBe(true);
    const required = reportResponseSchema.required;
    expect(required).toContain('id');
    expect(required).toContain('player');
    expect(required).toContain('whiteOpenings');
    expect(required).toContain('blackDefenses');
    expect(required).toContain('strengths');
    expect(required).toContain('weaknesses');
    expect(required).toContain('specificVulnerability');
    expect(required).toContain('tacticalRecommendation');
    expect(required).toContain('preparationSummary');
    expect(required).toContain('suggestedLines');
  });
});
