import { Hono } from 'hono';
import { fetchWithRetry } from '../lib/fetchWithRetry.js';
import { logger } from '../lib/logger.js';

/** Allowed base URL for proxy (FIDE ratings only) */
const ALLOWED_BASE = 'https://ratings.fide.com/';

/** Timeout for proxy fetch (same as direct FIDE fetch) */
const PROXY_FETCH_TIMEOUT_MS = 45_000;

export const proxyRoute = new Hono();

/**
 * Public proxy for FIDE requests.
 * Used when running locally to route FIDE fetches through the deployed service
 * (which has better connectivity to ratings.fide.com).
 *
 * Only allows URLs under https://ratings.fide.com/
 */
proxyRoute.get('/', async (c) => {
  const rawUrl = c.req.query('url');
  if (!rawUrl) {
    return c.json({ error: 'Missing url query parameter' }, 400);
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return c.json({ error: 'Invalid url' }, 400);
  }

  if (targetUrl.protocol !== 'https:' || targetUrl.hostname !== 'ratings.fide.com') {
    return c.json({ error: 'URL must be under https://ratings.fide.com/' }, 400);
  }

  const url = targetUrl.toString();
  logger.info({ url }, '[Proxy] Fetching FIDE URL');

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': 'https://ratings.fide.com/',
  };
  if (url.includes('incl_search')) {
    headers['X-Requested-With'] = 'XMLHttpRequest';
  }

  try {
    const res = await fetchWithRetry(url, {
      timeoutMs: PROXY_FETCH_TIMEOUT_MS,
      headers,
    });

    if (!res.ok) {
      return c.json({ error: `Upstream returned ${res.status}` }, 502);
    }

    const html = await res.text();
    return c.html(html);
  } catch (err) {
    logger.warn({ url, err }, '[Proxy] Fetch failed');
    return c.json({ error: 'Proxy fetch failed' }, 502);
  }
});
