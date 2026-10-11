export interface RatingHistoryPoint {
  date: string;
  classicalRating?: number;
  rapidRating?: number;
  blitzRating?: number;
}
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** The JSON endpoint used by FIDE's own history chart (full history, not one table page). */
export function parseOfficialFideHistory(data: unknown): RatingHistoryPoint[] {
  if (!Array.isArray(data)) return [];
  const points = new Map<string, RatingHistoryPoint>();
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const period = typeof row.date_2 === 'string' ? row.date_2.match(/^(\d{4})-([A-Za-z]{3})$/) : null;
    const month = period ? months.indexOf(period[2]) + 1 : 0;
    if (!period || !month) continue;
    const point: RatingHistoryPoint = { date: `${period[1]}-${String(month).padStart(2, '0')}` };
    for (const [field, key] of [['rating', 'classicalRating'], ['rapid_rtng', 'rapidRating'], ['blitz_rtng', 'blitzRating']] as const) {
      const rating = Number(row[field]);
      if (Number.isInteger(rating) && rating > 0 && rating < 4000) point[key] = rating;
    }
    if (Object.keys(point).length > 1) points.set(point.date, point);
  }
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}
/** Lichess's documented FIDE series encodes each point as YYYYMMrrrr. */
export function parseLichessFideHistory(data: unknown): RatingHistoryPoint[] {
  if (!data || typeof data !== 'object') return [];
  const points = new Map<string, RatingHistoryPoint>();
  for (const [series, key] of [['standard', 'classicalRating'], ['rapid', 'rapidRating'], ['blitz', 'blitzRating']] as const) {
    const values = (data as Record<string, unknown>)[series];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (!Number.isSafeInteger(value)) continue;
      const rating = value % 10000;
      const period = Math.floor(value / 10000);
      const year = Math.floor(period / 100), month = period % 100;
      if (year < 1900 || year > 2100 || month < 1 || month > 12 || rating <= 0 || rating >= 4000) continue;
      const date = `${year}-${String(month).padStart(2, '0')}`;
      const point = points.get(date) || { date };
      point[key] = rating;
      points.set(date, point);
    }
  }
  // Preserve the provider's sparse series; never invent missing monthly observations.
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function parseFideRatingHistory(html: string): RatingHistoryPoint[] {
  const table = html.match(/<table\b[^>]*class=["'][^"']*\bprofile-table_calc\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) return [];
  const points = new Map<string, RatingHistoryPoint>();
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ').trim());
    const period = cells[0]?.match(/^(\d{4})-([A-Za-z]{3})$/);
    const month = period ? months.findIndex(m => m.toLowerCase() === period[2].toLowerCase()) + 1 : 0;
    if (!period || !month || cells.length < 7) continue;
    const point: RatingHistoryPoint = {date: `${period[1]}-${String(month).padStart(2, '0')}`};
    for (const [key, column] of [['classicalRating',1],['rapidRating',3],['blitzRating',5]] as const) {
      const rating = Number(cells[column]);
      if (Number.isFinite(rating) && rating > 0 && rating < 4000) point[key] = rating;
    }
    if (Object.keys(point).length > 1) points.set(point.date, point);
  }
  return [...points.values()].sort((a,b) => a.date.localeCompare(b.date));
}
