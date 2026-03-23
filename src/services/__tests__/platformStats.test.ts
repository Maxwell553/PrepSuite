import { describe, it, expect } from 'vitest';
import {
  computeGamesAnalyzedCount,
  formatGamesAnalyzedShort,
  GAMES_ANALYZED_BASE,
  GAMES_ANALYZED_EPOCH_MS,
} from '../platformStats';

describe('platformStats', () => {
  it('returns base before epoch', () => {
    expect(computeGamesAnalyzedCount(GAMES_ANALYZED_EPOCH_MS - 1)).toBe(GAMES_ANALYZED_BASE);
  });

  it('increments each hour by 1000..10000', () => {
    const h = 60 * 60 * 1000;
    const c0 = computeGamesAnalyzedCount(GAMES_ANALYZED_EPOCH_MS);
    const c1 = computeGamesAnalyzedCount(GAMES_ANALYZED_EPOCH_MS + h);
    expect(c0).toBe(GAMES_ANALYZED_BASE);
    expect(c1 - c0).toBeGreaterThanOrEqual(1000);
    expect(c1 - c0).toBeLessThanOrEqual(10000);
  });

  it('formats compact', () => {
    expect(formatGamesAnalyzedShort(215_000)).toBe('215k');
    expect(formatGamesAnalyzedShort(1_200_000)).toBe('1.2M');
  });
});
