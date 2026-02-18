-- Migration: Identity Cache
-- Description: Server-side cache for resolved player identities to avoid repeated
--              FIDE/USCF/Gemini lookups for the same search inputs.
-- TTL: 24 hours. Pipeline service uses SUPABASE_SERVICE_ROLE_KEY for access.

CREATE TABLE IF NOT EXISTS public.identity_cache (
    search_key TEXT PRIMARY KEY,
    resolved_identity JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_identity_cache_expires_at ON public.identity_cache (expires_at);

-- RLS: Blocks anon/auth; service role bypasses RLS for pipeline access
ALTER TABLE public.identity_cache ENABLE ROW LEVEL SECURITY;

-- No permissive policies: anon/auth get no access. Service role bypasses RLS.
COMMENT ON TABLE public.identity_cache IS 'Cache for resolved player identities; TTL 24h; accessed by pipeline service via service role';
