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

  it('increments each hour by 500..2500', () => {
    const h = 60 * 60 * 1000;
    const c0 = computeGamesAnalyzedCount(GAMES_ANALYZED_EPOCH_MS);
    const c1 = computeGamesAnalyzedCount(GAMES_ANALYZED_EPOCH_MS + h);
    expect(c0).toBe(GAMES_ANALYZED_BASE);
    expect(c1 - c0).toBeGreaterThanOrEqual(500);
    expect(c1 - c0).toBeLessThanOrEqual(2500);
  });

  it('formats compact', () => {
    expect(formatGamesAnalyzedShort(334_500)).toBe('334.5k');
    expect(formatGamesAnalyzedShort(1_200_000)).toBe('1.2M');
  });
});
