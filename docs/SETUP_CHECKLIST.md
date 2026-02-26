# Step-by-Step Setup Checklist

Follow these steps to set up PrepSuite for local development and deployment.

## Prerequisites Check

- [ ] You have a Supabase account and project
- [ ] You have Supabase CLI installed (see Step 1 below)
- [ ] You have your Gemini API key from Google AI Studio
- [ ] Node.js 18+ installed

## Step 1: Install Supabase CLI (if not already installed)

**On macOS (using Homebrew):**
```bash
brew install supabase/tap/supabase
```

**On Linux (using Homebrew):**
```bash
brew install supabase/tap/supabase
```

**On Windows (using Scoop):**
```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

Verify installation:
```bash
supabase --version
```

## Step 2: Link to Your Supabase Project

```bash
cd /path/to/prepsuite
supabase link --project-ref YOUR_PROJECT_REF
```

See [README.md](../README.md) for how to find your project ref.

## Step 3: Apply Database Migrations

```bash
supabase db push
```

This applies all migrations in `supabase/migrations/` (players, scouting_reports, RLS policies).

## Step 4: Set Up Frontend Environment

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Get these from Supabase Dashboard → Settings → API.

## Step 5: Set Up Pipeline Service (Required for Analysis)

The analysis pipeline runs in a separate Node service. Set it up:

```bash
cd pipeline-service
cp .env.example .env
```

Edit `pipeline-service/.env`:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret
GEMINI_API_KEY=your-gemini-api-key
```

- **SUPABASE_JWT_SECRET**: Supabase Dashboard → Settings → API → JWT Secret
- **GEMINI_API_KEY**: From https://aistudio.google.com/app/apikey

## Step 6: Deploy Supabase Edge Functions

Deploy the remaining edge functions (delete-user, health):

```bash
supabase functions deploy delete-user
supabase functions deploy health
```

**Note:** `gemini-identity` and `gemini-report` have been removed. The pipeline service handles identity and report generation.

## Step 7: Run the Application

**Terminal 1 — Pipeline service:**
```bash
cd pipeline-service
npm install && npm run dev
```
Runs on port 8080.

**Terminal 2 — Frontend:**
```bash
npm run dev
```
Runs on port 3000. Vite proxies `/api/*` to the pipeline service.

## Step 8: Test the Setup

1. Open http://localhost:3000
2. Sign up or log in
3. Search for a player (e.g. "Magnus Carlsen")
4. Verify a report is generated

## Troubleshooting

### "Pipeline service error: 404"
- **Solution:** Ensure the pipeline service is running on port 8080
- Start it with: `cd pipeline-service && npm run dev`

### "Authentication required"
- **Solution:** Log in before searching. The pipeline requires a valid JWT.

### "GEMINI_API_KEY not configured"
- **Solution:** Set the key in `pipeline-service/.env`
- The pipeline service reads from its own .env, not the root `.env.local`

### RLS errors when saving reports
- **Solution:** Ensure migrations are applied: `supabase db push`
- See `docs/DEPLOYMENT_SETUP.md` for RLS policy details

## Quick Reference

**Start development:**
```bash
# Terminal 1
cd pipeline-service && npm run dev

# Terminal 2
npm run dev
```

**Deploy edge functions:**
```bash
supabase functions deploy delete-user
supabase functions deploy health
```

**Apply migrations:**
```bash
supabase db push
```

## Success Indicators

✅ Pipeline service runs on port 8080  
✅ Frontend runs on port 3000  
✅ Can log in and search for a player  
✅ Report is generated and displayed  
✅ No 404 on `/api/analyze`  

## Next Steps

- See `docs/DEPLOYMENT_SETUP.md` for production deployment
- See `docs/SUPABASE_MIGRATION.md` for details on the edge function migration
