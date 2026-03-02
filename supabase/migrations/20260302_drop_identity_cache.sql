-- Migration: Drop identity_cache table
-- Description: Remove identity cache; pipeline no longer uses it.

DROP TABLE IF EXISTS public.identity_cache;
