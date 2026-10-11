import {it,expect} from 'vitest';
import {parseGameHistories,parseGameHistoriesAsync} from '../repertoireUtils';
import type {GameData} from '../../types';
it('reuses parsed histories for immutable report arrays across board views',async()=>{
 const games=[{id:'1',white:'A',black:'B',history:['e4','e5'],pgn:'',eco:'C20',source:'chess.com',playedAt:'2026-01-01',timeControl:'300',result:'1-0'}] as GameData[];
 const first=parseGameHistories(games);expect(await parseGameHistoriesAsync(games)).toBe(first);expect(parseGameHistories(games)).toBe(first);
 expect(parseGameHistories([...games])).not.toBe(first);
});
