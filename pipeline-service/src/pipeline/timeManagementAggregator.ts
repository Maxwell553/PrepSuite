/**
 * Aggregates flag / time-loss stats from Chess.com and Lichess game metadata.
 */

import type { GameData, TimeManagementStats, WinLossByType } from '../lib/types.js';

type EndType = 'resignation' | 'onTime' | 'checkmate' | 'other';

function isTimeoutStatusLichess(s: string | undefined): boolean {
  if (!s) return false;
  const x = s.toLowerCase();
  return x === 'outoftime' || x === 'timeout';
}

/** Whether the named player lost on time in this online game (null = not applicable / unknown). */
export function playerLostOnTime(g: GameData, targetUsername: string): boolean | null {
  const tl = targetUsername.toLowerCase().trim();
  const w = g.white.toLowerCase().trim();
  const b = g.black.toLowerCase().trim();
  const isWhite = w === tl;
  const isBlack = b === tl;
  if (!isWhite && !isBlack) return null;

  if (g.source === 'chess.com') {
    if (isWhite) return g.chessComWhiteResult === 'timeout';
    return g.chessComBlackResult === 'timeout';
  }

  if (g.source === 'lichess') {
    if (!isTimeoutStatusLichess(g.lichessStatus)) return false;
    if (g.result === '1-0') return isBlack;
    if (g.result === '0-1') return isWhite;
    return false;
  }

  return null;
}

export function playerWonOnTime(g: GameData, targetUsername: string): boolean | null {
  const tl = targetUsername.toLowerCase().trim();
  const w = g.white.toLowerCase().trim();
  const b = g.black.toLowerCase().trim();
  const isWhite = w === tl;
  const isBlack = b === tl;
  if (!isWhite && !isBlack) return null;

  if (g.source === 'chess.com') {
    if (isWhite) return g.chessComBlackResult === 'timeout';
    return g.chessComWhiteResult === 'timeout';
  }

  if (g.source === 'lichess') {
    if (!isTimeoutStatusLichess(g.lichessStatus)) return false;
    if (g.result === '1-0') return isWhite;
    if (g.result === '0-1') return isBlack;
    return false;
  }

  return null;
}

function monthKey(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(key: string): string {
  if (key === 'unknown') return '?';
  const parts = key.split('-');
  const y = parts[0];
  const m = parts[1];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mi = parseInt(m ?? '1', 10) - 1;
  if (mi < 0 || mi > 11) return key;
  return `${monthNames[mi]} ${y}`;
}

/** Classify how a decisive game ended for the target player (win or loss). Returns null for draws/unknown. */
function getEndType(g: GameData, targetUsername: string, targetWon: boolean): EndType | null {
  const tl = targetUsername.toLowerCase().trim();
  const isWhite = g.white.toLowerCase().trim() === tl;
  const isBlack = g.black.toLowerCase().trim() === tl;
  if (!isWhite && !isBlack) return null;
  if (g.source !== 'chess.com' && g.source !== 'lichess') return null;

  if (g.source === 'chess.com') {
    const wRes = (g.chessComWhiteResult || '').toLowerCase();
    const bRes = (g.chessComBlackResult || '').toLowerCase();
    if (targetWon) {
      const loserRes = isWhite ? bRes : wRes;
      if (loserRes === 'timeout') return 'onTime';
      if (loserRes === 'resign') return 'resignation';
      if (loserRes === 'checkmated') return 'checkmate';
      if (loserRes === 'abandoned') return 'onTime';
      return 'other';
    } else {
      const loserRes = isWhite ? wRes : bRes;
      if (loserRes === 'timeout') return 'onTime';
      if (loserRes === 'resign') return 'resignation';
      if (loserRes === 'checkmated') return 'checkmate';
      if (loserRes === 'abandoned') return 'onTime';
      return 'other';
    }
  }

  if (g.source === 'lichess') {
    const s = (g.lichessStatus || '').toLowerCase();
    if (s === 'outoftime' || s === 'timeout') return 'onTime';
    if (s === 'resign') return 'resignation';
    if (s === 'mate') return 'checkmate';
    return 'other';
  }

  return null;
}

function countOnlineLosses(games: GameData[], targetUsername: string): number {
  const tl = targetUsername.toLowerCase().trim();
  return games.filter((g) => {
    if (g.source !== 'chess.com' && g.source !== 'lichess') return false;
    const isWhite = g.white.toLowerCase().trim() === tl;
    const isBlack = g.black.toLowerCase().trim() === tl;
    if (isWhite && g.result === '0-1') return true;
    if (isBlack && g.result === '1-0') return true;
    return false;
  }).length;
}

function hasEndMetadata(g: GameData): boolean {
  if (g.source === 'chess.com') {
    return !!(g.chessComWhiteResult && g.chessComBlackResult);
  }
  if (g.source === 'lichess') {
    return !!g.lichessStatus;
  }
  return false;
}

/** Map raw time control to speed category (bullet/blitz/rapid/classical/correspondence) to avoid duplicate rows. */
function getSpeedCategory(tc: string | undefined, source?: string): string {
  const src = (source || '').toLowerCase();
  if (src === 'otb') return 'classical';
  const s = (tc || '').toLowerCase().trim();
  if (s.includes('correspondence')) return 'correspondence';
  if (s.includes('bullet')) return 'bullet';
  if (s.includes('blitz')) return 'blitz';
  if (s.includes('rapid')) return 'rapid';
  if (s.includes('classical')) return 'classical';
  const numMatch = s.match(/(\d+)/);
  if (!numMatch) return 'unknown';
  const num = parseInt(numMatch[1], 10);
  const baseSeconds = num >= 60 && num <= 3600 ? num : num * 60;
  if (baseSeconds < 180) return 'bullet';
  if (baseSeconds < 600) return 'blitz';
  if (baseSeconds < 3600) return 'rapid';
  return 'classical';
}

/**
 * Build time-management stats for online games only (Chess.com / Lichess).
 */
export function computeTimeManagementStats(
  games: GameData[],
  targetUsername: string,
): TimeManagementStats | undefined {
  if (!targetUsername.trim()) return undefined;

  const online = games.filter((g) => g.source === 'chess.com' || g.source === 'lichess');
  if (online.length === 0) return undefined;

  let lostOnTime = 0;
  let wonOnTime = 0;
  const bySpeed = new Map<string, { games: number; lostOnTime: number; wonOnTime: number }>();
  const byMonth = new Map<string, { games: number; lostOnTime: number; wonOnTime: number }>();

  for (const g of online) {
    const lost = playerLostOnTime(g, targetUsername);
    const won = playerWonOnTime(g, targetUsername);
    const speed = getSpeedCategory(g.timeControl, g.source);

    if (!bySpeed.has(speed)) {
      bySpeed.set(speed, { games: 0, lostOnTime: 0, wonOnTime: 0 });
    }
    const speedRow = bySpeed.get(speed)!;
    speedRow.games += 1;

    const mk = monthKey(g.playedAt);
    if (!byMonth.has(mk)) {
      byMonth.set(mk, { games: 0, lostOnTime: 0, wonOnTime: 0 });
    }
    const monthRow = byMonth.get(mk)!;
    monthRow.games += 1;

    if (lost === true) {
      lostOnTime += 1;
      speedRow.lostOnTime += 1;
      monthRow.lostOnTime += 1;
    }
    if (won === true) {
      wonOnTime += 1;
      speedRow.wonOnTime += 1;
      monthRow.wonOnTime += 1;
    }
  }

  const gamesWithEndMetadata = online.filter(hasEndMetadata).length;
  const totalLosses = countOnlineLosses(online, targetUsername);
  const lostOnTimeShareOfLosses = totalLosses > 0 ? lostOnTime / totalLosses : 0;
  const flagTotal = lostOnTime + wonOnTime;
  const lostOnTimeShareAmongFlagDecisive = flagTotal > 0 ? lostOnTime / flagTotal : undefined;

  const timeline = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-18)
    .map(([key, row]) => ({
      period: formatMonthLabel(key),
      games: row.games,
      lostOnTime: row.lostOnTime,
      wonOnTime: row.wonOnTime,
    }));

  const bySpeedList = Array.from(bySpeed.entries())
    .map(([speed, row]) => ({ speed, ...row }))
    .sort((a, b) => b.games - a.games);

  const winsByType: WinLossByType = { resignation: 0, onTime: 0, checkmate: 0, other: 0 };
  const lossesByType: WinLossByType = { resignation: 0, onTime: 0, checkmate: 0, other: 0 };

  for (const g of online) {
    const tl = targetUsername.toLowerCase().trim();
    const isWhite = g.white.toLowerCase().trim() === tl;
    const isBlack = g.black.toLowerCase().trim() === tl;
    if (!isWhite && !isBlack) continue;
    if (g.result === '1/2-1/2') continue;

    const targetWon = (g.result === '1-0' && isWhite) || (g.result === '0-1' && isBlack);
    const endType = getEndType(g, targetUsername, targetWon);
    if (endType) {
      if (targetWon) winsByType[endType] += 1;
      else lossesByType[endType] += 1;
    }
  }

  return {
    onlineGames: online.length,
    gamesWithEndMetadata,
    lostOnTime,
    wonOnTime,
    lostOnTimeShareOfLosses,
    lostOnTimeShareAmongFlagDecisive,
    bySpeed: bySpeedList,
    timeline,
    winsByType,
    lossesByType,
  };
}
