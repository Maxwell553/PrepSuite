import {beforeEach,describe,it,expect,vi} from 'vitest';
import {Hono} from 'hono';
const mocks=vi.hoisted(()=>({from:vi.fn(),consume:vi.fn()}));
vi.mock('../../src/lib/backend.js',()=>({backend:()=>({from:mocks.from})}));
vi.mock('../../src/lib/sharedLimits.js',()=>({consumeLimit:mocks.consume}));
vi.mock('../../src/pipeline/runAnalysis.js',()=>({runAnalysis:vi.fn()}));
import {jobsRoute} from '../../src/routes/jobs.js';
const app=new Hono();app.use('*',async(c,next)=>{c.set('user',{sub:'owner'});await next();});app.route('/api',jobsRoute);
let chain:any;
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('JOBS_ENABLED','true');mocks.consume.mockResolvedValue(true);chain={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),insert:vi.fn().mockReturnThis(),update:vi.fn().mockReturnThis(),in:vi.fn().mockResolvedValue({error:null}),single:vi.fn().mockResolvedValue({data:{id:'job-1',status:'queued'},error:null}),maybeSingle:vi.fn().mockResolvedValue({data:null,error:null})};mocks.from.mockReturnValue(chain);});
describe('owned resumable jobs',()=>{
 it('uses the authenticated owner regardless of request fields',async()=>{
  const res=await app.request('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Test Player',user_id:'attacker'})});
  expect(res.status).toBe(202);expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({user_id:'owner'}));
 });
 it('queries only the current user and hides other jobs',async()=>{
  const res=await app.request('/api/jobs/other-job');expect(res.status).toBe(404);expect(chain.eq).toHaveBeenCalledWith('user_id','owner');
 });
 it('cancels only active jobs belonging to the caller',async()=>{
  expect((await app.request('/api/jobs/job-1',{method:'DELETE'})).status).toBe(200);expect(chain.eq).toHaveBeenCalledWith('user_id','owner');expect(chain.in).toHaveBeenCalledWith('status',['queued','running']);
 });
 it('does not fall back to streaming on storage failure',async()=>{
  chain.single.mockResolvedValue({error:{message:'database down'}});
  const res=await app.request('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Test Player'})});expect(res.status).toBe(503);
 });
 it('rejects excess work without creating a job',async()=>{
  mocks.consume.mockResolvedValue(false);const res=await app.request('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Test Player'})});expect(res.status).toBe(429);expect(mocks.from).not.toHaveBeenCalled();
 });
});
