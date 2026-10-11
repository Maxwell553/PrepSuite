import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../src/lib/ratingProvider.js',()=>({fetchOfficialFideText:vi.fn(),fetchRatingJson:vi.fn()}));
import {fetchOfficialFideText,fetchRatingJson} from '../../src/lib/ratingProvider.js';
import {fideRatingHistoryRoute} from '../../src/routes/fideRatingHistory.js';
beforeEach(()=>vi.resetAllMocks());
describe('dynamic FIDE history',()=>{
 it('rejects invalid IDs without contacting a provider',async()=>{
  expect((await fideRatingHistoryRoute.request('/fide-rating-history/not-a-player')).status).toBe(400);
  expect(fetchOfficialFideText).not.toHaveBeenCalled(); expect(fetchRatingJson).not.toHaveBeenCalled();
 });
 it('prefers FIDE chart JSON and does not call the backup on success',async()=>{
  vi.mocked(fetchOfficialFideText).mockResolvedValue(JSON.stringify([{date_2:'2026-Oct',rating:'1957',rapid_rtng:'2000',blitz_rtng:null}]));
  const response=await fideRatingHistoryRoute.request('/fide-rating-history/39907899');
  expect(await response.json()).toMatchObject({source:'FIDE',history:[{date:'2026-10',classicalRating:1957,rapidRating:2000}]});
  expect(fetchRatingJson).not.toHaveBeenCalled();
 });
 it('uses actual FIDE list data via Lichess only after the official source fails',async()=>{
  vi.mocked(fetchOfficialFideText).mockRejectedValue(new Error('timeout'));
  vi.mocked(fetchRatingJson).mockResolvedValue({standard:[2026101957,2026091940],rapid:[2026102000],blitz:[]});
  const response=await fideRatingHistoryRoute.request('/fide-rating-history/39907899');
  expect(await response.json()).toMatchObject({source:'FIDE via Lichess',history:[{date:'2026-09',classicalRating:1940},{date:'2026-10',classicalRating:1957,rapidRating:2000}]});
 });
 it('returns unavailable for empty data instead of fabricating ratings',async()=>{
  vi.mocked(fetchOfficialFideText).mockResolvedValue('[]');
  vi.mocked(fetchRatingJson).mockResolvedValue({standard:[],rapid:[],blitz:[]});
  const response=await fideRatingHistoryRoute.request('/fide-rating-history/999');
  expect(response.status).toBe(503);expect((await response.json()).history).toEqual([]);
 });
 it('stops the entire lookup at 6.5 seconds without repeated requests',async()=>{
  vi.useFakeTimers();
  try {
   vi.mocked(fetchOfficialFideText).mockImplementation(()=>new Promise(()=>{}));
   const pending=fideRatingHistoryRoute.request('/fide-rating-history/123');
   await vi.advanceTimersByTimeAsync(6500);
   expect((await pending).status).toBe(503);
   expect(fetchOfficialFideText).toHaveBeenCalledTimes(1);
   expect(fetchRatingJson).not.toHaveBeenCalled();
  } finally {vi.useRealTimers();}
 });
});
