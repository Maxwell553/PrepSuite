-- Migration: Fix RLS Policies for Production Security
-- Date: 2025-01-23
-- Description: Restricts player table access and adds proper security policies

-- Drop existing open policies
DROP POLICY IF EXISTS "Allow generic read access" ON public.players;
DROP POLICY IF EXISTS "Allow generic insert access" ON public.players;

-- Drop existing player policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can read players from their reports" ON public.players;
DROP POLICY IF EXISTS "Users can insert players when creating reports" ON public.players;
DROP POLICY IF EXISTS "Users can update players from their reports" ON public.players;

-- New Policy: Users can only read players they have created reports for
-- This prevents users from seeing all players in the database
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
  -- Allow if user is creating a report (they need to read the player they just created)
  EXISTS (
    SELECT 1 
    FROM public.scouting_reports 
    WHERE scouting_reports.user_id = auth.uid()
    AND scouting_reports.player_id = players.id
    AND scouting_reports.created_at > NOW() - INTERVAL '1 minute'
  )
);

-- New Policy: Users can insert players, but only when creating reports
-- This allows the report creation flow to work
CREATE POLICY "Users can insert players when creating reports" 
ON public.players 
FOR INSERT 
WITH CHECK (true); -- Allow insert, but RLS on reports table will ensure proper user_id

-- New Policy: Users can update players they have reports for
-- This allows updating player metadata when refreshing reports
CREATE POLICY "Users can update players from their reports" 
ON public.players 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 
    FROM public.scouting_reports 
    WHERE scouting_reports.player_id = players.id 
    AND scouting_reports.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.scouting_reports 
    WHERE scouting_reports.player_id = players.id 
    AND scouting_reports.user_id = auth.uid()
  )
);

-- Drop existing policies for scouting_reports if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can delete their own reports" ON public.scouting_reports;
DROP POLICY IF EXISTS "Users can update their own reports" ON public.scouting_reports;

-- Add delete policy for reports (users can delete their own reports)
CREATE POLICY "Users can delete their own reports" 
ON public.scouting_reports 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add update policy for reports (users can update their own reports)
CREATE POLICY "Users can update their own reports" 
ON public.scouting_reports 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
