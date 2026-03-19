/**
 * Google Ads conversion tracking for sign-ups.
 * Fires once per user to avoid double-counting across sessions.
 */

const CONVERSION_SEND_TO = 'AW-18020973445/_7_yCP6cqoscEIX3iJFD';
const STORAGE_KEY = 'prepsuite_ga_conv_tracked';

function getTrackedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function markTracked(userId: string): void {
  const set = getTrackedIds();
  set.add(userId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Ignore quota errors
  }
}

function fireConversion(): void {
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === 'function') {
    gtag('event', 'conversion', {
      send_to: CONVERSION_SEND_TO,
      value: 1.0,
      currency: 'USD',
    });
  }
}

/**
 * Track a sign-up conversion for Google Ads (email/password signup).
 * Call this immediately after signUp succeeds.
 */
export function trackSignUpConversion(userId: string): void {
  if (!userId) return;
  if (getTrackedIds().has(userId)) return;
  fireConversion();
  markTracked(userId);
}

/**
 * Track a sign-up conversion when we detect a new user via auth state change
 * (e.g. Google OAuth). Only fires if the user was created recently (within 10 min)
 * to avoid counting returning users.
 */
export function trackSignUpConversionIfNewUser(
  userId: string,
  createdAt: string | undefined
): void {
  if (!userId) return;
  if (getTrackedIds().has(userId)) return;
  if (createdAt) {
    const created = new Date(createdAt).getTime();
    if (Date.now() - created > 10 * 60 * 1000) return; // Skip if user created >10 min ago
  }
  fireConversion();
  markTracked(userId);
}
