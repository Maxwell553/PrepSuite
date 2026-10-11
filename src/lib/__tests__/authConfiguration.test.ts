import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks = vi.hoisted(()=>({signIn:vi.fn().mockResolvedValue({data:{},error:null})}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{signInWithPassword:mocks.signIn,signInWithOAuth:mocks.signIn,signInWithOtp:mocks.signIn,signUp:mocks.signIn}})}));
import {authActions} from '../supabase';
describe('authentication configuration',()=>{
 beforeEach(()=>{vi.stubEnv('PROD',false);mocks.signIn.mockClear();});
 afterEach(()=>vi.unstubAllEnvs());
 it('blocks missing settings before transmitting credentials',async()=>{
  vi.stubEnv('VITE_SUPABASE_URL','');vi.stubEnv('VITE_SUPABASE_ANON_KEY','');
  await expect(authActions.signInWithPassword('qa@example.test','test')).rejects.toThrow('not configured');
  await expect(authActions.signInWithGoogle()).rejects.toThrow('not configured');
  expect(mocks.signIn).not.toHaveBeenCalled();
 });
 it('allows configured sign-in',async()=>{
  vi.stubEnv('VITE_SUPABASE_URL','https://test.supabase.co');vi.stubEnv('VITE_SUPABASE_ANON_KEY','test-anon-key');
  await authActions.signInWithPassword('qa@example.test','test');
  expect(mocks.signIn).toHaveBeenCalledWith({email:'qa@example.test',password:'test'});
 });
});
