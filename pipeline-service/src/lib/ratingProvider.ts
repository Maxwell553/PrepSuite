import { AsyncCache } from './cache.js';
import { workSignal } from './workContext.js';

// Only successful live responses are cached; no bundled player records or error fallbacks.
const cache = new AsyncCache<unknown>(4 * 1024 * 1024, 5 * 60 * 1000);
let lichessQueue: Promise<unknown> = Promise.resolve();
const officialCache = new AsyncCache<string>(4 * 1024 * 1024, 5 * 60 * 1000);

export async function fetchOfficialFideText(path: string, method = 'GET', timeoutMs = 1500): Promise<string> {
  return officialCache.get(path, async () => {
    const response = await fetch(`https://ratings.fide.com${path}`, {
      method,
      headers: {
        'User-Agent': 'PrepSuite/1.0 (https://prepsuite.ai)',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://ratings.fide.com/',
      },
      signal: workSignal(timeoutMs),
    });
    if (!response.ok) throw new Error(`FIDE returned ${response.status}`);
    const text = (await response.text()).replace(/^\uFEFF/, '').trim();
    if (!text) throw new Error('FIDE returned an empty response');
    return text;
  });
}

export async function fetchRatingJson(url: string): Promise<unknown> {
  const signal = workSignal(6000);
  const load = async () => {
    const request = async () => {
      signal.throwIfAborted();
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'PrepSuite/1.0 (https://prepsuite.ai)' },
        signal,
      });
      if (!response.ok) throw new Error(`Rating provider returned ${response.status}`);
      return response.json();
    };
    // Lichess asks clients to make one request at a time. Queue time is part of the deadline.
    if (new URL(url).hostname !== 'lichess.org') return request();
    const pending = lichessQueue.then(request);
    lichessQueue = pending.catch(() => {});
    return pending;
  };
  return cache.get(url, load);
}

export interface FideApiPlayer {
  id: number;
  name: string;
  federation?: string;
  year?: number;
  title?: string;
  standard?: number;
}

export function isFideApiPlayer(value: unknown): value is FideApiPlayer {
  if (!value || typeof value !== 'object') return false;
  const player = value as FideApiPlayer;
  return Number.isSafeInteger(player.id) && player.id > 0 && typeof player.name === 'string' && !!player.name.trim();
}

export function fideApiProfile(player: FideApiPlayer) {
  return {
    name: player.name,
    federation: player.federation || '',
    birthYear: player.year ? String(player.year) : '',
    title: player.title || '',
    rating: typeof player.standard === 'number' && player.standard > 0 ? player.standard : 0,
  };
}
