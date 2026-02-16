-- Migration: Fix Player Insert Policy
-- Date: 2025-01-24
-- Description: Allow authenticated users to insert players (needed for report creation flow)

-- Drop existing insert policy
DROP POLICY IF EXISTS "Users can insert players when creating reports" ON public.players;

-- New Policy: Allow authenticated users to insert players
-- This is needed because players are created before reports, so we can't check for report existence
-- We allow any authenticated user to insert players, but they can only read players they have reports for
CREATE POLICY "Users can insert players when creating reports" 
ON public.players 
FOR INSERT 
WITH CHECK (
  -- Allow if user is authenticated (has a user_id)
  -- This allows the report creation flow: create player first, then create report
  auth.uid() IS NOT NULL
);
