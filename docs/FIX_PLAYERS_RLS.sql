-- ============================================================================
-- FIX: "new row violates row-level security policy for table players" (42501)
-- ============================================================================
-- Run this in Supabase Dashboard → SQL Editor if you can't use supabase db push
-- This enables authenticated users to save reports (SELECT, INSERT, UPDATE players)

-- Drop existing policies
DROP POLICY IF EXISTS "Allow generic insert access" ON public.players;
DROP POLICY IF EXISTS "Allow generic read access" ON public.players;
DROP POLICY IF EXISTS "Users can insert players when creating reports" ON public.players;
DROP POLICY IF EXISTS "Authenticated users can insert players" ON public.players;
DROP POLICY IF EXISTS "Users can read players from their reports" ON public.players;
DROP POLICY IF EXISTS "Users can update players from their reports" ON public.players;

-- SELECT: needed for findVerifiedPlayer lookup
CREATE POLICY "Authenticated users can read players"
ON public.players FOR SELECT
USING (auth.uid() IS NOT NULL);

-- INSERT: needed when creating a new player for a report
CREATE POLICY "Authenticated users can insert players"
ON public.players FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: needed when saving report for player that already exists
CREATE POLICY "Authenticated users can update players"
ON public.players FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE: keep restrictive (only delete players you have reports for)
DROP POLICY IF EXISTS "Users can delete players from their reports" ON public.players;
CREATE POLICY "Users can delete players from their reports"
ON public.players FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.scouting_reports
    WHERE scouting_reports.player_id = players.id
    AND scouting_reports.user_id = auth.uid()
  )
);
