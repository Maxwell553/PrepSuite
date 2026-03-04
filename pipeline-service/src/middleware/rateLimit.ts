/**
 * In-memory rate limiting for pipeline endpoints.
 * Limits concurrent analyses and requests per time window per user.
 * Note: With multiple Cloud Run instances, limits are per-instance (not global).
 */

import { createMiddleware } from 'hono/factory';
import { logger } from '../lib/logger.js';

interface UserLimit {
  concurrent: number;
  windowStart: number;
  windowCount: number;
}

const ANALYZE_CONCURRENT_MAX = 2;
const ANALYZE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const ANALYZE_WINDOW_MAX = 5;

const CHAT_WINDOW_MS = 60 * 1000; // 1 minute
const CHAT_WINDOW_MAX = 10;

const analyzeLimits = new Map<string, UserLimit>();
const chatLimits = new Map<string, UserLimit>();

function getOrCreateLimit(map: Map<string, UserLimit>, userId: string, windowMs: number): UserLimit {
  let limit = map.get(userId);
  const now = Date.now();
  if (!limit) {
    limit = { concurrent: 0, windowStart: now, windowCount: 0 };
    map.set(userId, limit);
  }
  // Reset window if expired
  if (now - limit.windowStart > windowMs) {
    limit.windowStart = now;
    limit.windowCount = 0;
  }
  return limit;
}

function cleanupStaleEntries(map: Map<string, UserLimit>, windowMs: number) {
  const now = Date.now();
  for (const [userId, limit] of map.entries()) {
    if (now - limit.windowStart > windowMs * 2 && limit.concurrent === 0) {
      map.delete(userId);
    }
  }
}

/** Callback type for releasing the analyze slot when the pipeline finishes */
export type ReleaseAnalyzeSlot = () => void;

declare module 'hono' {
  interface ContextVariableMap {
    releaseAnalyzeSlot?: ReleaseAnalyzeSlot;
  }
}

export const analyzeRateLimitMiddleware = createMiddleware(async (c, next) => {
  const user = c.get('user');
  const userId = user.sub;

  const limit = getOrCreateLimit(analyzeLimits, userId, ANALYZE_WINDOW_MS);

  if (limit.concurrent >= ANALYZE_CONCURRENT_MAX) {
    logger.warn({ userId }, '[RateLimit] Analyze: concurrent limit exceeded');
    return c.json(
      { error: 'Too many analyses in progress. Please wait for the current one to finish.' },
      429
    );
  }

  if (limit.windowCount >= ANALYZE_WINDOW_MAX) {
    logger.warn({ userId }, '[RateLimit] Analyze: window limit exceeded');
    return c.json(
      { error: `Rate limit exceeded. Maximum ${ANALYZE_WINDOW_MAX} analyses per 10 minutes.` },
      429
    );
  }

  limit.concurrent++;
  limit.windowCount++;

  c.set('releaseAnalyzeSlot', () => {
    limit.concurrent = Math.max(0, limit.concurrent - 1);
    cleanupStaleEntries(analyzeLimits, ANALYZE_WINDOW_MS);
  });

  await next();
});

export const chatRateLimitMiddleware = createMiddleware(async (c, next) => {
  const user = c.get('user');
  const userId = user.sub;

  const limit = getOrCreateLimit(chatLimits, userId, CHAT_WINDOW_MS);

  if (limit.windowCount >= CHAT_WINDOW_MAX) {
    logger.warn({ userId }, '[RateLimit] Chat: window limit exceeded');
    return c.json(
      { error: `Rate limit exceeded. Maximum ${CHAT_WINDOW_MAX} chat messages per minute.` },
      429
    );
  }

  limit.windowCount++;

  await next();
  cleanupStaleEntries(chatLimits, CHAT_WINDOW_MS);
});
