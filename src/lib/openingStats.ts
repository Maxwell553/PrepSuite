/**
 * Client-side opening stats aggregation from games.
 * Used to split repertoire by source (online vs OTB) when both are present.
 */

import type { GameData, OpeningStat } from '../types';

function getOpeningFamily(name: string): string {
  if (!name) return 'Unknown';
  const beforeColon = name.split(':')[0].trim();
  const beforeParen = beforeColon.split('(')[0].trim();
  return beforeParen || name;
}

/** Normalize name for matching (handles "Last, First" and "First Last" formats) */
function normalizeName(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((p) => p.length > 0);
}

function namesMatch(name: string, targets: string[]): boolean {
  const nameParts = normalizeName(name);
  if (nameParts.length === 0) return false;
  return targets.some((t) => {
    const targetParts = normalizeName(t);
    if (targetParts.length === 0) return false;
    const partsMatch = (a: string, b: string) => {
      if (a.length < 3 || b.length < 3) return a === b;
      return a.includes(b) || b.includes(a);
    };
    const matchingCount = nameParts.filter((np) =>
      targetParts.some((tp) => partsMatch(np, tp)),
    ).length;
    return (
      matchingCount >= Math.min(2, nameParts.length) ||
      (nameParts.length === 1 && targetParts.some((tp) => partsMatch(nameParts[0], tp)))
    );
  });
}

function aggregateOpenings(
  games: GameData[],
  targetNames: string[],
  side: 'white' | 'black',
): OpeningStat[] {
  const relevantGames = games.filter((g) => {
    if (side === 'white') return namesMatch(g.white, targetNames);
    return namesMatch(g.black, targetNames);
  });

  if (relevantGames.length === 0) return [];

  const aggregated: Record<
    string,
    { wins: number; draws: number; losses: number }
  > = {};

  for (const g of relevantGames) {
    const rawName = g.openingName ?? g.eco ?? 'Unknown';
    const family = getOpeningFamily(rawName);

    if (!aggregated[family]) {
      aggregated[family] = { wins: 0, draws: 0, losses: 0 };
    }
    const s = aggregated[family];

    if (side === 'white') {
      if (g.result === '1-0') s.wins++;
      else if (g.result === '0-1') s.losses++;
      else if (g.result === '1/2-1/2') s.draws++;
    } else {
      if (g.result === '0-1') s.wins++;
      else if (g.result === '1-0') s.losses++;
      else if (g.result === '1/2-1/2') s.draws++;
    }
  }

  const totalGames = relevantGames.length;
  return Object.entries(aggregated)
    .map(([name, s]) => {
      const total = s.wins + s.draws + s.losses;
      const winRate = total > 0 ? s.wins / total : 0;
      return {
        name,
        eco: name,
        frequency: total / totalGames,
        winRate,
        drawRate: total > 0 ? s.draws / total : 0,
        lossRate: total > 0 ? s.losses / total : 0,
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
        totalGames: total,
        trend: 'stable' as const,
      };
    })
    .sort((a, b) => b.totalGames - a.totalGames);
}

export interface OpeningsBySource {
  online: { white: OpeningStat[]; black: OpeningStat[] };
  otb: { white: OpeningStat[]; black: OpeningStat[] };
}

export function aggregateOpeningsBySource(
  games: GameData[],
  targetNames: string[],
): OpeningsBySource {
  const onlineGames = games.filter(
    (g) => g.source === 'lichess' || g.source === 'chess.com',
  );
  const otbGames = games.filter((g) => g.source === 'otb');

  return {
    online: {
      white: aggregateOpenings(onlineGames, targetNames, 'white'),
      black: aggregateOpenings(onlineGames, targetNames, 'black'),
    },
    otb: {
      white: aggregateOpenings(otbGames, targetNames, 'white'),
      black: aggregateOpenings(otbGames, targetNames, 'black'),
    },
  };
}
