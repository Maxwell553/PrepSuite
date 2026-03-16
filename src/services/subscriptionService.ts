/**
 * Credits and profile service.
 * Credit-based monetization: users get 3000 credits, 1 credit per game analyzed.
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
  credits: number;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, credits')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return { ...data, credits: (data as { credits?: number }).credits ?? 0 } as Profile;
}

/** Create Stripe Checkout Session for credit pack purchase (one-time payment) */
export async function createCreditsCheckoutSession(
  pack: 'starter' | 'standard' | 'pro',
  successUrl?: string,
  cancelUrl?: string
): Promise<{ url: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Authentication required');
  }

  const config = getEnvConfig();
  const { data, error } = await supabase.functions.invoke('stripe-credits-checkout', {
    body: { pack, success_url: successUrl, cancel_url: cancelUrl },
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

/** Create Stripe Customer Portal session (manage payment methods) */
export async function createPortalSession(returnUrl?: string): Promise<{ url: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Authentication required');
  }

  const config = getEnvConfig();
  const { data, error } = await supabase.functions.invoke('stripe-portal', {
    body: { return_url: returnUrl },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: config.supabaseAnonKey,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.url) throw new Error('No portal URL returned');
  return { url: data.url };
}
