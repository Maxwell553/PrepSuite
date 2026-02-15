import { createMiddleware } from 'hono/factory';
import { logger } from '../lib/logger.js';

export const loggerMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;
  logger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
    },
    `${c.req.method} ${c.req.path} ${c.res.status}`,
  );
});
