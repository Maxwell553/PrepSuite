import type { GameData } from '../lib/types.js';
import { workContext } from '../lib/workContext.js';

type Source = { quota: number; fetch: (limit: number) => Promise<{games: GameData[]; exhausted: boolean}> };
/** Preserve the requested mix where possible, then fill unused slots from selected sources. */
export async function collectReportGames(total: number, sources: Source[], validate: (games: GameData[]) => Promise<GameData[]>): Promise<GameData[]> {
  const pools = sources.map(source => ({...source, limit: source.quota, valid: [] as GameData[], seen: new Set<string>(), exhausted: false}));
  while (true) {
    workContext.getStore()?.throwIfAborted();
    await Promise.all(pools.filter(p => !p.exhausted && p.limit > 0).map(async p => {
      const batch = await p.fetch(p.limit);
      const fresh = batch.games.filter(g => {
        const key = `${g.source}:${g.id || `${g.white}:${g.black}:${g.playedAt}:${g.pgn}`}`;
        if (p.seen.has(key)) return false;
        p.seen.add(key); return true;
      });
      p.valid.push(...await validate(fresh));
      p.exhausted = batch.exhausted;
    }));
    const available = pools.reduce((sum,p) => sum+p.valid.length,0);
    if (available >= total || pools.every(p => p.exhausted || p.limit === 0)) break;
    const missing = total-available;
    for (const p of pools) if (!p.exhausted && p.limit > 0) p.limit += Math.max(250,missing);
  }
  const recent = (a: GameData,b: GameData) => new Date(b.playedAt).getTime()-new Date(a.playedAt).getTime();
  const selected = pools.flatMap(p => p.valid.sort(recent).slice(0,p.quota));
  const extras = pools.flatMap(p => p.valid.slice(p.quota)).sort(recent);
  return [...selected, ...extras.slice(0, Math.max(0,total-selected.length))].sort(recent).slice(0,total);
}
