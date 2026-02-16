import type { FideProfile, UscfProfile, ChessComProfile, LichessProfile } from '../lib/types.js';
import { logger } from '../lib/logger.js';

/**
 * Check if two names are similar enough to be the same player.
 * Uses bidirectional substring matching on name parts.
 */
export function namesMatch(searchName: string, profileName: string): boolean {
  if (!searchName?.trim() || !profileName?.trim()) return false;

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const searchParts = normalize(searchName)
    .split(' ')
    .filter((p) => p.length > 0);
  const profileParts = normalize(profileName)
    .replace(/,/g, ' ')
    .split(' ')
    .filter((p) => p.length > 0);

  if (searchParts.length === 0 || profileParts.length === 0) return false;

  const matchingParts = searchParts.filter((sp) =>
    profileParts.some((pp) => pp.includes(sp) || sp.includes(pp)),
  );

  return (
    matchingParts.length >= Math.min(2, searchParts.length) ||
    (searchParts.length === 1 && profileParts.some((pp) => pp.includes(searchParts[0]) || searchParts[0].includes(pp)))
  );
}

/**
 * Verification of a platform username against known player identity.
 * Uses profile data from Chess.com/Lichess APIs: name, title, bio.
 * Compares platform profile name and title to FIDE/USCF data.
 * Does NOT use username string matching (e.g. "groff" in "jmwgroff").
 * If FIDE/USCF has a title and the platform profile does not, reject.
 * Returns the username if verified, null otherwise.
 */
export function verifyHandle(
  username: string,
  platform: 'chess.com' | 'lichess',
  profile: ChessComProfile | LichessProfile,
  officialName: string,
  fideProfile: FideProfile | null,
  uscfProfile?: UscfProfile | null,
): string | null {
  const profileAny = profile as unknown as Record<string, unknown>;

  // Extract profile name from platform APIs (Chess.com: name; Lichess: realName or firstName+lastName)
  const profileName =
    platform === 'chess.com'
      ? ((profileAny.name as string) ?? '')
      : (((profileAny.profile as Record<string, unknown>)?.['realName'] as string) || '').trim() ||
        [((profileAny.profile as Record<string, unknown>)?.['firstName'] as string) || '', ((profileAny.profile as Record<string, unknown>)?.['lastName'] as string) || '']
          .filter(Boolean)
          .join(' ')
          .trim();

  // Extract bio
  const bio =
    platform === 'chess.com'
      ? (profileAny.status as string) || ''
      : ((profileAny.profile as Record<string, unknown>)?.['bio'] as string) || '';

  const profileTitle = ((profileAny.title as string) || '').toUpperCase().trim();
  const expectedTitle = (fideProfile?.title || uscfProfile?.title || '').toUpperCase().trim();

  // CRITICAL: If we have an official title and platform doesn't, reject
  if (expectedTitle) {
    if (!profileTitle) {
      logger.info({ username, platform, expectedTitle }, '[Verify] Rejecting: platform missing title');
      return null;
    }
    if (profileTitle !== expectedTitle) {
      logger.info({ username, platform, expectedTitle, profileTitle }, '[Verify] Rejecting: title mismatch');
      return null;
    }
    if (profileTitle === expectedTitle) {
      logger.info({ username, platform, title: expectedTitle }, '[Verify] Title match');
      // Title match + profile name match = accept
      const nameMatch = namesMatch(officialName, profileName);
      if (nameMatch) {
        logger.info({ username, platform }, '[Verify] Accepting: title + profile name match');
        return username;
      }
      // Title match alone is strong evidence when profile name is empty (user didn't fill it)
      if (!profileName.trim()) {
        logger.info({ username, platform }, '[Verify] Accepting: title match (profile name empty)');
        return username;
      }
      // Title matches but profile name doesn't - reject (wrong person)
      logger.info({ username, platform, profileName, officialName }, '[Verify] Rejecting: title match but profile name mismatch');
      return null;
    }
  }

  // Profile-based verification only (no username string matching)
  const nameMatch = namesMatch(officialName, profileName);
  const titleMatch = expectedTitle && profileTitle === expectedTitle;
  const birthYearInBio = fideProfile?.birthYear ? bio.includes(fideProfile.birthYear) : false;

  // Accept when profile name matches FIDE/USCF
  if (nameMatch && titleMatch) return username;
  if (nameMatch && birthYearInBio) return username;
  if (nameMatch) {
    logger.info({ username, platform }, '[Verify] Accepting based on profile name match');
    return username;
  }
  if (titleMatch && birthYearInBio) return username;

  logger.info({ username, platform, profileName, officialName }, '[Verify] No match found');
  return null;
}
