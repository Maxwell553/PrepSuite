import { useState, useEffect } from 'react';
import { getProfile, isPremiumStatus, type Profile } from '../services/subscriptionService';

export function useSubscription(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!!userId);

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
        if (!cancelled) {
          setProfile(p);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isPremium = profile ? isPremiumStatus(profile.subscription_status) : false;
  return { profile, isPremium, loading };
}
