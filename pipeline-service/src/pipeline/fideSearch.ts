import { fetchWithRetry } from '../lib/fetchWithRetry.js';
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
 * Uses the AJAX search endpoint that FIDE's own UI calls.
 * Returns candidate matches sorted by relevance.
 */
export async function searchFideByName(name: string): Promise<FideSearchResult[]> {
  const query = encodeURIComponent(name.trim());
  const url = `https://ratings.fide.com/incl_search_l.php?search=${query}&simple=1`;

  logger.info({ name, url }, '[FideSearch] Searching FIDE by name');

  try {
    const res = await fetchWithRetry(url, {
      timeoutMs: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://ratings.fide.com/',
      },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, '[FideSearch] Search request failed');
      return [];
    }

    const html = await res.text();
    return parseFideSearchResults(html);
  } catch (err) {
    logger.warn({ err, name }, '[FideSearch] Search failed');
    return [];
  }
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

    // Extract name from profile link
    const nameMatch = row.match(/class="found_name"[^>]*>([^<]+)</);
    const name = nameMatch ? nameMatch[1].trim() : '';
    if (!name) continue;

    // Extract federation from flag image alt or text
    const fedMatch = row.match(/<img[^>]*alt="([A-Z]{3})"/) || row.match(/>([A-Z]{3})<\/td>/);
    const federation = fedMatch ? fedMatch[1] : '';

    // Extract title (GM, IM, FM, etc.) from data-label="title" cell
    const titleMatch = row.match(
      /data-label="title"[^>]*>\s*(?:<[^>]*>)?\s*(GM|IM|FM|CM|WGM|WIM|WFM|WCM|NM|WNM)\s*(?:<|$)/i,
    );
    const title = titleMatch ? titleMatch[1].toUpperCase() : '';

    // Extract standard rating
    const ratingCells = row.match(/data-label="Rtg"[^>]*>(\d*)</g) || [];
    let rating = 0;
    if (ratingCells.length > 0 && ratingCells[0]) {
      const ratingMatch = ratingCells[0].match(/(\d+)/);
      if (ratingMatch) rating = parseInt(ratingMatch[1]);
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
