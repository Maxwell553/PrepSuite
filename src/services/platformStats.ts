/**
 * Landing-page marketing stats. No DB calls — avoids heavy aggregates on huge tables.
 * "Games analyzed" grows by a deterministic 1k–10k per hour from a fixed epoch (same for all visitors).
 */

const HOUR_MS = 60 * 60 * 1000;

/** Shown baseline at `GAMES_ANALYZED_EPOCH_MS` */
export const GAMES_ANALYZED_BASE = 215_000;

/**
 * First hour bucket starts here (UTC). Change this if you reset the campaign baseline.
 * 2026-03-23 00:00:00 UTC — hours after this add a deterministic 1k–10k each.
 */
export const GAMES_ANALYZED_EPOCH_MS = Date.UTC(2026, 2, 23, 0, 0, 0);

export const OTB_GAMES_DISPLAY = '10.8M';
export const FIDE_PLAYERS_DISPLAY = '1.64M';

/** Deterministic integer in [1000, 10000] for hour index `h` (same for all users). */
function hourlyGamesIncrement(h: number): number {
  let x = h | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  const u = x >>> 0;
  return 1000 + (u % 9001);
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
