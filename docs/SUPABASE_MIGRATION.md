# Supabase Migration: Remove Deprecated Edge Functions

This document describes the Supabase changes needed after migrating to the pipeline-service architecture.

## Summary

The `gemini-identity` and `gemini-report` edge functions have been **removed** from the codebase. The pipeline service (Cloud Run) now handles identity resolution and report generation.

## What You Need to Do in Supabase

### 1. Remove Deployed Edge Functions (if deployed)

If you previously deployed `gemini-identity` and `gemini-report`, remove them from your Supabase project:

```bash
# List current functions
supabase functions list

# Delete the deprecated functions (Supabase CLI)
# Note: Supabase CLI doesn't have a direct "delete" command for deployed functions.
# You can remove them from the dashboard or leave them deployed (they won't be called).
```

**Via Supabase Dashboard:**
1. Go to your project → **Edge Functions**
2. If `gemini-identity` and `gemini-report` appear, you can leave them (they are unused) or contact Supabase support to remove them

**Note:** Leaving deprecated functions deployed does not affect the app; they are simply not called. The frontend and pipeline service no longer reference them.

### 2. Config Updates (Already Done)

The following have been updated in this repo:
- `supabase/config.toml` — Removed `[functions.gemini-identity]` and `[functions.gemini-report]` config blocks
- No code references these functions anymore

### 3. Required Edge Functions

Ensure these are deployed:

```bash
supabase functions deploy delete-user
supabase functions deploy health
```

### 4. Secrets

The pipeline service uses its own Gemini API key (in `pipeline-service/.env`). Supabase secrets are still needed for:
- `GEMINI_API_KEY` — Only if you use any remaining edge functions that call Gemini (e.g. `gemini-chat` if it exists). The pipeline service uses its own key.
- `ALLOWED_ORIGINS` — Optional, for CORS on edge functions

### 5. No Database Changes

No database migrations are required for this migration. The `players` and `scouting_reports` tables are unchanged.

## Verification

1. Run the app with the pipeline service: `cd pipeline-service && npm run dev`
2. Run the frontend: `npm run dev`
3. Submit a player search — verify the report is generated
4. Check that no requests go to `/functions/v1/gemini-identity` or `/functions/v1/gemini-report` (they should be absent from network tab)
