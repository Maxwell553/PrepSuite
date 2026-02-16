import { createMiddleware } from 'hono/factory';

const ALLOWED_ORIGINS = [
  'https://prepsuite.ai',
  'https://www.prepsuite.ai',
];

function isAllowedOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow localhost in dev
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

export const corsMiddleware = createMiddleware(async (c, next) => {
  const origin = c.req.header('origin');

  if (c.req.method === 'OPTIONS') {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    };
    if (isAllowedOrigin(origin)) {
      headers['Access-Control-Allow-Origin'] = origin as string;
    }
    return c.newResponse(null, 204, headers);
  }

  await next();

  if (isAllowedOrigin(origin)) {
    c.res.headers.set('Access-Control-Allow-Origin', origin as string);
  }
});
