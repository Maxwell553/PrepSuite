/**
 * Fetch featured (pre-generated) reports for the landing page.
 * Reports are stored as JSON in public/featured-reports/ and can be viewed without signing in.
 * When a report has games but no timeManagement, we compute it client-side from PGN metadata.
 */

import type { ScoutingReport } from '../types';
import { computeTimeManagementFromGames } from '../lib/timeManagementClient';

const BASE = '/featured-reports';

export interface FeaturedReportMeta {
  slug: string;
  name: string;
  title?: string;
  federation?: string;
  rating?: number;
}

export async function getFeaturedReportList(): Promise<FeaturedReportMeta[]> {
  const res = await fetch(`${BASE}/index.json`);
  if (!res.ok) return [];
  return res.json();
}

/** Normalize name for matching: "Carlsen, Magnus" and "MagnusCarlsen" both become "carlsenmagnus". */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .split('')
    .sort()
    .join('');
}

/** Resolve target username for time management (player name as it appears in games). */
function resolveTargetUsername(report: ScoutingReport): string {
  const games = report.games ?? [];
  const candidates = [
    report.player.platforms?.chessCom,
    report.player.platforms?.lichess,
    (report.player as { actualUsername?: string }).actualUsername,
    report.player.name,
  ].filter(Boolean) as string[];

  if (candidates.length === 0) return report.player.name || '';
  if (games.length === 0) return candidates[0];

  // Count matches: use the GAME's white/black as key so we return the exact string from games.
  const counts = new Map<string, number>();

  for (const g of games) {
    const w = (g.white ?? '').trim();
    const b = (g.black ?? '').trim();
    const wLower = w.toLowerCase();
    const bLower = b.toLowerCase();
    let matched: string | null = null;
    for (const c of candidates) {
      const cLower = c.toLowerCase().trim();
      if (wLower === cLower || bLower === cLower || wLower.includes(cLower) || cLower.includes(wLower) || bLower.includes(cLower) || cLower.includes(bLower)) {
        matched = wLower === cLower || wLower.includes(cLower) || cLower.includes(wLower) ? w : b;
        break;
      }
      if (normalizeForMatch(c) === normalizeForMatch(w) || normalizeForMatch(c) === normalizeForMatch(b)) {
        matched = normalizeForMatch(c) === normalizeForMatch(w) ? w : b;
        break;
      }
    }
    if (matched) {
      counts.set(matched, (counts.get(matched) ?? 0) + 1);
    }
  }

  let best = candidates[0];
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  if (bestCount > 0) return best;

  const playerNorm = normalizeForMatch(report.player.name || '');
  const gameNameCounts = new Map<string, number>();
  for (const g of games) {
    const w = (g.white ?? '').trim();
    const b = (g.black ?? '').trim();
    if (w) gameNameCounts.set(w, (gameNameCounts.get(w) ?? 0) + 1);
    if (b) gameNameCounts.set(b, (gameNameCounts.get(b) ?? 0) + 1);
  }
  for (const [name, count] of gameNameCounts) {
    if (count > bestCount && normalizeForMatch(name) === playerNorm) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

export async function getFeaturedReport(slug: string): Promise<ScoutingReport | null> {
  try {
    const res = await fetch(`${BASE}/${slug}.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as ScoutingReport;

    // Compute time management client-side when report has games and either no timeManagement
    // or timeManagement lacks winsByType/lossesByType (e.g. pre-generated before those fields existed)
    const hasGames = data.games && data.games.length > 0;
    const needsWinsLossesByType =
      !data.timeManagement?.winsByType || !data.timeManagement?.lossesByType;
    if (hasGames && (!data.timeManagement || needsWinsLossesByType)) {
      const targetUsername = resolveTargetUsername(data);
      const tm = computeTimeManagementFromGames(data.games, targetUsername);
      if (tm) {
        data.timeManagement = { ...data.timeManagement, ...tm };
      }
    }

    return data;
  } catch {
    return null;
  }
}
