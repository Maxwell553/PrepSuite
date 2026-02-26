-- Migration: OTB Games Index
-- Description: Table for Over-the-Board chess games imported from PGN.
--              Indexed by FIDE ID for fast lookup in the analysis pipeline.
--              Pipeline service uses SUPABASE_SERVICE_ROLE_KEY for read access.

CREATE TABLE IF NOT EXISTS public.otb_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    white_fide_id TEXT,
    black_fide_id TEXT,
    white TEXT NOT NULL,
    black TEXT NOT NULL,
    result TEXT,
    eco TEXT,
    event TEXT,
    site TEXT,
    game_date DATE,
    white_elo INT,
    black_elo INT,
    pgn TEXT,
    source TEXT DEFAULT 'otb'
);

-- Indexes for FIDE ID lookups (primary query pattern)
CREATE INDEX IF NOT EXISTS idx_otb_games_white_fide ON public.otb_games (white_fide_id) WHERE white_fide_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otb_games_black_fide ON public.otb_games (black_fide_id) WHERE black_fide_id IS NOT NULL;

-- Composite index for "games where player X participated" (OR query)
CREATE INDEX IF NOT EXISTS idx_otb_games_fide_lookup ON public.otb_games (white_fide_id, game_date DESC) WHERE white_fide_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otb_games_fide_lookup_black ON public.otb_games (black_fide_id, game_date DESC) WHERE black_fide_id IS NOT NULL;

-- RLS: Blocks anon/auth; service role bypasses for pipeline access
ALTER TABLE public.otb_games ENABLE ROW LEVEL SECURITY;

-- No permissive policies: anon/auth get no access. Service role bypasses RLS.
COMMENT ON TABLE public.otb_games IS 'OTB games indexed by FIDE ID; populated by import-otb script; read by pipeline service';
