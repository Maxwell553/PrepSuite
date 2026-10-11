import {beforeEach,describe,it,expect,vi} from 'vitest';
import {Hono} from 'hono';
import {SignJWT} from 'jose';
vi.mock('jose',async importOriginal=>({...await importOriginal<typeof import('jose')>(),createRemoteJWKSet:()=>async()=>{throw new Error('No test JWKS key');}}));
import {authMiddleware} from '../../src/middleware/auth.js';
const key=new TextEncoder().encode('test-only-authentication-secret-32-bytes');
const app=new Hono();app.use('*',authMiddleware);app.get('/',c=>c.json({user:c.get('user').sub}));
const token=(aud='authenticated',role='authenticated',issuer='https://test.supabase.co/auth/v1')=>new SignJWT({role}).setProtectedHeader({alg:'HS256'}).setSubject('test-user').setIssuer(issuer).setAudience(aud).setExpirationTime('5m').sign(key);
beforeEach(()=>{vi.stubEnv('SUPABASE_URL','https://test.supabase.co');vi.stubEnv('SUPABASE_JWT_SECRET','test-only-authentication-secret-32-bytes');});
describe('JWT boundary',()=>{
 it('accepts the configured project user token',async()=>expect((await app.request('/',{headers:{Authorization:`Bearer ${await token()}`}})).status).toBe(200));
 it('rejects a service role token',async()=>expect((await app.request('/',{headers:{Authorization:`Bearer ${await token('authenticated','service_role')}`}})).status).toBe(401));
 it('rejects a different issuer or audience',async()=>{
  for(const jwt of [await token('wrong'),await token('authenticated','authenticated','https://other.supabase.co/auth/v1')])expect((await app.request('/',{headers:{Authorization:`Bearer ${jwt}`}})).status).toBe(401);
 });
});
