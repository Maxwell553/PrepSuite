import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE public.profiles(id uuid PRIMARY KEY, subscription_status text,stripe_subscription_id text,current_period_end timestamptz,updated_at timestamptz DEFAULT now());
 INSERT INTO auth.users VALUES ('${owner}'),('${other}'); INSERT INTO public.profiles(id) VALUES('${owner}');`);
 for(const file of ['20260316_profiles_credits.sql','20261010000100_harden_billing_and_limits.sql','20261010000200_analysis_jobs.sql','20261010000300_subscription_events.sql','20261010000400_credit_reservations.sql'])await db.exec(readFileSync(new URL(`../../../supabase/migrations/${file}`,import.meta.url).pathname.replace('/pipeline-service/supabase/','/supabase/'),'utf8'));
},30000);
afterAll(async()=>db.close());
describe('billing, limits and job migrations (real PostgreSQL engine)',()=>{
 it('denies browser credit mutations and permits service role',async()=>{
  const result=await db.query(`SELECT has_function_privilege('authenticated','public.add_credits(uuid,integer)','EXECUTE') AS add,has_function_privilege('anon','public.deduct_credits(uuid,integer)','EXECUTE') AS deduct,has_function_privilege('service_role','public.fulfill_credit_purchase(text,text,uuid,integer)','EXECUTE') AS fulfill`);
  expect(result.rows[0]).toEqual({add:false,deduct:false,fulfill:true});
 });
 it('fulfills a paid session exactly once, even with different event IDs',async()=>{
  await db.query('select public.fulfill_credit_purchase($1,$2,$3,$4)',['evt_1','cs_1',owner,100]);
  await db.query('select public.fulfill_credit_purchase($1,$2,$3,$4)',['evt_2','cs_1',owner,100]);
  expect((await db.query<{credits:number}>('select credits from public.profiles where id=$1',[owner])).rows[0].credits).toBe(3100);
 });
 it('rolls back the receipt when the profile update fails',async()=>{
  await expect(db.query('select public.fulfill_credit_purchase($1,$2,$3,$4)',['evt_missing','cs_missing',other,100])).rejects.toThrow('Profile not found');
  expect((await db.query('select * from public.billing_events where event_id=$1',['evt_missing'])).rows).toHaveLength(0);
 });
 it('ignores duplicate and older subscription events',async()=>{
  await db.query('select public.sync_subscription_event($1,$2,$3,$4,$5,$6)',['evt_new',200,owner,'sub_1','canceled',null]);
  await db.query('select public.sync_subscription_event($1,$2,$3,$4,$5,$6)',['evt_old',100,owner,'sub_1','active',null]);
  await db.query('select public.sync_subscription_event($1,$2,$3,$4,$5,$6)',['evt_new',200,owner,'sub_1','active',null]);
  expect((await db.query<{subscription_status:string}>('select subscription_status from public.profiles where id=$1',[owner])).rows[0].subscription_status).toBe('canceled');
 });
 it('reserves once across retries, settles actual usage, and refunds failures',async()=>{
  await db.query('select public.reserve_analysis_credits($1,$2,$3)',['analysis-1',owner,100]);
  await db.query('select public.reserve_analysis_credits($1,$2,$3)',['analysis-1',owner,100]);
  expect((await db.query<{credits:number}>('select credits from public.profiles where id=$1',[owner])).rows[0].credits).toBe(3000);
  await db.query('select public.settle_analysis_credits($1,$2,$3)',['analysis-1',40,true]);
  await db.query('select public.settle_analysis_credits($1,$2,$3)',['analysis-1',40,true]);
  expect((await db.query<{credits:number}>('select credits from public.profiles where id=$1',[owner])).rows[0].credits).toBe(3060);
  await db.query('select public.reserve_analysis_credits($1,$2,$3)',['analysis-2',owner,100]);
  await db.query('select public.settle_analysis_credits($1,$2,$3)',['analysis-2',0,false]);
  expect((await db.query<{credits:number}>('select credits from public.profiles where id=$1',[owner])).rows[0].credits).toBe(3060);
 });
 it('releases abandoned reservations and rejects insufficient balances',async()=>{
  expect((await db.query<{ok:boolean}>('select public.reserve_analysis_credits($1,$2,$3) ok',['too-large',owner,10000])).rows[0].ok).toBe(false);
  await db.query('select public.reserve_analysis_credits($1,$2,$3)',['abandoned',owner,100]);
  await db.exec("update public.credit_reservations set updated_at=now()-interval '11 minutes' where request_id='abandoned'");
  await db.exec('select public.release_expired_credit_reservations()');
  expect((await db.query<{credits:number}>('select credits from public.profiles where id=$1',[owner])).rows[0].credits).toBe(3060);
 });
 it('enforces a shared limit and resets expired windows',async()=>{
  for(let i=0;i<2;i++)expect((await db.query<{allowed:boolean}>("select public.consume_request_limit('test',2,60) allowed")).rows[0].allowed).toBe(true);
  expect((await db.query<{allowed:boolean}>("select public.consume_request_limit('test',2,60) allowed")).rows[0].allowed).toBe(false);
  await db.exec("update public.request_limits set window_started=now()-interval '2 minutes'");
  expect((await db.query<{allowed:boolean}>("select public.consume_request_limit('test',2,60) allowed")).rows[0].allowed).toBe(true);
 });
 it('claims at most four jobs, and reclaims an expired lease with a new attempt',async()=>{
  await db.query("insert into public.analysis_jobs(user_id,input) select $1,'{}'::jsonb from generate_series(1,5)",[owner]);
  for(let i=0;i<4;i++)expect((await db.query('select * from public.claim_analysis_job()')).rows).toHaveLength(1);
  expect((await db.query('select * from public.claim_analysis_job()')).rows).toHaveLength(0);
  await db.exec("update public.analysis_jobs set lease_until=now()-interval '1 second',created_at=now()-interval '1 hour' where id=(select id from public.analysis_jobs where status='running' order by created_at limit 1)");
  const reclaimed=await db.query<{attempts:number}>('select * from public.claim_analysis_job()');expect(reclaimed.rows).toHaveLength(1);expect(reclaimed.rows[0].attempts).toBe(2);
 });
 it('isolates users and denies direct job writes',async()=>{
  await db.exec(`GRANT USAGE ON SCHEMA public,auth TO authenticated; SET ROLE authenticated; SET request.jwt.claim.sub='${other}';`);
  try {
   expect((await db.query('select * from public.analysis_jobs')).rows).toHaveLength(0);
   await expect(db.query("insert into public.analysis_jobs(user_id,input) values($1,'{}')",[other])).rejects.toThrow(/permission denied/);
  } finally {await db.exec('RESET ROLE');}
 });
});
