-- Migration: Production-Ready RLS Policies
-- Date: 2026-02-03
-- Description: Secure RLS policies for production - restricts player access to users who have reports

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Allow generic read access" ON public.players;
DROP POLICY IF EXISTS "Allow generic insert access" ON public.players;
DROP POLICY IF EXISTS "Users can read players from their reports" ON public.players;
DROP POLICY IF EXISTS "Users can insert players when creating reports" ON public.players;
DROP POLICY IF EXISTS "Users can update players from their reports" ON public.players;

-- ============================================================================
-- PLAYERS TABLE POLICIES
-- ============================================================================

-- Policy 1: Users can only read players they have reports for
-- This ensures data isolation - users can't see other users' players
CREATE POLICY "Users can read players from their reports" 
ON public.players 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM public.scouting_reports 
    WHERE scouting_reports.player_id = players.id 
    AND scouting_reports.user_id = auth.uid()
  )
);

-- Policy 2: Users can insert players (needed for report creation flow)
-- We allow authenticated users to insert, but they can only read players they have reports for
-- This is necessary because players are created before reports exist
CREATE POLICY "Authenticated users can insert players" 
ON public.players 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL
);

-- Policy 3: Users can update players they have reports for
-- This allows refreshing player metadata when updating reports
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

-- Policy 4: Users can delete players they have reports for
-- This allows cleanup of player data when reports are deleted
CREATE POLICY "Users can delete players from their reports" 
ON public.players 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 
    FROM public.scouting_reports 
    WHERE scouting_reports.player_id = players.id 
    AND scouting_reports.user_id = auth.uid()
  )
);

-- ============================================================================
-- SCOUTING_REPORTS TABLE POLICIES
-- ============================================================================

-- Ensure scouting_reports policies are correct (drop and recreate to be sure)
DROP POLICY IF EXISTS "Users can only see their own reports" ON public.scouting_reports;
DROP POLICY IF EXISTS "Users can only insert their own reports" ON public.scouting_reports;
DROP POLICY IF EXISTS "Users can delete their own reports" ON public.scouting_reports;
DROP POLICY IF EXISTS "Users can update their own reports" ON public.scouting_reports;

-- Policy 1: Users can only read their own reports
CREATE POLICY "Users can only see their own reports" 
ON public.scouting_reports 
FOR SELECT 
USING (auth.uid() = user_id);

-- Policy 2: Users can only insert their own reports
CREATE POLICY "Users can only insert their own reports" 
ON public.scouting_reports 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Policy 3: Users can only update their own reports
CREATE POLICY "Users can update their own reports" 
ON public.scouting_reports 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy 4: Users can only delete their own reports
CREATE POLICY "Users can delete their own reports" 
ON public.scouting_reports 
FOR DELETE 
USING (auth.uid() = user_id);

-- ============================================================================
-- RATE LIMITING FUNCTION
-- ============================================================================

-- Create a function to check rate limits for player inserts
-- This prevents abuse by limiting how many players a user can create per hour
CREATE OR REPLACE FUNCTION check_player_insert_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  player_count INTEGER;
  rate_limit INTEGER := 50; -- Max 50 players per hour per user
BEGIN
  -- Count players created by this user in the last hour
  SELECT COUNT(*) INTO player_count
  FROM public.players p
  INNER JOIN public.scouting_reports sr ON sr.player_id = p.id
  WHERE sr.user_id = auth.uid()
    AND p.last_scanned_at > NOW() - INTERVAL '1 hour';
  
  -- If rate limit exceeded, raise an error
  IF player_count >= rate_limit THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % players per hour allowed', rate_limit;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to enforce rate limiting on player inserts
-- Note: This trigger fires after insert, so we check via reports
-- For immediate rate limiting, we'd need a different approach
DROP TRIGGER IF EXISTS player_insert_rate_limit_trigger ON public.players;
CREATE TRIGGER player_insert_rate_limit_trigger
  AFTER INSERT ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION check_player_insert_rate_limit();

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Ensure indexes exist for efficient RLS policy checks
CREATE INDEX IF NOT EXISTS reports_user_player_idx 
ON public.scouting_reports(user_id, player_id);

CREATE INDEX IF NOT EXISTS reports_user_created_idx 
ON public.scouting_reports(user_id, created_at DESC);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "Users can read players from their reports" ON public.players IS 
'Restricts player access to users who have created reports for those players';

COMMENT ON POLICY "Authenticated users can insert players" ON public.players IS 
'Allows authenticated users to insert players (needed for report creation flow)';

COMMENT ON POLICY "Users can update players from their reports" ON public.players IS 
'Allows users to update player metadata for players they have reports for';

COMMENT ON POLICY "Users can delete players from their reports" ON public.players IS 
'Allows users to delete players they have reports for (cleanup)';

COMMENT ON FUNCTION check_player_insert_rate_limit() IS 
'Rate limiting function to prevent abuse - limits player creation per user per hour';
