/** No synthetic growth. Display usage only when backed by a measured aggregate. */
export const GAMES_ANALYZED_BASE = 0;
export const GAMES_ANALYZED_EPOCH_MS = 0;
export const OTB_GAMES_DISPLAY = 'Available';
export const FIDE_PLAYERS_DISPLAY = 'Available';
export const computeGamesAnalyzedCount = (_now?: number): number => 0;
export const formatGamesAnalyzedShort = (n: number): string => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
