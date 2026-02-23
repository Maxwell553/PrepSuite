import { logger } from './logger.js';

export interface FetchWithRetryOptions {
  retries?: number;
  delayMs?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

/**
 * Shared fetch with retry: 2 retries, exponential backoff, 429/5xx handling, timeout.
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const { retries = 2, delayMs = 1000, timeoutMs = 15000, headers = {} } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        ...(options.method && { method: options.method }),
        ...(options.body !== undefined && { body: options.body }),
      });

      if (res.status === 429) {
        logger.warn({ url, attempt }, 'Rate limit hit (429)');
        if (attempt < retries) {
          await sleep(delayMs * (attempt + 1));
          continue;
        }
        return res;
      }

      if (res.status >= 500 && attempt < retries) {
        logger.warn({ url, status: res.status, attempt }, 'Server error, retrying');
        await sleep(delayMs * (attempt + 1));
        continue;
      }

      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      logger.warn({ url, attempt, err }, 'Fetch failed, retrying');
      await sleep(delayMs * (attempt + 1));
    }
  }

  throw new Error(`fetchWithRetry: max retries reached for ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
