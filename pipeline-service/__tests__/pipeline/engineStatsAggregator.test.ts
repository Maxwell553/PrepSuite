import { describe, it, expect } from 'vitest';
import { aggregateEngineStats } from '../../src/pipeline/engineStatsAggregator.js';
import type { GameAnalysis, GameData } from '../../src/lib/types.js';

function makeGame(id: string, openingName?: string): GameData {
  return {
    id: `game-${id}`,
    white: 'testplayer',
    black: 'opponent',
    result: '1-0',
    eco: id,
    pgn: '1. e4 e5',
    playedAt: '2025-01-01',
    timeControl: '600',
    source: 'chess.com',
    openingName: openingName ?? `Opening ${id}`,
  };
}

describe('aggregateEngineStats', () => {
  it('returns null for empty engine analysis', () => {
    const result = aggregateEngineStats([], [makeGame('B20')], 'testplayer');
    expect(result).toBeNull();
  });

  it('builds mistake histogram from critical mistakes', () => {
    const game = makeGame('B20', 'Sicilian Defense');
    const analysis: GameAnalysis = {
      gameId: game.id,
      criticalMistakes: [
        { moveNumber: 5, move: 'Nf3', evaluationBefore: 0, evaluationAfter: -50, mistakeSeverity: 50 },
        { moveNumber: 15, move: 'Bxf7', evaluationBefore: 50, evaluationAfter: -200, mistakeSeverity: 250 },
        { moveNumber: 25, move: 'Nxe5', evaluationBefore: 0, evaluationAfter: -180, mistakeSeverity: 180 },
      ],
      averageEvaluation: 50,
      evaluationTrend: 'stable',
      endgameAccuracy: 80,
    };

    const result = aggregateEngineStats([analysis], [game], 'testplayer');
    expect(result).not.toBeNull();
    expect(result!.mistakeHistogram).toHaveLength(5);
    const bucket15 = result!.mistakeHistogram.find((b) => b.bucket === '11-20');
    const bucket25 = result!.mistakeHistogram.find((b) => b.bucket === '21-30');
    expect(bucket15?.count).toBe(1);
    expect(bucket25?.count).toBe(1);
  });

  it('computes avg eval by opening from player perspective (requires 10+ games)', () => {
    const games: GameData[] = [];
    const analyses: GameAnalysis[] = [];
    for (let i = 0; i < 10; i++) {
      const gw = makeGame(`B2${i}`, 'Sicilian Defense');
      const gb = makeGame(`C0${i}`, 'French Defense');
      gb.white = 'opponent';
      gb.black = 'testplayer';
      games.push(gw, gb);
      analyses.push(
        { gameId: gw.id, criticalMistakes: [], averageEvaluation: 100, evaluationTrend: 'stable', endgameAccuracy: 85 },
        { gameId: gb.id, criticalMistakes: [], averageEvaluation: 100, evaluationTrend: 'stable', endgameAccuracy: 75 },
      );
    }

    const result = aggregateEngineStats(analyses, games, 'testplayer');
    expect(result).not.toBeNull();
    const sicilian = result!.avgEvalByOpening.find(
      (e) => e.openingName.includes('Sicilian') && e.side === 'white',
    );
    const french = result!.avgEvalByOpening.find(
      (e) => e.openingName.includes('French') && e.side === 'black',
    );
    expect(sicilian?.avgEval).toBe(100);
    expect(french?.avgEval).toBe(-100);
    expect(sicilian?.games).toBe(10);
    expect(french?.games).toBe(10);
  });

  it('excludes openings with fewer than 10 games', () => {
    const game1 = makeGame('B20', 'Sicilian Defense');
    const game2 = makeGame('B21', 'Sicilian Defense');
    const result = aggregateEngineStats(
      [
        { gameId: game1.id, criticalMistakes: [], averageEvaluation: 100, evaluationTrend: 'stable', endgameAccuracy: 80 },
        { gameId: game2.id, criticalMistakes: [], averageEvaluation: 50, evaluationTrend: 'stable', endgameAccuracy: 80 },
      ],
      [game1, game2],
      'testplayer',
    );
    expect(result!.avgEvalByOpening).toHaveLength(0);
  });

  it('computes overall endgame accuracy', () => {
    const game1 = makeGame('B20');
    const game2 = makeGame('C00');
    const analyses: GameAnalysis[] = [
      {
        gameId: game1.id,
        criticalMistakes: [],
        averageEvaluation: 0,
        evaluationTrend: 'stable',
        endgameAccuracy: 80,
      },
      {
        gameId: game2.id,
        criticalMistakes: [],
        averageEvaluation: 0,
        evaluationTrend: 'stable',
        endgameAccuracy: 60,
      },
    ];

    const result = aggregateEngineStats(analyses, [game1, game2], 'testplayer');
    expect(result).not.toBeNull();
    expect(result!.endgameAccuracy).toBe(70);
  });
});
