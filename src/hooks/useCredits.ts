/**
 * Hook for credit balance and checks.
 * Replaces useSubscription for credit-based monetization.
 */

import { useState, useEffect, useCallback } from 'react';
import { getProfile, type Profile } from '../services/subscriptionService';

export function useCredits(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!!userId);

  const fetchProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const p = await getProfile(userId);
    setProfile(p);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getProfile(userId)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId]);

  const credits = profile?.credits ?? 0;
  const hasEnoughCredits = (required: number) => credits >= required;

  return { profile, credits, hasEnoughCredits, loading, refetch: fetchProfile };
}
