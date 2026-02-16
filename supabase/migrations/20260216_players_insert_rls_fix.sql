-- Migration: Fix players RLS for save flow (42501)
-- Date: 2026-02-16
-- Fixes: "new row violates row-level security policy for table players"
--
-- The save flow requires:
-- 1. SELECT: findVerifiedPlayer looks up player by FIDE/USCF - user needs to see players
-- 2. INSERT: create new player when none exists
-- 3. UPDATE: update existing player when saving (player may exist from report generation)
--
-- Previous policies were too restrictive: UPDATE required having a report first (catch-22),
-- and SELECT only allowed players you already had reports for.

-- ============================================================================
-- DROP EXISTING POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "Allow generic insert access" ON public.players;
DROP POLICY IF EXISTS "Allow generic read access" ON public.players;
DROP POLICY IF EXISTS "Users can insert players when creating reports" ON public.players;
DROP POLICY IF EXISTS "Authenticated users can insert players" ON public.players;
DROP POLICY IF EXISTS "Users can read players from their reports" ON public.players;
DROP POLICY IF EXISTS "Users can update players from their reports" ON public.players;

-- ============================================================================
-- SELECT: Authenticated users can read players (needed for findVerifiedPlayer)
-- ============================================================================
CREATE POLICY "Authenticated users can read players"
ON public.players
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- INSERT: Authenticated users can create players (needed for new reports)
-- ============================================================================
CREATE POLICY "Authenticated users can insert players"
ON public.players
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- UPDATE: Authenticated users can update players (needed when saving report
-- for a player that already exists from report generation or another user)
-- ============================================================================
CREATE POLICY "Authenticated users can update players"
ON public.players
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- DELETE: Keep restrictive - only delete players you have reports for
-- (or allow authenticated to delete - for now keep safe)
-- ============================================================================
DROP POLICY IF EXISTS "Users can delete players from their reports" ON public.players;
CREATE POLICY "Users can delete players from their reports"
ON public.players
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.scouting_reports
    WHERE scouting_reports.player_id = players.id
    AND scouting_reports.user_id = auth.uid()
  )
);
