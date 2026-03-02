import fs from 'node:fs';
import path from 'node:path';
import { loadFideRatingListFromFile, type ParsedFidePlayer } from './fideRatingListParser.js';
import { logger } from './logger.js';
import type { FideProfile } from './types.js';

export interface FideSearchResult {
  fideId: string;
  name: string;
  federation: string;
  title: string;
  rating: number;
  birthYear: string;
}

let playersById: Map<string, ParsedFidePlayer> | null = null;
let playersByName: ParsedFidePlayer[] | null = null;

/** FIDE rating list filename (lives in pipeline-service/) */
const FIDE_LIST_FILENAME = 'standard_rating_list.txt';

/**
 * Load FIDE rating list into memory. Call once at startup or lazily on first use.
 * Looks for pipeline-service/standard_rating_list.txt in both dev and prod.
 */
function ensureLoaded(): void {
  if (playersById && playersByName) return;

  const cwd = process.cwd();
  // Dev: cwd may be pipeline-service/ or project root. Prod: cwd is pipeline-service/ or /app
  const candidates = [
    path.join(cwd, FIDE_LIST_FILENAME), // pipeline-service/ when cwd is pipeline-service
    path.join(cwd, 'pipeline-service', FIDE_LIST_FILENAME), // project root
  ];
  const filePath = candidates.find((p) => fs.existsSync(p)) ?? candidates[0];

  try {
    const players = loadFideRatingListFromFile(filePath);
    playersById = new Map(players.map((p) => [p.fideId, p]));
    playersByName = players;
    logger.info({ count: players.length }, '[FideLocalDb] Loaded FIDE rating list');
  } catch (err) {
    logger.warn({ err, path: filePath }, '[FideLocalDb] Failed to load FIDE list, FIDE features disabled');
    playersById = new Map();
    playersByName = [];
  }
}

/**
 * Get FIDE profile by ID. Returns null if not found or DB not loaded.
 */
export function getFideProfileById(fideId: string): FideProfile | null {
  ensureLoaded();
  const p = playersById!.get(fideId.trim());
  if (!p) return null;
  return {
    name: p.name,
    federation: p.federation,
    birthYear: p.birthYear,
    rating: p.rating,
    title: p.title,
  };
}

function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Search FIDE players by name. Returns matches sorted by relevance.
 */
export function searchFideByName(name: string): FideSearchResult[] {
  ensureLoaded();
  const query = name.trim();
  if (!query) return [];

  const normQuery = normalizeForSearch(query);
  const queryParts = normQuery.split(' ').filter((p) => p.length > 0);
  if (queryParts.length === 0) return [];

  const results: FideSearchResult[] = [];

  for (const p of playersByName!) {
    const normName = normalizeForSearch(p.name);
    const nameParts = normName.split(' ').filter((x) => x.length > 0);

    let matchCount = 0;
    for (const qp of queryParts) {
      if (nameParts.some((np) => {
        if (qp.length >= 3 && np.length >= 3) return np.includes(qp) || qp.includes(np);
        if (qp.length <= 2 && np.length > 2) return np.startsWith(qp) || np === qp;
        if (np.length <= 2 && qp.length > 2) return qp.startsWith(np) || qp === np;
        return qp === np;
      })) {
        matchCount++;
      }
    }
    const score = matchCount / queryParts.length;
    if (score >= 0.5) {
      results.push({
        fideId: p.fideId,
        name: p.name,
        federation: p.federation,
        title: p.title,
        rating: p.rating,
        birthYear: p.birthYear,
      });
    }
  }

  // Sort by score (desc), then by rating (desc)
  results.sort((a, b) => {
    const scoreA = scoreMatch(query, a.name);
    const scoreB = scoreMatch(query, b.name);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return b.rating - a.rating;
  });

  return results.slice(0, 50);
}

function scoreMatch(searchName: string, resultName: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const searchParts = norm(searchName).split(' ').filter((p) => p.length > 0);
  const resultParts = norm(resultName).split(' ').filter((p) => p.length > 0);
  if (searchParts.length === 0 || resultParts.length === 0) return 0;
  let matchCount = 0;
  for (const sp of searchParts) {
    if (resultParts.some((rp) => {
      if (sp.length >= 3 && rp.length >= 3) return rp.includes(sp) || sp.includes(rp);
      if (sp.length <= 2 && rp.length > 2) return rp.startsWith(sp) || rp === sp;
      if (rp.length <= 2 && sp.length > 2) return sp.startsWith(rp) || sp === rp;
      return sp === rp;
    })) matchCount++;
  }
  let score = matchCount / searchParts.length;
  if (norm(searchName) === norm(resultName)) score += 0.5;
  return score;
}
