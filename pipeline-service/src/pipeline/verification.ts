import type { FideProfile, ChessComProfile, LichessProfile } from '../lib/types.js';
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
 * Bio-metric verification of a platform username against known player identity.
 * Checks: title match, name match, handle match, birth year in bio.
 * Returns the username if verified, null otherwise.
 */
export function verifyHandle(
  username: string,
  platform: 'chess.com' | 'lichess',
  profile: ChessComProfile | LichessProfile,
  officialName: string,
  fideProfile: FideProfile | null,
): string | null {
  const profileAny = profile as unknown as Record<string, unknown>;

  // Extract profile name
  const profileName =
    platform === 'chess.com'
      ? ((profileAny.name as string) ?? '')
      : (((profileAny.profile as Record<string, unknown>)?.['firstName'] as string) || '') +
        ' ' +
        (((profileAny.profile as Record<string, unknown>)?.['lastName'] as string) || '');

  // Extract bio
  const bio =
    platform === 'chess.com'
      ? (profileAny.status as string) || ''
      : ((profileAny.profile as Record<string, unknown>)?.['bio'] as string) || '';

  const profileTitle = ((profileAny.title as string) || '').toUpperCase().trim();
  const fideTitle = (fideProfile?.title || '').toUpperCase().trim();

  // CRITICAL: Title mismatch check
  if (fideTitle) {
    if (!profileTitle && fideTitle) {
      logger.info({ username, platform, fideTitle }, '[Verify] Rejecting: missing title');
      return null;
    }
    if (profileTitle && fideTitle && profileTitle !== fideTitle) {
      logger.info({ username, platform, fideTitle, profileTitle }, '[Verify] Rejecting: title mismatch');
      return null;
    }
    if (profileTitle === fideTitle) {
      logger.info({ username, platform, title: fideTitle }, '[Verify] Title match');
      // Title match + name or handle match = accept
      const officialNameClean = officialName.toLowerCase().replace(/[^a-z ]/g, '').trim();
      const allNameParts = extractNameParts(officialNameClean, officialName);
      const profNameLower = (profileName || '').toLowerCase().replace(/[^a-z ]/g, '');
      const matchingParts = allNameParts.filter((part) => profNameLower.includes(part));
      const nameMatch = matchingParts.length >= 2 || (matchingParts.length === 1 && allNameParts.length === 1);

      const handleLower = username.toLowerCase();
      const handleMatchingParts = allNameParts.filter((part) => handleLower.includes(part));
      const handleMatch = handleMatchingParts.length >= Math.min(2, allNameParts.length);

      if (nameMatch || handleMatch) {
        logger.info({ username, platform }, '[Verify] High confidence: title + name/handle');
        return username;
      }
      // Title match alone is strong evidence
      logger.info({ username, platform }, '[Verify] Accepting based on title match');
      return username;
    }
  }

  // Name matching
  const officialNameClean = officialName.toLowerCase().replace(/[^a-z ]/g, '').trim();
  const allNameParts = extractNameParts(officialNameClean, officialName);
  const profNameLower = (profileName || '').toLowerCase().replace(/[^a-z ]/g, '');
  const matchingParts = allNameParts.filter((part) => profNameLower.includes(part));
  const nameMatch = matchingParts.length >= 2 || (matchingParts.length === 1 && allNameParts.length === 1);

  const handleLower = username.toLowerCase();
  const handleMatchingParts = allNameParts.filter((part) => handleLower.includes(part));
  const handleMatch = handleMatchingParts.length >= Math.min(2, allNameParts.length);

  const titleMatch = fideTitle && profileTitle === fideTitle;
  const birthYearInBio = fideProfile?.birthYear ? bio.includes(fideProfile.birthYear) : false;

  // High confidence matches
  if (titleMatch && nameMatch) return username;
  if (titleMatch && birthYearInBio) return username;
  if (nameMatch && birthYearInBio) return username;

  // Medium confidence
  if (handleMatch && titleMatch) return username;
  if (handleMatch && nameMatch) return username;

  // Looser matches
  if (handleMatch) {
    logger.info({ username, platform }, '[Verify] Accepting based on handle match');
    return username;
  }
  if (nameMatch) {
    logger.info({ username, platform }, '[Verify] Accepting based on name match');
    return username;
  }

  logger.info({ username, platform }, '[Verify] No match found');
  return null;
}

/** Extract all name parts including reversed "Last, First" format */
function extractNameParts(officialNameClean: string, officialName: string): string[] {
  const nameParts = officialNameClean.split(/[,\s]+/).filter((p) => p.length > 2);
  const reversedParts: string[] = [];

  if (officialName.includes(',')) {
    const parts = officialNameClean.split(',').map((p) => p.trim());
    if (parts.length >= 2) {
      reversedParts.push(...parts[1].split(' ').filter((p) => p.length > 2));
      reversedParts.push(...parts[0].split(' ').filter((p) => p.length > 2));
    }
  }

  return [...new Set([...nameParts, ...reversedParts])];
}
