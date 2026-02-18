import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { logger } from './logger.js';
import type { ResolvedIdentity } from './types.js';

const TTL_HOURS = 24;
const TABLE = 'identity_cache';

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}

function searchKey(
  inputName: string,
  fideId: string,
  uscfId: string,
  chessCom?: string,
  lichess?: string,
): string {
  const payload = JSON.stringify({
    n: (inputName || '').trim().toLowerCase(),
    f: (fideId || '').trim().toLowerCase(),
    u: (uscfId || '').trim().toLowerCase(),
    c: (chessCom || '').trim().toLowerCase(),
    l: (lichess || '').trim().toLowerCase(),
  });
  return createHash('sha256').update(payload).digest('hex');
}

export async function getCachedIdentity(
  inputName: string,
  fideId: string,
  uscfId: string,
  chessCom?: string,
  lichess?: string,
): Promise<ResolvedIdentity | null> {
  const supabase = getClient();
  if (!supabase) return null;

  const key = searchKey(inputName, fideId, uscfId, chessCom, lichess);
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('resolved_identity, expires_at')
      .eq('search_key', key)
      .single();

    if (error || !data) return null;
    if (new Date(data.expires_at) <= new Date()) return null;

    const identity = data.resolved_identity as ResolvedIdentity;
    if (!identity || typeof identity.verifiedName !== 'string') return null;

    logger.info({ searchKey: key.slice(0, 12) }, '[IdentityCache] Hit');
    return identity;
  } catch (err) {
    logger.warn({ err, key: key.slice(0, 12) }, '[IdentityCache] Get failed');
    return null;
  }
}

export async function setCachedIdentity(
  inputName: string,
  fideId: string,
  uscfId: string,
  chessCom: string | undefined,
  lichess: string | undefined,
  identity: ResolvedIdentity,
): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;

  const key = searchKey(inputName, fideId, uscfId, chessCom, lichess);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_HOURS * 60 * 60 * 1000);

  try {
    const { error } = await supabase.from(TABLE).upsert(
      {
        search_key: key,
        resolved_identity: identity,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'search_key' },
    );
    if (error) {
      logger.warn({ err: error.message, key: key.slice(0, 12) }, '[IdentityCache] Set failed');
    } else {
      logger.info({ searchKey: key.slice(0, 12) }, '[IdentityCache] Stored');
    }
  } catch (err) {
    logger.warn({ err, key: key.slice(0, 12) }, '[IdentityCache] Set failed');
  }
}
