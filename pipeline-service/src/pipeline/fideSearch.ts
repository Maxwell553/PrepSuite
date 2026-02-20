import { searchFideByName as searchLocal } from '../lib/fideLocalDb.js';
import { logger } from '../lib/logger.js';
import { namesMatch } from './verification.js';

export interface FideSearchResult {
  fideId: string;
  name: string;
  federation: string;
  title: string;
  rating: number;
  birthYear: string;
}

/**
 * Search FIDE ratings database by player name.
 * Uses local FIDE rating list (standard_rating_list.txt).
 */
export async function searchFideByName(name: string): Promise<FideSearchResult[]> {
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

  // Count matching parts (bidirectional substring matching)
  let matchCount = 0;
  for (const sp of searchParts) {
    if (resultParts.some((rp) => rp.includes(sp) || sp.includes(rp))) {
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
 * Pick the best FIDE match from search results.
 * Returns the best match only if score >= 0.5 AND namesMatch(searchName, result.name).
 * ALWAYS rejects if the result name does not match the entered name (prevents wrong person).
 */
export function pickBestFideMatch(
  searchName: string,
  results: FideSearchResult[],
): FideSearchResult | null {
  if (results.length === 0) return null;

  let best: FideSearchResult | null = null;
  let bestScore = 0;

  for (const r of results) {
    const score = scoreFideMatch(searchName, r);
    if (score > bestScore && namesMatch(searchName, r.name)) {
      bestScore = score;
      best = r;
    }
  }

  if (bestScore >= 0.5 && best && namesMatch(searchName, best.name)) {
    logger.info({ name: best.name, fideId: best.fideId, score: bestScore }, '[FideSearch] Best match');
    return best;
  }

  if (best && !namesMatch(searchName, best.name)) {
    logger.info(
      { searchName, resultName: best.name, fideId: best.fideId },
      '[FideSearch] Rejecting: name does not match entered name',
    );
  } else {
    logger.info({ bestScore }, '[FideSearch] No match above threshold');
  }
  return null;
}
