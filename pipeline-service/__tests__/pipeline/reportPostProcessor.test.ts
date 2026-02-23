import { describe, it, expect } from 'vitest';
import { postProcessReport } from '../../src/pipeline/reportPostProcessor.js';
import type {
  ScoutingReport,
  ResolvedIdentity,
  OpeningStat,
  MoveSequence,
  GameData,
} from '../../src/lib/types.js';
import type { PostProcessOpts } from '../../src/pipeline/reportPostProcessor.js';

// ── Helpers ──

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

function makeMinimalReport(overrides?: Partial<ScoutingReport>): ScoutingReport {
  return {
    id: '',
    player: { name: '', platforms: {} },
    whiteOpenings: [],
    blackDefenses: [],
    strategicSummary: '',
    blackStrategicSummary: '',
    tacticalProfile: '',
    endgameReliability: '',
    timeControlInsights: '',
    strengths: [],
    weaknesses: [],
    specificVulnerability: '',
    tacticalRecommendation: '',
    preparationSummary: '',
    suggestedLines: [],
    repertoireReliability: 0,
    mostPlayedLines: { white: [], black: [] },
    lastUpdated: '',
    ...overrides,
  };
}

function makeOpts(overrides?: Partial<PostProcessOpts>): PostProcessOpts {
  return {
    identity: makeIdentity(),
    whiteStats: [],
    blackStats: [],
    moveSequences: { white: [], black: [] },
    allGames: [],
    ...overrides,
  };
}

describe('postProcessReport', () => {
  it('generates ID when missing', () => {
    const report = makeMinimalReport({ id: '' });
    const opts = makeOpts();

    const result = postProcessReport(report, opts);
    expect(result.id).toBeTruthy();
    expect(result.id.startsWith('report-')).toBe(true);
  });

  it('merges identity data into player', () => {
    const identity = makeIdentity();
    const report = makeMinimalReport();
    const opts = makeOpts({ identity });

    const result = postProcessReport(report, opts);

    expect(result.player.name).toBe('Test Player');
    expect(result.player.platforms.chessCom).toBe('testplayer');
    expect(result.player.platforms.lichess).toBe('testlichess');
    expect(result.player.currentRating).toBe(2200);
    expect(result.player.uscfRating).toBe(2100);
    expect(result.player.country).toBe('USA');
  });

  it('validates opening stats (clamps, fixes totals)', () => {
    const badStats: OpeningStat[] = [
      {
        name: 'Sicilian Defense',
        eco: 'B20',
        frequency: 2.0,
        winRate: 1.5,
        drawRate: 0.2,
        lossRate: 0.3,
        wins: 10.5,
        draws: 3.7,
        losses: 5.8,
        totalGames: 20,
        trend: 'stable',
      },
    ];

    const report = makeMinimalReport();
    const opts = makeOpts({ whiteStats: badStats });

    const result = postProcessReport(report, opts);
    const opening = result.whiteOpenings[0];

    // wins, draws, losses should be rounded to integers
    expect(Number.isInteger(opening.wins)).toBe(true);
    expect(Number.isInteger(opening.draws)).toBe(true);
    expect(Number.isInteger(opening.losses)).toBe(true);

    // winRate should be clamped to [0, 1]
    expect(opening.winRate).toBeGreaterThanOrEqual(0);
    expect(opening.winRate).toBeLessThanOrEqual(1);

    // frequency should be clamped to [0, 1]
    expect(opening.frequency).toBeGreaterThanOrEqual(0);
    expect(opening.frequency).toBeLessThanOrEqual(1);

    // totalGames should be at least wins + draws + losses
    expect(opening.totalGames).toBeGreaterThanOrEqual(opening.wins + opening.draws + opening.losses);
  });

  it('overrides with pipeline stats', () => {
    const pipelineWhiteStats: OpeningStat[] = [
      {
        name: 'Sicilian Defense',
        eco: 'B20',
        frequency: 0.4,
        winRate: 0.6,
        drawRate: 0.2,
        lossRate: 0.2,
        wins: 12,
        draws: 4,
        losses: 4,
        totalGames: 20,
        trend: 'increasing',
      },
      {
        name: 'French Defense',
        eco: 'C00',
        frequency: 0.3,
        winRate: 0.5,
        drawRate: 0.25,
        lossRate: 0.25,
        wins: 8,
        draws: 4,
        losses: 4,
        totalGames: 16,
        trend: 'stable',
      },
    ];

    // Report has different openings from Gemini
    const report = makeMinimalReport({
      whiteOpenings: [
        {
          name: 'Queens Gambit',
          eco: 'D00',
          frequency: 0.5,
          winRate: 0.7,
          drawRate: 0.15,
          lossRate: 0.15,
          wins: 14,
          draws: 3,
          losses: 3,
          totalGames: 20,
          trend: 'stable',
        },
      ],
    });

    const opts = makeOpts({ whiteStats: pipelineWhiteStats });
    const result = postProcessReport(report, opts);

    // Should have the 2 pipeline stats, not Gemini's single entry
    expect(result.whiteOpenings).toHaveLength(2);
    expect(result.whiteOpenings[0].name).toBe('Sicilian Defense');
    expect(result.whiteOpenings[1].name).toBe('French Defense');
  });

  it('sets defaults for missing fields', () => {
    const report = makeMinimalReport({
      strategicSummary: '',
      blackStrategicSummary: '',
      tacticalProfile: '',
      endgameReliability: '',
      timeControlInsights: '',
      specificVulnerability: '',
      tacticalRecommendation: '',
      preparationSummary: '',
    });

    const opts = makeOpts();
    const result = postProcessReport(report, opts);

    expect(result.strategicSummary).toBe('Analysis pending...');
    expect(result.blackStrategicSummary).toBe('Analysis pending...');
    expect(result.tacticalProfile).toBe('Analysis pending...');
    expect(result.endgameReliability).toBe('Analysis pending...');
    expect(result.timeControlInsights).toBe('Analysis pending...');
    expect(result.specificVulnerability).toBe('Analysis pending...');
    expect(result.tacticalRecommendation).toBe('Analysis pending...');
    expect(result.preparationSummary).toBe('Analysis pending...');
  });

  it('sets lastUpdated timestamp', () => {
    const report = makeMinimalReport();
    const opts = makeOpts();

    const before = Date.now();
    const result = postProcessReport(report, opts);
    const after = Date.now();

    const timestamp = new Date(result.lastUpdated).getTime();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
    // Verify it's a valid ISO string
    expect(result.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
