import { Hono } from 'hono';
import { boundedLookup } from '../lib/boundedLookup.js';
import { fetchOfficialFideText, fetchRatingJson } from '../lib/ratingProvider.js';
import { parseOfficialFideHistory, parseLichessFideHistory } from '../lib/ratingHistory.js';
import { logger } from '../lib/logger.js';

export const fideRatingHistoryRoute = new Hono();
fideRatingHistoryRoute.get('/fide-rating-history/:fideId', async (c) => {
  const id = c.req.param('fideId').trim();
  if (!/^\d{1,10}$/.test(id)) return c.json({ error: 'Invalid FIDE ID' }, 400);
  c.header('Cache-Control', 'no-store');
  const result = await boundedLookup('FIDE rating history', 6500, async () => {
    try {
      const raw = await fetchOfficialFideText(`/a_chart_data.phtml?event=${id}&period=0`, 'POST');
      const history = parseOfficialFideHistory(JSON.parse(raw));
      if (history.length) return { history, source: 'FIDE', sourceUrl: `https://ratings.fide.com/profile/${id}/calculations` };
    } catch (err) {
      logger.warn({ err, fideId: id }, '[FideRatingHistory] Official source unavailable; using FIDE lists via Lichess');
    }
    const history = parseLichessFideHistory(await fetchRatingJson(`https://lichess.org/api/fide/player/${id}/ratings`));
    if (!history.length) return null;
    return { history, source: 'FIDE via Lichess', sourceUrl: `https://lichess.org/fide/${id}` };
  }, null);
  if (!result) return c.json({ history: [], error: 'Rating history temporarily unavailable' }, 503);
  return c.json({ ...result, checkedAt: new Date().toISOString() });
});
