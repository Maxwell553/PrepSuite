/**
 * Fetch featured (pre-generated) reports for the landing page.
 * Reports are stored as JSON in public/featured-reports/ and can be viewed without signing in.
 * When a report has games but no timeManagement, we compute it client-side from PGN metadata.
 */

import type { ScoutingReport } from "../types";

const BASE = "/featured-reports";

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

export type FeaturedReport = ScoutingReport & {
  gameCount?: number;
  gamePages?: number;
  sampleSlug?: string;
};
export async function getFeaturedReport(
  slug: string,
): Promise<FeaturedReport | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    const res = await fetch(`${BASE}/${slug}-summary.json`);
    if (!res.ok) return null;
    return { ...(await res.json()), sampleSlug: slug };
  } catch {
    return null;
  }
}
export async function getFeaturedGames(
  slug: string,
  pages: number,
): Promise<ScoutingReport["games"]> {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Invalid sample");
  const games: ScoutingReport["games"] = [];
  // Bounded batches keep requests and parse work small.
  for (let i = 0; i < pages; i += 3) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(3, pages - i) }, async (_, n) => {
        const response = await fetch(`${BASE}/${slug}-games-${i + n}.json`);
        if (!response.ok) throw new Error("Could not load sample games");
        return response.json();
      }),
    );
    games.push(...batch.flat());
  }
  return games;
}
