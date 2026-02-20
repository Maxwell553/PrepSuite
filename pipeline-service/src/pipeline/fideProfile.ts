import https from 'node:https';
import { fetchWithRetry } from '../lib/fetchWithRetry.js';
import { getFideFetchUrl } from '../lib/fideProxy.js';
import { logger } from '../lib/logger.js';
import type { FideProfile } from '../lib/types.js';

/** Fallback: fetch via native https when global fetch fails (e.g. dev IPv6/DNS issues) */
async function fetchViaHttps(url: string, headers: Record<string, string>, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error('Request timeout'));
    }, timeoutMs);

    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        clearTimeout(timer);
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });
      res.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

const VALID_TITLES = ['GM', 'IM', 'FM', 'CM', 'WGM', 'WIM', 'WFM', 'WCM', 'NM', 'WNM'];

/**
 * Parse a FIDE profile page HTML into a FideProfile.
 * Uses 5 name extraction strategies + rating/federation/title extraction.
 */
export function parseFideProfileHtml(html: string, fideId: string): FideProfile | null {
  // 1. NAME EXTRACTION — 5 strategies
  // Strategy A: <title> tag
  const titleMatch = html.match(/<title>([^<]+) FIDE Profile<\/title>/i);
  // Strategy B: .player-title class
  const playerTitleMatch = html.match(/class="player-title">([^<]+)<\/h1>/i);
  // Strategy C: Old layout
  const oldDivMatch = html.match(/<div class="profile-top-title">([^<]+)<\/div>/);

  const rawName = titleMatch?.[1] ?? playerTitleMatch?.[1] ?? oldDivMatch?.[1] ?? null;
  if (!rawName) {
    logger.warn({ fideId, htmlLength: html.length }, '[FideProfile] Could not find name');
    return null;
  }

  // 2. RATING EXTRACTION
  let rating = 0;
  const containerMatch = html.match(/class="profile-standart[^>]*>[\s\S]*?<p>(\d+)<\/p>/i);
  if (containerMatch) {
    rating = parseInt(containerMatch[1]);
  } else {
    const fallbackRating = html.match(/Std\. rating[\s\S]*?>(\d+)/i);
    const tableRating = html.match(/profile-standart[\s\S]*?<p>(\d+)<\/p>/i);
    rating = fallbackRating ? parseInt(fallbackRating[1]) : tableRating ? parseInt(tableRating[1]) : 0;
  }

  // 3. FEDERATION & BIRTH YEAR
  const fedMatch = html.match(
    /class="profile-info-country\s*"[^>]*>[\s\n]*((?:<img[^>]*>)?[\s\n]*([^<]*))/i,
  );
  const bYearMatch = html.match(/class="profile-info-byear\s*"[^>]*>[\s\n]*(\d{4})/i);

  // 4. TITLE EXTRACTION — 5 strategies
  let title = '';
  const profileTitleMatch = html.match(/class="profile-info-title\s*"[^>]*>[\s\n]*([A-Z]{2,4})/i);
  if (profileTitleMatch?.[1]) {
    title = profileTitleMatch[1].trim().toUpperCase();
  } else {
    const titleSpanMatch = html.match(
      /<span[^>]*class=["']title["'][^>]*>[\s\n]*([A-Z]{2,4})[\s\n]*<\/span>/i,
    );
    if (titleSpanMatch?.[1]) {
      title = titleSpanMatch[1].trim().toUpperCase();
    } else {
      const titleDivMatch = html.match(
        /<div[^>]*class=["']title["'][^>]*>[\s\n]*([A-Z]{2,4})[\s\n]*<\/div>/i,
      );
      if (titleDivMatch?.[1]) {
        title = titleDivMatch[1].trim().toUpperCase();
      } else {
        const titleInNameMatch = html.match(
          /(?:\(|,|\s)(GM|IM|FM|CM|WGM|WIM|WFM|WCM|NM|WNM)(?:\)|,|\s|$)/i,
        );
        if (titleInNameMatch?.[1]) {
          title = titleInNameMatch[1].trim().toUpperCase();
        } else {
          const titleTagMatch = html.match(
            /<title>[^<]*\s(GM|IM|FM|CM|WGM|WIM|WFM|WCM|NM|WNM)/i,
          );
          if (titleTagMatch?.[1]) {
            title = titleTagMatch[1].trim().toUpperCase();
          }
        }
      }
    }
  }

  if (title && !VALID_TITLES.includes(title)) {
    logger.warn({ fideId, title }, '[FideProfile] Invalid title extracted');
    title = '';
  }

  return {
    name: rawName.trim(),
    federation: fedMatch ? fedMatch[2].trim() : '',
    birthYear: bYearMatch ? bYearMatch[1].trim() : '',
    rating,
    title,
  };
}

/**
 * Fetch a FIDE profile by ID with retry.
 * Direct URL: https://ratings.fide.com/profile/{id}
 */
export async function getFideProfile(
  fideId: string,
  retries = 3,
): Promise<FideProfile | null> {
  if (!fideId?.trim()) return null;

  const cleanId = fideId.trim();

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://ratings.fide.com/',
    'Connection': 'keep-alive',
  };

  const url = `https://ratings.fide.com/profile/${cleanId}`;
  const fetchUrl = getFideFetchUrl(url);
  const BODY_TIMEOUT_MS = 25_000;
  const FETCH_TIMEOUT_MS = 45_000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      logger.info({ fideId: cleanId, attempt: attempt + 1 }, '[FideProfile] Fetching');
      let html: string;

      try {
        const res = await fetchWithRetry(fetchUrl, {
          timeoutMs: FETCH_TIMEOUT_MS,
          headers,
        });
        if (!res.ok) {
          logger.warn({ fideId: cleanId, status: res.status }, '[FideProfile] Fetch failed');
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          return null;
        }
        html = await Promise.race([
          res.text(),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('Body read timeout')), BODY_TIMEOUT_MS),
          ),
        ]);
      } catch (fetchErr) {
        const cause = fetchErr instanceof Error ? fetchErr.cause : undefined;
        const causeCode = cause && typeof cause === 'object' && 'code' in cause ? (cause as { code?: string }).code : undefined;
        logger.warn(
          {
            errMsg: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
            causeCode,
            fideId: cleanId,
            attempt: attempt + 1,
          },
          '[FideProfile] Fetch failed, trying https fallback',
        );
        html = await fetchViaHttps(url, headers, FETCH_TIMEOUT_MS);
      }

      const profile = parseFideProfileHtml(html, cleanId);
      if (profile) {
        logger.info({ fideId: cleanId, name: profile.name }, '[FideProfile] Success');
        return profile;
      }

      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errName = err instanceof Error ? err.name : undefined;
      const cause = err instanceof Error ? err.cause : undefined;
      const causeCode = cause && typeof cause === 'object' && 'code' in cause ? (cause as { code?: string }).code : undefined;
      logger.error(
        { errMsg, errName, causeCode, fideId: cleanId, attempt: attempt + 1 },
        '[FideProfile] Error',
      );
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  return null;
}
