import { fetchWithRetry } from '../lib/fetchWithRetry.js';
import { logger } from '../lib/logger.js';
import type { UscfProfile } from '../lib/types.js';

export interface UscfSearchResult {
  uscfId: string;
  name: string;
  state: string;
  rating: number;
}

/**
 * Search USCF by player name using MSA thin2.php form POST.
 * Splits input into first/last name and returns matching results.
 */
export async function searchUscfByName(name: string): Promise<UscfSearchResult[]> {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return [];

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];

  logger.info({ firstName, lastName }, '[UscfSearch] Searching by name');

  try {
    const body = new URLSearchParams({
      memfn: firstName,
      memln: lastName,
      memstate: '',
      mode: 'Search',
    });

    // POST form to thin2.php search endpoint
    const postRes = await fetch('https://www.uschess.org/msa/thin2.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(10000),
    });

    if (!postRes.ok) return [];

    const html = await postRes.text();
    return parseUscfSearchResults(html);
  } catch (err) {
    logger.warn({ err, name }, '[UscfSearch] Search failed');
    return [];
  }
}

/**
 * Parse thin2.php search results HTML.
 * Results are in a table after the search form:
 *   <td>15588925</td><td>MAX INGARGIOLA</td><td>CT 2027-01-31 2149*</td>
 */
function parseUscfSearchResults(html: string): UscfSearchResult[] {
  const results: UscfSearchResult[] = [];

  // Find rows after "Search Again" button (results table)
  const resultsSection = html.split('Search Again')[1];
  if (!resultsSection) return [];

  // Match table rows with USCF IDs (8-digit numbers)
  const rowRegex = /<tr[^>]*>\s*<td[^>]*>\s*(\d{7,8})\s*<\/td>\s*<td[^>]*>\s*([^<]+)<\/td>\s*<td[^>]*>\s*([^<]*)<\/td>/gi;
  let match;

  while ((match = rowRegex.exec(resultsSection)) !== null) {
    const uscfId = match[1].trim();
    const name = match[2].trim();
    const meta = match[3].trim();

    // Parse "CT 2027-01-31 2149*"
    const stateParts = meta.match(/^([A-Z]{2})\s/);
    const state = stateParts ? stateParts[1] : '';
    const ratingMatch = meta.match(/(\d{3,4})\*?\s*$/);
    const rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;

    results.push({ uscfId, name, state, rating });
  }

  logger.info({ count: results.length }, '[UscfSearch] Parsed results');
  return results;
}

/**
 * Parse USCF thin page HTML (thin3.php).
 * The thin page returns structured <input> elements with field values.
 *
 * Fields: memname, rating1 (Regular), rating2 (Quick), rating3 (Blitz),
 *         state_country, memfideid (FIDE ID + country)
 */
function parseThinPage(html: string, uscfId: string): UscfProfile | null {
  // Extract values from <input> elements
  const getValue = (fieldName: string): string => {
    const match = html.match(
      new RegExp(`name=['"]?${fieldName}['"]?[^>]*value=['"]([^'"]+)['"]`, 'i'),
    );
    return match ? match[1].trim() : '';
  };

  const name = getValue('memname');
  if (!name) return null;

  // Regular rating: "2149* 2025-12-01" → extract just the number
  const ratingStr = getValue('rating1');
  const ratingMatch = ratingStr.match(/^(\d+)/);
  const rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;

  const state = getValue('state_country');

  // FIDE ID: "39907899  USA" → extract just the number
  const fideStr = getValue('memfideid');
  const fideMatch = fideStr.match(/^(\d+)/);
  const fideId = fideMatch ? fideMatch[1] : undefined;

  return { id: uscfId, name, rating, state, fideId };
}

/**
 * Fetch USCF profile from the thin page (mobile/simplified view).
 * This endpoint returns server-rendered HTML with structured form fields.
 */
async function fetchFromThinPage(uscfId: string): Promise<UscfProfile | null> {
  try {
    const res = await fetchWithRetry(`https://www.uschess.org/msa/thin3.php?${uscfId}`, {
      timeoutMs: 10000,
    });
    if (!res.ok) return null;

    const html = await res.text();
    return parseThinPage(html, uscfId);
  } catch {
    return null;
  }
}

/**
 * Fetch USCF profile from legacy MSA page (fallback).
 */
async function fetchFromMSAScraping(uscfId: string): Promise<UscfProfile | null> {
  try {
    const res = await fetchWithRetry(
      `https://www.uschess.org/msa/MbrDtlMain.php?${uscfId}`,
      { timeoutMs: 10000 },
    );
    if (!res.ok) return null;

    const html = await res.text();

    const nameRegex = new RegExp(`<font[^>]*>\\s*<b>\\s*${uscfId}:?\\s*([^<]+)<\\/b>`, 'i');
    const nameMatch = html.match(nameRegex);
    const genericNameMatch = html.match(/<font size=["']?\+1["']?>\s*<b>([^<]+)<\/b>/i);
    const rawName = nameMatch
      ? nameMatch[1]
      : genericNameMatch
        ? genericNameMatch[1].replace(/^\d+:\s*/, '')
        : null;

    if (!rawName) return null;

    const ratingMatch = html.match(/Regular Rating[\s\S]*?<b>[\s\S]*?(\d+)/i);
    const stateMatch = html.match(/State[\s\S]*?<b>([^<]+)<\/b>/i);
    const state = stateMatch ? stateMatch[1].trim() : '';

    // Extract FIDE ID from MSA page too
    const fideMatch = html.match(/FIDE ID[\s\S]*?<b>(\d+)<\/b>/i);
    const fideId = fideMatch ? fideMatch[1] : undefined;

    return {
      id: uscfId,
      name: rawName.trim(),
      rating: ratingMatch ? parseInt(ratingMatch[1]) : 0,
      state,
      fideId,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch USCF profile with thin page primary and MSA fallback.
 */
export async function getUscfProfile(
  uscfId: string,
  retries = 2,
): Promise<UscfProfile | null> {
  if (!uscfId?.trim()) return null;

  const cleanId = uscfId.trim();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      logger.info({ uscfId: cleanId, attempt: attempt + 1 }, '[UscfProfile] Fetching');

      // Primary: thin page (structured, lightweight)
      const fromThin = await fetchFromThinPage(cleanId);
      if (fromThin) {
        logger.info({ uscfId: cleanId, name: fromThin.name }, '[UscfProfile] Found via thin page');
        return fromThin;
      }

      // Fallback: MSA full page scraping
      const fromMSA = await fetchFromMSAScraping(cleanId);
      if (fromMSA) {
        logger.info({ uscfId: cleanId, name: fromMSA.name }, '[UscfProfile] Found via MSA');
        return fromMSA;
      }

      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    } catch (err) {
      logger.error({ err, uscfId: cleanId, attempt: attempt + 1 }, '[UscfProfile] Error');
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  logger.warn({ uscfId: cleanId }, '[UscfProfile] All attempts failed');
  return null;
}
