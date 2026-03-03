/**
 * Client-side opening stats aggregation from games.
 * Used to split repertoire by source (online vs OTB) when both are present.
 */

import type { GameData, OpeningStat } from '../types';

/** Canonical opening names: avoid duplicates like "King's Indian" vs "King's Indian Defense" */
const OPENING_ALIASES: Record<string, string> = {
  Sicilian: 'Sicilian Defense',
  'Sicilian Defence': 'Sicilian Defense',
  Italian: 'Italian Game',
  French: 'French Defense',
  'French Defence': 'French Defense',
  Caro: 'Caro-Kann Defense',
  'Caro-Kann': 'Caro-Kann Defense',
  'Caro Kann': 'Caro-Kann Defense',
  Pirc: 'Pirc Defense',
  Scandinavian: 'Scandinavian Defense',
  'Scandinavian Defence': 'Scandinavian Defense',
  Modern: 'Modern Defense',
  "Queen's Gambit": "Queen's Gambit Declined",
  'Queens Gambit': "Queen's Gambit Declined",
  QGD: "Queen's Gambit Declined",
  QGA: "Queen's Gambit Accepted",
  "King's Indian": "King's Indian Defense",
  'Kings Indian': "King's Indian Defense",
  KID: "King's Indian Defense",
  "Queen's Indian": "Queen's Indian Defense",
  'Queens Indian': "Queen's Indian Defense",
  'Nimzo-Indian': 'Nimzo-Indian Defense',
  Nimzo: 'Nimzo-Indian Defense',
  Grunfeld: 'Grunfeld Defense',
  Benoni: 'Benoni Defense',
  Ruy: 'Ruy Lopez',
  Petrov: 'Petrov Defense',
  Scotch: 'Scotch Game',
  Catalan: 'Catalan Opening',
  English: 'English Opening',
  Dutch: 'Dutch Defense',
  Slav: 'Slav Defense',
};

function getOpeningFamily(name: string): string {
  if (!name) return 'Unknown';
  const beforeColon = name.split(':')[0].trim();
  const beforeParen = beforeColon.split('(')[0].trim();
  const base = beforeParen || name;
  const canonical = OPENING_ALIASES[base];
  if (canonical) return canonical;
  const lower = base.toLowerCase();
  const entry = Object.entries(OPENING_ALIASES).find(([k]) => k.toLowerCase() === lower);
  return entry ? entry[1] : base;
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
    // Match if: 2+ parts match, or single-word match, or first-name + initial (e.g. "Gukesh D" vs "Gukesh Dommaraju")
    const firstPartMatch = nameParts[0] && targetParts.some((tp) => partsMatch(nameParts[0], tp));
    const secondPartInitial = nameParts.length === 2 && nameParts[1].length <= 2 && targetParts.some(
      (tp) => tp.length >= 3 && tp.startsWith(nameParts[1]),
    );
    return (
      matchingCount >= Math.min(2, nameParts.length) ||
      (nameParts.length === 1 && targetParts.some((tp) => partsMatch(nameParts[0], tp))) ||
      (firstPartMatch && (matchingCount >= 1 || secondPartInitial))
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
