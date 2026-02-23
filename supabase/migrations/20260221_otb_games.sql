-- Migration: OTB Games table for Lumbra Gigabase / self-hosted OTB database
-- Description: Stores OTB games indexed by FIDE ID for pipeline lookup.
--              Populated by scripts/import-otb-pgn.ts from PGN export of LumbrasGigabase_OTB.

-- ============================================================================
-- OTB_GAMES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.otb_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fide_id_white TEXT NOT NULL,
    fide_id_black TEXT NOT NULL,
    white TEXT NOT NULL,
    black TEXT NOT NULL,
    result TEXT NOT NULL,
    eco TEXT,
    event TEXT,
    date TEXT,
    pgn TEXT NOT NULL,
    white_elo INTEGER,
    black_elo INTEGER,
    source TEXT DEFAULT 'lumbras_gigabase',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for FIDE ID lookups (player appears as white or black)
CREATE INDEX IF NOT EXISTS idx_otb_games_fide_white ON public.otb_games (fide_id_white);
CREATE INDEX IF NOT EXISTS idx_otb_games_fide_black ON public.otb_games (fide_id_black);

-- Composite index for "games where this FIDE ID played" (either side)
CREATE INDEX IF NOT EXISTS idx_otb_games_fide_white_date ON public.otb_games (fide_id_white, date DESC);
CREATE INDEX IF NOT EXISTS idx_otb_games_fide_black_date ON public.otb_games (fide_id_black, date DESC);

-- No RLS: OTB games are read-only reference data, no user ownership.
-- Pipeline uses service role to read; import script uses service role to insert.
