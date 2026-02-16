-- Migration: Fix Player Insert RLS Policy (More Robust)
-- Date: 2025-01-26
-- Description: Ensure authenticated users can insert players without RLS violations

-- Drop existing insert policy
DROP POLICY IF EXISTS "Users can insert players when creating reports" ON public.players;

-- Create a more explicit policy that ensures authentication is checked
-- This policy explicitly allows any authenticated user to insert players
CREATE POLICY "Users can insert players when creating reports" 
ON public.players 
FOR INSERT 
WITH CHECK (
  -- Explicitly check that user is authenticated
  -- This is necessary because players are created before reports exist
  auth.uid() IS NOT NULL
);

-- Also ensure the SELECT policy allows reading newly inserted players
-- This is needed so users can read the player they just created before the report exists
DROP POLICY IF EXISTS "Users can read players from their reports" ON public.players;

CREATE POLICY "Users can read players from their reports" 
ON public.players 
FOR SELECT 
USING (
  -- Allow if user has a report for this player
  EXISTS (
    SELECT 1 
    FROM public.scouting_reports 
    WHERE scouting_reports.player_id = players.id 
    AND scouting_reports.user_id = auth.uid()
  )
  OR
  -- Allow reading players that were recently created (within last 10 minutes)
  -- This allows users to read players they just inserted before creating the report
  -- We use a time window to allow the read-after-insert scenario
  (players.last_scanned_at IS NOT NULL 
   AND players.last_scanned_at > NOW() - INTERVAL '10 minutes')
);
