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
 * Verification of a platform username found via Vertex/Google Search.
 * Cross-checks: (1) same title as player, (2) player name appears in profile bio.
 * If both true, assume that is the correct username.
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

  // Bio: Chess.com uses "status", Lichess uses profile.bio
  const bio =
    platform === 'chess.com'
      ? (profileAny.status as string) || ''
      : ((profileAny.profile as Record<string, unknown>)?.['bio'] as string) || '';

  const profileTitle = ((profileAny.title as string) || '').toUpperCase().trim();
  const expectedTitle = (fideProfile?.title || uscfProfile?.title || '').toUpperCase().trim();

  // 1. Title: if player has FIDE/USCF title, profile must have same title
  if (expectedTitle) {
    if (!profileTitle) {
      logger.info({ username, platform, expectedTitle }, '[Verify] Rejecting: platform missing title');
      return null;
    }
    if (profileTitle !== expectedTitle) {
      logger.info({ username, platform, expectedTitle, profileTitle }, '[Verify] Rejecting: title mismatch');
      return null;
    }
  }

  // 2. Name in bio: player name must appear in profile bio (or profile name field)
  const profileName =
    platform === 'chess.com'
      ? ((profileAny.name as string) ?? '')
      : (((profileAny.profile as Record<string, unknown>)?.['realName'] as string) || '').trim() ||
        [((profileAny.profile as Record<string, unknown>)?.['firstName'] as string) || '', ((profileAny.profile as Record<string, unknown>)?.['lastName'] as string) || '']
          .filter(Boolean)
          .join(' ')
          .trim();

  const nameInBio = bio.toLowerCase().includes(officialName.toLowerCase().trim());
  const nameInProfile = namesMatch(officialName, profileName);
  const nameMatch = nameInBio || nameInProfile;

  // When we have a title: both title match AND name in bio/profile required
  // When no title: name in bio or profile is sufficient
  if (expectedTitle) {
    if (nameMatch) {
      logger.info({ username, platform }, '[Verify] Accepting: title + name in bio/profile');
      return username;
    }
    logger.info({ username, platform, officialName }, '[Verify] Rejecting: title matches but name not in bio/profile');
    return null;
  }

  if (nameMatch) {
    logger.info({ username, platform }, '[Verify] Accepting: name in bio/profile (no title to check)');
    return username;
  }

  logger.info({ username, platform, officialName }, '[Verify] Rejecting: name not in bio or profile');
  return null;
}
