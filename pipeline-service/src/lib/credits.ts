/**
 * Credits service for pay-per-game analysis.
 * Uses Supabase service role to check and deduct credits.
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from './logger.js';

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** Get current credit balance for a user. Returns null if Supabase not configured. */
export async function getCredits(userId: string): Promise<number | null> {
  const supabase = getClient();
  if (!supabase) {
    logger.warn('[Credits] Supabase not configured');
    return null;
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return (data as { credits: number }).credits ?? 0;
}

/**
 * Check if user has enough credits for a given game count.
 * Returns true if they have >= required, false otherwise.
 * Returns true if Supabase not configured (allow in dev).
 */
export async function hasEnoughCredits(userId: string, required: number): Promise<boolean> {
  if (required <= 0) return true;
  const credits = await getCredits(userId);
  if (credits === null) return true; // No Supabase = allow (e.g. local dev)
  return credits >= required;
}

/**
 * Deduct credits after a successful analysis.
 * Uses atomic DB function to prevent race conditions.
 * @returns true if deduction succeeded, false if insufficient credits
 */
export async function deductCredits(userId: string, amount: number): Promise<boolean> {
  if (amount <= 0) return true;
  const supabase = getClient();
  if (!supabase) {
    logger.warn('[Credits] Supabase not configured, skipping deduct');
    return true; // Allow in dev
  }
  const { data, error } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    logger.error({ err: error, userId, amount }, '[Credits] Deduct failed');
    return false;
  }
  const success = data === true;
  if (!success) {
    logger.warn({ userId, amount }, '[Credits] Insufficient credits for deduct');
  }
  return success;
}
