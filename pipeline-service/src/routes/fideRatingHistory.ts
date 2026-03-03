/**
 * FIDE rating history for the Progress chart when no games are found.
 * Uses ChessTools API (api.chesstools.org) for full classical/rapid/blitz history.
 */

import { Hono } from 'hono';
import { fetchWithRetry } from '../lib/fetchWithRetry.js';
import { logger } from '../lib/logger.js';

const USER_AGENT = 'PrepSuite-Pipeline/1.0';

export interface RatingHistoryPoint {
  date: string; // YYYY-MM
  rating?: number; // classical (legacy)
  classicalRating?: number;
  rapidRating?: number;
  blitzRating?: number;
}

export const fideRatingHistoryRoute = new Hono();

interface ChessToolsEntry {
  date?: string;
  period?: string;
  classical_rating?: number;
  rapid_rating?: number;
  blitz_rating?: number;
}

fideRatingHistoryRoute.get('/fide-rating-history/:fideId', async (c) => {
  const fideId = c.req.param('fideId')?.trim();
  if (!fideId || !/^\d+$/.test(fideId)) {
    return c.json({ error: 'Invalid FIDE ID' }, 400);
  }
  try {
    const url = `https://api.chesstools.org/fide/player_history/?fide_id=${fideId}`;
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeoutMs: 15000,
    });
    if (!res.ok) {
      logger.warn({ status: res.status, fideId }, '[FideRatingHistory] ChessTools fetch failed');
      return c.json({ history: [] });
    }
    const raw = (await res.json()) as ChessToolsEntry[];
    if (!Array.isArray(raw) || raw.length === 0) {
      return c.json({ history: [] });
    }
    const months: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
    };
    const toYyyyMm = (s: string): string => {
      const m = s.match(/^(\d{4})-(\d{2})$/);
      if (m) return s;
      const p = s.match(/^(\d{4})-(\w{3})$/);
      if (p) return `${p[1]}-${months[p[2]] ?? p[2]}`;
      return '';
    };
    const history: RatingHistoryPoint[] = raw
      .filter((e) => e.date || e.period)
      .map((e) => {
        const date = toYyyyMm(e.date || e.period || '');
        if (!date) return null;
        const pt: RatingHistoryPoint = { date };
        if ((e.classical_rating ?? 0) > 0) pt.classicalRating = e.classical_rating;
        if ((e.rapid_rating ?? 0) > 0) pt.rapidRating = e.rapid_rating;
        if ((e.blitz_rating ?? 0) > 0) pt.blitzRating = e.blitz_rating;
        return pt;
      })
      .filter((p): p is RatingHistoryPoint => p != null && /^\d{4}-\d{2}$/.test(p.date))
      .sort((a, b) => a.date.localeCompare(b.date));
    logger.info({ fideId, points: history.length }, '[FideRatingHistory] Loaded from ChessTools');
    return c.json({ history });
  } catch (err) {
    logger.warn({ err, fideId }, '[FideRatingHistory] Error');
    return c.json({ history: [] });
  }
});
