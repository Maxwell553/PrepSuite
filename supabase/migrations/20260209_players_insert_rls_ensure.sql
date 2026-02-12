-- Migration: Ensure authenticated users can insert into players (fix 42501)
-- Date: 2026-02-09
-- Fixes: "new row violates row-level security policy for table players"

-- Drop every known insert policy name that may exist from prior migrations
DROP POLICY IF EXISTS "Allow generic insert access" ON public.players;
DROP POLICY IF EXISTS "Users can insert players when creating reports" ON public.players;
DROP POLICY IF EXISTS "Authenticated users can insert players" ON public.players;

-- Single insert policy: any authenticated user can insert (required for report flow)
CREATE POLICY "Authenticated users can insert players"
ON public.players
FOR INSERT
TO authenticated
WITH CHECK (true);

COMMENT ON POLICY "Authenticated users can insert players" ON public.players IS
'Allows any authenticated user to insert players (needed before a report exists).';
