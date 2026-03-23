/**
 * Landing-page marketing stats. No DB calls — avoids heavy aggregates on huge tables.
 * "Games analyzed" grows by a deterministic 500–2500 per hour from a fixed epoch (same for all visitors).
 */

const HOUR_MS = 60 * 60 * 1000;

/** Shown while `now < GAMES_ANALYZED_EPOCH_MS`, and starting point when hourly accrual begins */
export const GAMES_ANALYZED_BASE = 334_500;

/**
 * First hour bucket starts here (UTC). Before this instant, count stays at `GAMES_ANALYZED_BASE`.
 * After this, each UTC hour adds a deterministic 500–2500.
 */
export const GAMES_ANALYZED_EPOCH_MS = Date.UTC(2026, 2, 24, 0, 0, 0);

export const OTB_GAMES_DISPLAY = '10.8M';
export const FIDE_PLAYERS_DISPLAY = '1.64M';

/** Deterministic integer in [500, 2500] for hour index `h` (same for all users). */
function hourlyGamesIncrement(h: number): number {
  let x = h | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  const u = x >>> 0;
  return 500 + (u % 2001);
}

/** Raw count for "games analyzed" at `nowMs` (default: current time). */
export function computeGamesAnalyzedCount(nowMs: number = Date.now()): number {
  if (nowMs < GAMES_ANALYZED_EPOCH_MS) return GAMES_ANALYZED_BASE;
  const hours = Math.floor((nowMs - GAMES_ANALYZED_EPOCH_MS) / HOUR_MS);
  let total = GAMES_ANALYZED_BASE;
  for (let h = 0; h < hours; h++) {
    total += hourlyGamesIncrement(h);
  }
  return total;
}

/** e.g. 215000 → "215k", 1_200_000 → "1.2M" */
export function formatGamesAnalyzedShort(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    const t = Math.round(m * 10) / 10;
    return Number.isInteger(t) ? `${t}M` : `${t}M`.replace(/\.0M$/, 'M');
  }
  const k = n / 1000;
  const t = Math.round(k * 10) / 10;
  return Number.isInteger(t) ? `${t}k` : `${t}k`.replace(/\.0k$/, 'k');
}
