import {getConnInfo} from '@hono/node-server/conninfo';
import {clientIp} from '../lib/clientIp.js';
import { consumeLimit } from '../lib/sharedLimits.js';
import { runAnalysis } from '../pipeline/runAnalysis.js';
import { workContext } from '../lib/workContext.js';
/**
 * Guest analyze endpoint — no JWT required.
 * Caps at 500 games, IP-based rate limiting (3 per hour).
 * Returns the same SSE format as the authenticated endpoint.
 */

import { Hono } from 'hono';
import { logger } from '../lib/logger.js';
import { validateAnalyzeRequest } from '../lib/validation.js';
import { SSEStream } from '../lib/sse.js';
export const analyzeGuestRoute = new Hono();

const GUEST_MAX_GAMES = 500;
const GUEST_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const GUEST_RATE_MAX = 3;
const GUEST_CONCURRENT_MAX = 2;

interface GuestLimit {
  concurrent: number;
  windowStart: number;
  windowCount: number;
}

const guestLimits = new Map<string, GuestLimit>();

analyzeGuestRoute.post('/analyze-guest', async (c) => {
  let peer: string | undefined;
  try {peer=getConnInfo(c).remote.address;} catch { /* In-process tests have no socket. */ }
  const ip = clientIp(c.req.header('x-forwarded-for'),peer,Number(process.env.TRUST_PROXY_HOPS||0));
  try { if (!await consumeLimit(`guest:${ip}`,3,3600)) return c.json({error:'Guest preview limit reached. Please try again later.'},429); } catch {return c.json({error:'Guest analysis temporarily unavailable'},503);}
  const now = Date.now();

  // Rate limiting by IP
  let limit = guestLimits.get(ip);
  if (!limit) {
    limit = { concurrent: 0, windowStart: now, windowCount: 0 };
    guestLimits.set(ip, limit);
  }
  if (now - limit.windowStart > GUEST_RATE_WINDOW_MS) {
    limit.windowStart = now;
    limit.windowCount = 0;
  }
  if (limit.concurrent >= GUEST_CONCURRENT_MAX) {
    return c.json({ error: 'Too many guest analyses in progress. Please wait for the current one to finish.' }, 429);
  }
  if (limit.windowCount >= GUEST_RATE_MAX) {
    return c.json({ error: `Guest rate limit exceeded. Maximum ${GUEST_RATE_MAX} analyses per hour. Sign up for higher limits.` }, 429);
  }

  limit.concurrent++;
  limit.windowCount++;

  const releaseSlot = () => {
    limit!.concurrent = Math.max(0, limit!.concurrent - 1);
    // Cleanup stale entries
    for (const [key, val] of guestLimits.entries()) {
      if (now - val.windowStart > GUEST_RATE_WINDOW_MS * 2 && val.concurrent === 0) {
        guestLimits.delete(key);
      }
    }
  };

  let input;
  try {
    const body = await c.req.json();
    // Force guest limits before validation
    const capped = {
      ...body,
      gameLimit: Math.min(body.gameLimit ?? 500, GUEST_MAX_GAMES),
      onlineLimit: Math.min(body.onlineLimit ?? 250, GUEST_MAX_GAMES),
      otbLimit: Math.min(body.otbLimit ?? 250, GUEST_MAX_GAMES),
    };
    // Ensure split adds up to gameLimit
    const total = capped.gameLimit;
    if (capped.onlineLimit + capped.otbLimit !== total) {
      capped.onlineLimit = Math.min(capped.onlineLimit, total);
      capped.otbLimit = total - capped.onlineLimit;
    }
    input = validateAnalyzeRequest(capped);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    releaseSlot();
    return c.json({ error: message }, 400);
  }

  logger.info({ ip, name: input.name }, '[AnalyzeGuest] Starting guest pipeline');

  const sse = new SSEStream();

  void workContext.run(sse.signal,()=>runAnalysis(input,sse,'guest',true))
    .catch(err=>sse.sendError({error:err instanceof Error?err.message:'Analysis failed'}))
    .finally(()=>{void sse.close();releaseSlot();});
  return sse.response();
});
