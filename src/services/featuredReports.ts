/**
 * Fetch featured (pre-generated) reports for the landing page.
 * Reports are stored as JSON in public/featured-reports/ and can be viewed without signing in.
 */

import type { ScoutingReport } from '../types';

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

export async function getFeaturedReport(slug: string): Promise<ScoutingReport | null> {
  try {
    const res = await fetch(`${BASE}/${slug}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    return data as ScoutingReport;
  } catch {
    return null;
  }
}
