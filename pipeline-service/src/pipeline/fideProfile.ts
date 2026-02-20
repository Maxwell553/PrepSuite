import { getFideProfileById } from '../lib/fideLocalDb.js';
import { logger } from '../lib/logger.js';
import type { FideProfile } from '../lib/types.js';

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
 * Get FIDE profile by ID from local rating list.
 */
export async function getFideProfile(fideId: string): Promise<FideProfile | null> {
  if (!fideId?.trim()) return null;

  const cleanId = fideId.trim();
  logger.info({ fideId: cleanId }, '[FideProfile] Looking up (local DB)');

  const profile = getFideProfileById(cleanId);
  if (profile) {
    logger.info({ fideId: cleanId, name: profile.name }, '[FideProfile] Success');
  }
  return profile;
}
