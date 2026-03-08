/**
 * Subscription service for premium feature gating.
 * Reads profile from Supabase; isPremium when subscription_status === 'active' or 'trialing'.
 */

import { supabase } from '../lib/supabase';
import { getEnvConfig } from '../lib/env';

export type SubscriptionStatus = 'free' | 'active' | 'canceled' | 'past_due' | 'trialing';

export interface Profile {
  id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

export function isPremiumStatus(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

export async function createCheckoutSession(successUrl?: string, cancelUrl?: string): Promise<{ url: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Authentication required');
  }

  const config = getEnvConfig();
  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: { success_url: successUrl, cancel_url: cancelUrl },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: config.supabaseAnonKey,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.url) throw new Error('No checkout URL returned');
  return { url: data.url };
}
