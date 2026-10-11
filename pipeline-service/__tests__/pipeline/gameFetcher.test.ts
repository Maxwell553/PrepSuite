import {it,expect,vi} from 'vitest';
vi.mock('../../src/pipeline/chessCom.js',()=>({fetchChessComGames:vi.fn().mockRejectedValue(new Error('upstream unavailable'))}));
vi.mock('../../src/pipeline/lichess.js',()=>({fetchLichessGames:vi.fn().mockResolvedValue({ndjson:'{"id":"one"}',totalFetched:1})}));
import {fetchGames} from '../../src/pipeline/gameFetcher.js';
it('keeps Lichess results when Chess.com is temporarily unavailable',async()=>{
 const result=await fetchGames('test','test',500,{sendPhase:vi.fn(),sendProgress:vi.fn()} as any);
 expect(result.totalGames).toBe(1);expect(result.lichessGamesNdjson).toContain('one');
});
