/**
 * Stratified game sampling for Stockfish analysis.
 * Selects a representative subset of games proportional to opening distribution.
 */

import type { GameData } from '../lib/types.js';

const DEFAULT_SAMPLE_SIZE = 80;

/**
 * Select a representative sample of games for engine analysis.
 * Groups by opening family, samples proportionally, ensures all openings are represented.
 */
export function sampleGamesForAnalysis(
  games: GameData[],
  targetCount: number = DEFAULT_SAMPLE_SIZE,
): GameData[] {
  // Only games with substantial PGN
  const eligible = games.filter((g) => g.pgn && g.pgn.trim().length > 20);
  if (eligible.length <= targetCount) return eligible;

  // Group by opening family
  const groups = new Map<string, GameData[]>();
  for (const game of eligible) {
    const key = getOpeningFamily(game.openingName || game.eco || 'Unknown');
    const list = groups.get(key) || [];
    list.push(game);
    groups.set(key, list);
  }

  // Sort each group by date (most recent first)
  for (const list of groups.values()) {
    list.sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
  }

  // Proportional allocation with minimum 1 per group
  const result: GameData[] = [];
  const entries = Array.from(groups.entries());
  let remaining = targetCount;

  // Ensure at least 1 game per opening
  for (const [_, list] of entries) {
    if (remaining <= 0) break;
    result.push(list[0]);
    remaining--;
  }

  // Distribute remaining proportionally
  if (remaining > 0) {
    const totalEligible = eligible.length;
    for (const [_, list] of entries) {
      if (remaining <= 0) break;
      const proportion = list.length / totalEligible;
      const extra = Math.max(0, Math.round(proportion * remaining));
      // Skip index 0 (already added), take up to `extra` more
      for (let i = 1; i <= extra && i < list.length; i++) {
        result.push(list[i]);
      }
    }
  }

  // If still under target, fill from the most recent games across all groups
  if (result.length < targetCount) {
    const taken = new Set(result.map((g) => g.id));
    const remaining2 = eligible
      .filter((g) => !taken.has(g.id))
      .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
    for (const game of remaining2) {
      if (result.length >= targetCount) break;
      result.push(game);
    }
  }

  return result.slice(0, targetCount);
}

function getOpeningFamily(name: string): string {
  if (!name) return 'Unknown';
  const beforeColon = name.split(':')[0].trim();
  const beforeParen = beforeColon.split('(')[0].trim();
  return beforeParen || name;
}
