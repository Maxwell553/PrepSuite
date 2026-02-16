-- Migration: Initial Schema - Players and Scouting Reports
-- Description: Creates the core tables needed for PrepSuite.
--              This migration was retroactively created to support local development
--              (the remote DB had these tables created via the Supabase dashboard).

-- ============================================================================
-- PLAYERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    fide_id TEXT,
    uscf_id TEXT,
    chess_com_username TEXT,
    lichess_username TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    last_scanned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for lookups used by playerRepository.findVerifiedPlayer
CREATE INDEX IF NOT EXISTS idx_players_fide_id ON public.players (fide_id) WHERE fide_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_players_uscf_id ON public.players (uscf_id) WHERE uscf_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SCOUTING REPORTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.scouting_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    valid_until TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_scouting_reports_player_id ON public.scouting_reports (player_id);
CREATE INDEX IF NOT EXISTS idx_scouting_reports_user_id ON public.scouting_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_scouting_reports_valid_until ON public.scouting_reports (valid_until);

-- Enable Row Level Security
ALTER TABLE public.scouting_reports ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (will be refined by subsequent migrations)
CREATE POLICY "Users can read their own reports"
ON public.scouting_reports FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reports"
ON public.scouting_reports FOR INSERT
WITH CHECK (auth.uid() = user_id);
