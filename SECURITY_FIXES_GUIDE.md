# Security Fixes Implementation Guide

This document outlines the security fixes implemented to address critical vulnerabilities identified in the production readiness analysis.

## ✅ Fixes Implemented

### 1. API Key Security (CRITICAL)

**Problem:** Gemini API keys were exposed in client-side code via Vite `define` configuration.

**Solution:**
- ✅ Removed API key definitions from `vite.config.ts`
- ✅ Updated `lib/env.ts` to remove client-side API key requirement
- ✅ All Gemini API calls now go through Supabase Edge Functions (server-side only)
- ✅ Removed unused `GoogleGenAI` import from `services/identity.ts`

**Files Changed:**
- `vite.config.ts` - Removed API key definitions
- `lib/env.ts` - Removed `geminiApiKey` from config, deprecated `getGeminiApiKey()`
- `services/identity.ts` - Removed unused imports

**Verification:**
- Build the app and check the bundle - no API keys should be present
- All Gemini calls use `geminiService` which calls edge functions
- Edge functions get API key from Supabase secrets (server-side only)

---

### 2. Row Level Security (RLS) Policies (CRITICAL)

**Problem:** Players table had open policies allowing any authenticated user to read/insert all players.

**Solution:**
- ✅ Created migration `20250123_fix_rls_policies.sql`
- ✅ Users can only read players they have reports for
- ✅ Users can insert players (needed for report creation flow)
- ✅ Users can update players they have reports for
- ✅ Added delete/update policies for reports table

**Migration File:** `supabase/migrations/20250123_fix_rls_policies.sql`

**To Apply:**
```bash
# Apply migration to your Supabase project
supabase db push

# Or if using Supabase CLI locally
supabase migration up
```

**New Policies:**
- `Users can read players from their reports` - Only see players you've created reports for
- `Users can insert players when creating reports` - Allow insert for report creation flow
- `Users can update players from their reports` - Update player metadata when refreshing reports
- `Users can delete their own reports` - Delete policy for reports
- `Users can update their own reports` - Update policy for reports

---

### 3. Input Validation & Sanitization (CRITICAL)

**Problem:** No input validation or sanitization on user-provided data.

**Solution:**
- ✅ Created `lib/validation.ts` with Zod schemas
- ✅ Added validation for player search inputs
- ✅ Sanitizes strings to prevent XSS/injection attacks
- ✅ Validates UUIDs, usernames, IDs
- ✅ Integrated validation into `SearchScreen.tsx`

**Files Created:**
- `lib/validation.ts` - Validation schemas and utilities

**Files Updated:**
- `components/SearchScreen.tsx` - Integrated validation in `handleSubmit`
- `package.json` - Added `zod` dependency

**Validation Rules:**
- Player name: 1-200 chars, no dangerous characters (`<>{}[]\/`)
- FIDE/USCF IDs: Numbers only, max 20 chars
- Usernames: Alphanumeric + underscore/hyphen, max 50 chars
- Game limit: 1-5000, integer

**To Install Dependencies:**
```bash
npm install zod
```

---

### 4. CORS Policy (HIGH)

**Problem:** Edge functions used open CORS (`Access-Control-Allow-Origin: *`).

**Solution:**
- ✅ Updated `supabase/functions/_shared/cors.ts` with origin validation
- ✅ Supports environment-based allowed origins
- ✅ Defaults to localhost (dev) and prepsuite.ai (production)
- ✅ Updated all edge functions to use new CORS helper

**Files Updated:**
- `supabase/functions/_shared/cors.ts` - Smart CORS with origin validation
- `supabase/functions/gemini-report/index.ts` - Uses new CORS helper
- `supabase/functions/gemini-identity/index.ts` - Uses new CORS helper
- `supabase/functions/delete-user/index.ts` - Uses new CORS helper

**Configuration:**
Set `ALLOWED_ORIGINS` environment variable in Supabase:
```bash
# Example: Allow multiple origins
supabase secrets set ALLOWED_ORIGINS="https://prepsuite.ai,https://www.prepsuite.ai,http://localhost:3000"
```

**Default Allowed Origins:**
- `http://localhost:3000` (development)
- `http://127.0.0.1:3000` (development)
- `https://prepsuite.ai` (production)
- `https://www.prepsuite.ai` (production)

---

## 🚀 Deployment Steps

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Apply Database Migration
```bash
# If using Supabase CLI
supabase db push

# Or apply manually via Supabase Dashboard
# Copy contents of supabase/migrations/20250123_fix_rls_policies.sql
# and run in SQL Editor
```

### Step 3: Set Environment Variables (Supabase)
```bash
# Set allowed origins for CORS (optional - defaults will work)
supabase secrets set ALLOWED_ORIGINS="https://prepsuite.ai,https://www.prepsuite.ai,http://localhost:3000"

# Verify GEMINI_API_KEY is set (should already be set)
supabase secrets list
```

### Step 4: Redeploy Edge Functions
```bash
# Deploy updated edge functions
supabase functions deploy gemini-report
supabase functions deploy gemini-identity
supabase functions deploy delete-user
```

### Step 5: Test Locally
```bash
npm run dev
```

Test that:
- ✅ Player search works with validation
- ✅ Invalid inputs show error messages
- ✅ Gemini API calls work (through edge functions)
- ✅ No API keys in browser bundle (check Network tab)

### Step 6: Build and Verify
```bash
npm run build

# Check dist folder - no API keys should be present
grep -r "GEMINI_API_KEY" dist/ || echo "✅ No API keys found in build"
```

---

## 🔍 Verification Checklist

- [ ] API keys removed from `vite.config.ts`
- [ ] No API keys in production build (check `dist/` folder)
- [ ] RLS migration applied successfully
- [ ] Input validation working (try invalid inputs)
- [ ] CORS restricted to allowed origins
- [ ] Edge functions deployed with new CORS
- [ ] All Gemini calls go through edge functions
- [ ] No console errors related to API keys

---

## 📝 Notes

### JWT Verification
JWT verification remains disabled in `supabase/config.toml` as requested. The edge functions still validate authentication through:
- Authorization header presence
- Supabase client session validation (where needed)
- RLS policies enforce user-level access control

### Backward Compatibility
- `getGeminiApiKey()` function still exists but throws an error with helpful message
- Old code paths will fail gracefully with clear error messages
- All existing Gemini calls already use `geminiService` (no changes needed)

### Environment Variables
**Client-side (.env.local):**
- `VITE_SUPABASE_URL` - Required
- `VITE_SUPABASE_ANON_KEY` - Required
- ~~`VITE_GEMINI_API_KEY`~~ - **REMOVED** (no longer needed)

**Server-side (Supabase Secrets):**
- `GEMINI_API_KEY` - Required (already set)
- `ALLOWED_ORIGINS` - Optional (uses defaults if not set)

---

## 🐛 Troubleshooting

### Issue: "Gemini API key is required" error
**Solution:** This is expected - the function is deprecated. All calls should use `geminiService` which calls edge functions.

### Issue: CORS errors in browser
**Solution:** 
1. Check `ALLOWED_ORIGINS` secret is set correctly
2. Verify your origin matches one of the allowed origins
3. Check browser console for exact CORS error

### Issue: RLS policy blocking legitimate access
**Solution:**
1. Check user is authenticated (`auth.uid()` is not null)
2. Verify user has created a report for the player
3. Check migration was applied correctly

### Issue: Validation errors on valid input
**Solution:**
1. Check Zod schema matches your input format
2. Verify input sanitization isn't removing needed characters
3. Check error message for specific validation failure

---

## 📚 Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Zod Documentation](https://zod.dev/)
- [CORS Best Practices](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

**Status:** ✅ All critical security fixes implemented and ready for testing.
