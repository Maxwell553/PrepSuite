/**
 * Aggregate Stockfish GameAnalysis into compact stats for the report UI.
 * No LLM calls — computed from engine output.
 */

import type { GameAnalysis, GameData } from '../lib/types.js';

const MOVE_BUCKETS = [
  { label: '1-10', min: 1, max: 10 },
  { label: '11-20', min: 11, max: 20 },
  { label: '21-30', min: 21, max: 30 },
  { label: '31-40', min: 31, max: 40 },
  { label: '41+', min: 41, max: 999 },
];

export interface EngineStats {
  /** Mistake counts by move range */
  mistakeHistogram: { bucket: string; count: number }[];
  /** Average centipawn evaluation per opening (from player's perspective) */
  avgEvalByOpening: {
    openingName: string;
    side: 'white' | 'black';
    avgEval: number;
    games: number;
  }[];
  /** Overall endgame accuracy 0-100 */
  endgameAccuracy: number;
}

export function aggregateEngineStats(
  engineAnalysis: GameAnalysis[],
  allGames: GameData[],
  targetUsername: string,
): EngineStats | null {
  if (engineAnalysis.length === 0) return null;

  const gameMap = new Map(allGames.map((g) => [g.id, g]));
  const targetLower = targetUsername.toLowerCase().trim();

  // Mistake histogram
  const buckets = new Map<string, number>();
  MOVE_BUCKETS.forEach((b) => {
    buckets.set(b.label, 0);
  });

  for (const a of engineAnalysis) {
    for (const m of a.criticalMistakes) {
      const bucket = MOVE_BUCKETS.find(
        (b) => m.moveNumber >= b.min && m.moveNumber <= b.max,
      );
      if (bucket) {
        buckets.set(bucket.label, (buckets.get(bucket.label) ?? 0) + 1);
      }
    }
  }

  const mistakeHistogram = MOVE_BUCKETS.map((b) => ({
    bucket: b.label,
    count: buckets.get(b.label) ?? 0,
  }));

  // Avg eval by opening (from player's perspective: positive = good for them)
  const byOpening: Record<
    string,
    { sum: number; count: number; side: 'white' | 'black' }
  > = {};

  for (const a of engineAnalysis) {
    const game = gameMap.get(a.gameId);
    if (!game) continue;
    const openingKey = (game.openingName || game.eco || 'Unknown')
      .split(/[-:]/)[0]
      .trim();
    const isTargetWhite =
      game.white.toLowerCase().trim() === targetLower;
    const side: 'white' | 'black' = isTargetWhite ? 'white' : 'black';
    const evalFromPlayerPerspective = isTargetWhite
      ? a.averageEvaluation
      : -a.averageEvaluation;
    const key = `${openingKey}|${side}`;
    if (!byOpening[key]) {
      byOpening[key] = { sum: 0, count: 0, side };
    }
    byOpening[key].sum += evalFromPlayerPerspective;
    byOpening[key].count += 1;
  }

  const avgEvalByOpening = Object.entries(byOpening)
    .filter(([, v]) => v.count >= 10)
    .map(([key, v]) => {
      const [openingName] = key.split('|');
      return {
        openingName,
        side: v.side,
        avgEval: v.sum / v.count,
        games: v.count,
      };
    })
    .sort((a, b) => b.games - a.games)
    .slice(0, 10);

  // Endgame accuracy
  const totalAccuracy = engineAnalysis.reduce(
    (s, a) => s + a.endgameAccuracy,
    0,
  );
  const endgameAccuracy =
    engineAnalysis.length > 0 ? totalAccuracy / engineAnalysis.length : 0;

  return {
    mistakeHistogram,
    avgEvalByOpening,
    endgameAccuracy: Math.round(endgameAccuracy),
  };
}
