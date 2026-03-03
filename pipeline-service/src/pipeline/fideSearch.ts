import { searchFideByName as searchLocal } from '../lib/fideLocalDb.js';
import { logger } from '../lib/logger.js';

export interface FideSearchResult {
  fideId: string;
  name: string;
  federation: string;
  title: string;
  rating: number;
  birthYear: string;
}

/** Known aliases for players with abbreviated names in FIDE DB (e.g. "Gukesh D" for Gukesh Dommaraju) */
const KNOWN_ALIASES: Record<string, string> = {
  'gukesh dommaraju': '46616543',
  'gukesh d': '46616543',
  dommaraju: '46616543',
};

/**
 * Search FIDE ratings database by player name.
 * Uses local FIDE rating list (standard_rating_list.txt).
 * Checks known aliases first for players with abbreviated FIDE names.
 */
export async function searchFideByName(name: string): Promise<FideSearchResult[]> {
  const norm = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const aliasId = KNOWN_ALIASES[norm] || KNOWN_ALIASES[norm.replace(/,/g, '')];
  if (aliasId) {
    const { getFideProfileById } = await import('../lib/fideLocalDb.js');
    const profile = getFideProfileById(aliasId);
    if (profile) {
      logger.info({ name, fideId: aliasId }, '[FideSearch] Resolved via known alias');
      return [
        {
          fideId: aliasId,
          name: profile.name,
          federation: profile.federation,
          title: profile.title,
          rating: profile.rating,
          birthYear: profile.birthYear ?? '',
        },
      ];
    }
  }
  logger.info({ name }, '[FideSearch] Searching FIDE by name (local DB)');
  return searchLocal(name);
}

/**
 * Parse FIDE AJAX search results HTML into structured results.
 * The response is an HTML fragment with a table using data-label attributes.
 *
 * Each result row contains:
 * - <td data-label="FIDEID">39907899</td>
 * - <a href=/profile/39907899 class="found_name">Ingargiola, Max</a>
 * - <img src="/svg/USA.svg" alt="USA">USA
 * - <td data-label="Rtg">1934</td>
 * - <td data-label="B-Year">2008</td>
 */
export function parseFideSearchResults(html: string): FideSearchResult[] {
  const results: FideSearchResult[] = [];

  // Match table rows containing player data
  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRegex) || [];

  for (const row of rows) {
    // Extract FIDE ID from data-label or profile link
    const idMatch =
      row.match(/data-label="FIDEID"[^>]*>(\d+)</) || row.match(/\/profile\/(\d+)/);
    if (!idMatch) continue;

    const fideId = idMatch[1];

    // Extract name from profile link (FIDE uses class="found_name", fixtures may use plain <a href="/profile/ID">Name</a>)
    const nameMatch =
      row.match(/class="found_name"[^>]*>([^<]+)</) || row.match(/href="?\/profile\/\d+"?[^>]*>([^<]+)</);
    const name = nameMatch ? nameMatch[1].trim() : '';
    if (!name) continue;

    // Extract federation from flag image alt or text, or plain <td>FED</td>
    const fedMatch =
      row.match(/<img[^>]*alt="([A-Z]{3})"/) ||
      row.match(/data-label="Fed"[^>]*>([A-Z]{3})</i) ||
      row.match(/<td[^>]*>([A-Z]{3})<\/td>/);
    const federation = fedMatch ? fedMatch[1] : '';

    // Extract title (GM, IM, FM, etc.) from data-label="title" cell or plain <td>GM</td>
    const titleMatch =
      row.match(
        /data-label="title"[^>]*>\s*(?:<[^>]*>)?\s*(GM|IM|FM|CM|WGM|WIM|WFM|WCM|NM|WNM)\s*(?:<|$)/i,
      ) || row.match(/<td[^>]*>\s*(GM|IM|FM|CM|WGM|WIM|WFM|WCM|NM|WNM)\s*<\/td>/i);
    const title = titleMatch ? titleMatch[1].toUpperCase() : '';

    // Extract standard rating from data-label="Rtg" or plain <td>2830</td>
    const ratingCells = row.match(/data-label="Rtg"[^>]*>(\d*)</gi) || [];
    let rating = 0;
    if (ratingCells.length > 0 && ratingCells[0]) {
      const ratingMatch = ratingCells[0].match(/(\d+)/);
      if (ratingMatch) rating = parseInt(ratingMatch[1]);
    }
    if (rating === 0) {
      const plainRating = row.match(/<td[^>]*>\s*(\d{4})\s*<\/td>/);
      if (plainRating) rating = parseInt(plainRating[1]);
    }

    // Extract birth year
    const birthYearMatch = row.match(/data-label="B-Year"[^>]*>(\d{4})</);
    const birthYear = birthYearMatch ? birthYearMatch[1] : '';

    results.push({ fideId, name, federation, title, rating, birthYear });
  }

  logger.info({ count: results.length }, '[FideSearch] Parsed results');
  return results;
}

/**
 * Score how well a FIDE search result matches the searched name.
 * Higher score = better match.
 */
/** @deprecated No longer used; FIDE matching now requires exact name match. */
export function scoreFideMatch(searchName: string, result: FideSearchResult): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const searchParts = normalize(searchName).split(' ').filter((p) => p.length > 0);
  const resultParts = normalize(result.name).split(' ').filter((p) => p.length > 0);

  if (searchParts.length === 0 || resultParts.length === 0) return 0;

  // Count matching parts; allow single-letter abbreviations (e.g. "D" matches "Dommaraju")
  let matchCount = 0;
  for (const sp of searchParts) {
    if (resultParts.some((rp) => {
      if (sp.length >= 3 && rp.length >= 3) return rp.includes(sp) || sp.includes(rp);
      if (sp.length <= 2 && rp.length > 2) return rp.startsWith(sp) || rp === sp;
      if (rp.length <= 2 && sp.length > 2) return sp.startsWith(rp) || sp === rp;
      return sp === rp;
    })) {
      matchCount++;
    }
  }

  // Score: fraction of search parts that match
  let score = matchCount / searchParts.length;

  // Bonus for exact full match
  if (normalize(searchName) === normalize(result.name)) {
    score += 0.5;
  }

  // Bonus for titled players (more likely to be the right person)
  if (result.title) {
    score += 0.1;
  }

  return score;
}

/**
 * Check if search name and FIDE result name match exactly.
 * Handles "Last, First" vs "First Last" format by comparing normalized part sets.
 * No fuzzy matching — prevents wrong-person matches (e.g. "David Mashkov" vs "Nunn, John D M").
 */
function fideNamesMatchExact(searchName: string, resultName: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const searchParts = new Set(normalize(searchName).split(' ').filter((p) => p.length > 0));
  const resultParts = new Set(
    normalize(resultName)
      .replace(/,/g, ' ')
      .split(' ')
      .filter((p) => p.length > 0),
  );

  if (searchParts.size === 0 || resultParts.size === 0) return false;
  if (searchParts.size !== resultParts.size) return false;

  for (const p of searchParts) {
    if (!resultParts.has(p)) return false;
  }
  return true;
}

/**
 * Pick the best FIDE match from search results.
 * Returns a match ONLY when the name matches exactly (same set of normalized parts).
 * Rejects fuzzy matches to prevent wrong-person results.
 */
export function pickBestFideMatch(
  searchName: string,
  results: FideSearchResult[],
): FideSearchResult | null {
  if (results.length === 0) return null;

  const exact = results.find((r) => fideNamesMatchExact(searchName, r.name));
  if (exact) {
    logger.info({ name: exact.name, fideId: exact.fideId }, '[FideSearch] Exact match');
    return exact;
  }

  logger.info(
    { searchName, candidates: results.slice(0, 3).map((r) => r.name) },
    '[FideSearch] No exact name match',
  );
  return null;
}
