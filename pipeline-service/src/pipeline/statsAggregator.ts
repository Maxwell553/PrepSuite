/**
 * Opening statistics aggregation.
 * Ported from src/services/analysis.worker.ts lines 880-1062.
 */

import type { GameData, OpeningStat } from '../lib/types.js';
import { aggregateECO } from './openingClassifier.js';
import { logger } from '../lib/logger.js';

const MIN_GAMES = 10;

/** Strip variation details: "Sicilian Defense: Najdorf" → "Sicilian Defense" */
function getOpeningFamily(name: string): string {
  if (!name) return 'Unknown';
  const beforeColon = name.split(':')[0].trim();
  const beforeParen = beforeColon.split('(')[0].trim();
  return beforeParen || name;
}

/**
 * Generate opening statistics for one side (white or black).
 * Matches the existing browser-side algorithm exactly.
 */
export function generateStats(
  games: GameData[],
  targetUsername: string,
  side: 'white' | 'black',
): OpeningStat[] {
  const targetLower = targetUsername.toLowerCase().trim();

  const relevantGames = games.filter((g) => {
    if (side === 'white') return g.white.toLowerCase().trim() === targetLower;
    return g.black.toLowerCase().trim() === targetLower;
  });

  if (relevantGames.length === 0) {
    logger.info({ side, target: targetUsername }, '[Stats] No games found');
    return [];
  }

  const aggregatedStats: Record<
    string,
    {
      count: number;
      weightedCount: number;
      rawWins: number;
      rawDraws: number;
      rawLosses: number;
      lastPlayed: string;
    }
  > = {};

  for (const g of relevantGames) {
    const rawName =
      g.openingName ?? aggregateECO(g.eco || 'Unknown', g.pgn, side);
    const family = getOpeningFamily(rawName);

    if (!aggregatedStats[family]) {
      aggregatedStats[family] = {
        count: 0,
        weightedCount: 0,
        rawWins: 0,
        rawDraws: 0,
        rawLosses: 0,
        lastPlayed: g.playedAt,
      };
    }

    const s = aggregatedStats[family];
    s.count++;
    s.weightedCount += 1;

    // Win/loss/draw from target's perspective
    if (side === 'white') {
      if (g.result === '1-0') s.rawWins++;
      else if (g.result === '0-1') s.rawLosses++;
      else if (g.result === '1/2-1/2') s.rawDraws++;
    } else {
      if (g.result === '0-1') s.rawWins++;
      else if (g.result === '1-0') s.rawLosses++;
      else if (g.result === '1/2-1/2') s.rawDraws++;
    }

    if (new Date(g.playedAt) > new Date(s.lastPlayed)) {
      s.lastPlayed = g.playedAt;
    }
  }

  const totalWeighted = Object.values(aggregatedStats).reduce(
    (acc, s) => acc + s.weightedCount,
    0,
  );

  const filtered = Object.entries(aggregatedStats)
    .filter(([_, s]) => s.count >= MIN_GAMES)
    .map(([family, s]) => {
      const total = s.count;
      const winRate = total > 0 ? s.rawWins / total : 0;
      const drawRate = total > 0 ? s.rawDraws / total : 0;
      const lossRate = total > 0 ? s.rawLosses / total : 0;

      return {
        name: family,
        eco: family,
        frequency: totalWeighted > 0 ? s.weightedCount / totalWeighted : 0,
        winRate: Math.max(0, Math.min(1, winRate)),
        drawRate: Math.max(0, Math.min(1, drawRate)),
        lossRate: Math.max(0, Math.min(1, lossRate)),
        wins: s.rawWins,
        draws: s.rawDraws,
        losses: s.rawLosses,
        totalGames: total,
        trend: 'stable' as const,
      };
    })
    .sort((a, b) => b.frequency - a.frequency);

  logger.info(
    { side, relevantGames: relevantGames.length, openings: filtered.length },
    '[Stats] Generated',
  );

  return filtered;
}
