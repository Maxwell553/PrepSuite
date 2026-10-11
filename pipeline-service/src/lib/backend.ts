import { createClient, type SupabaseClient } from '@supabase/supabase-js';
let client: SupabaseClient | undefined;
export function backend() {
  if (client) return client;
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Backend storage is not configured');
  return client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
