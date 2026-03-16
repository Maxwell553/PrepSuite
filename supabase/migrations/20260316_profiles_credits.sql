-- Migration: Add credits column to profiles for credit-based monetization
-- Users get 3000 credits on signup; 1 credit per game analyzed

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 3000;

-- Ensure credits are non-negative
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_credits_non_negative CHECK (credits >= 0);

-- Update handle_new_user to set credits for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, subscription_status, credits)
    VALUES (NEW.id, 'free', 3000)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic credit deduction (used by pipeline service)
CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id UUID, p_amount INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  updated INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN TRUE;
  END IF;
  UPDATE public.profiles
  SET credits = credits - p_amount, updated_at = now()
  WHERE id = p_user_id AND credits >= p_amount;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add credits (used by stripe-webhook for credit pack purchases)
CREATE OR REPLACE FUNCTION public.add_credits(p_user_id UUID, p_amount INTEGER)
RETURNS VOID AS $$
BEGIN
  IF p_amount <= 0 THEN
    RETURN;
  END IF;
  UPDATE public.profiles
  SET credits = credits + p_amount, updated_at = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
