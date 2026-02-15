# Step-by-Step Setup Checklist

Follow these steps in order to set up the Supabase Edge Functions for secure Gemini API calls.

## Prerequisites Check

- [ ] You have a Supabase account and project
- [ ] You have Supabase CLI installed (see Step 1 below)
- [ ] You have your Gemini API key from Google AI Studio

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

**Alternative: Direct download**
Visit: https://github.com/supabase/cli/releases and download the binary for your OS.

Verify installation:
```bash
supabase --version
```

## Step 2: Initialize Supabase in Your Project (if not already done)

```bash
cd /Users/maxingargiola/Desktop/Lockin/prepsuite
supabase init
```

This creates a `supabase` folder structure (if it doesn't exist).

## Step 3: Link to Your Supabase Project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### How to Find Your Project Ref

**Method 1: From Project Settings**
1. Go to https://supabase.com/dashboard
2. Select your project (or create a new one if you don't have one)
3. Click on **Settings** (gear icon in the left sidebar)
4. Click on **General** in the settings menu
5. Look for **Reference ID** - it's a string like `abcdefghijklmnop` (usually 20 characters)
6. Copy this Reference ID

**Method 2: From Project URL**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Look at the URL in your browser - it will be something like:
   `https://supabase.com/dashboard/project/abcdefghijklmnop`
4. The part after `/project/` is your project ref

**Method 3: From API Settings**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Look for **Project URL** - it will be:
   `https://abcdefghijklmnop.supabase.co`
5. The part before `.supabase.co` is your project ref

**If you don't have a project yet:**
1. Go to https://supabase.com/dashboard
2. Click **New Project**
3. Fill in:
   - Project name
   - Database password (save this!)
   - Region (choose closest to you)
4. Wait for project to be created (takes 1-2 minutes)
5. Once created, use any of the methods above to find the Reference ID

## Step 4: Set the Gemini API Key as a Secret

```bash
supabase secrets set GEMINI_API_KEY=your-actual-gemini-api-key-here
```

**Important:** Replace `your-actual-gemini-api-key-here` with your real API key.

**How to get your Gemini API key:**
1. Go to https://aistudio.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key (it starts with `AIza...`)

**Verify the secret was set:**
```bash
supabase secrets list
```

You should see `GEMINI_API_KEY` in the list (the value will be hidden for security).

## Step 5: Deploy the Edge Functions

Deploy both functions:

```bash
# Deploy identity resolution function
supabase functions deploy gemini-identity

# Deploy report generation function
supabase functions deploy gemini-report
```

**Expected output:** You should see success messages for both deployments.

**Verify deployment:**
```bash
supabase functions list
```

You should see both `gemini-identity` and `gemini-report` in the list.

## Step 6: Remove Client-Side API Key (Optional but Recommended)

Since the API key is now server-side, you can remove it from your client environment:

1. Open your `.env.local` file
2. Remove or comment out the line: `VITE_GEMINI_API_KEY=...`
3. Save the file

**Note:** The app will still work without this, but it's better security practice to remove it.

## Step 7: Test the Setup

### Option A: Test via the App
1. Start your development server: `npm run dev`
2. Try generating a scouting report
3. Check the browser console for any errors

### Option B: Test via curl (Advanced)

Test identity function:
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/gemini-identity \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Find Chess.com username for Max Ingargiola"}'
```

Test report function:
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/gemini-report \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Test prompt", "responseSchema": {"type": "object"}}'
```

**How to find your anon key:**
1. Go to Supabase Dashboard → Settings → API
2. Copy the "anon public" key

## Troubleshooting

### Error: "Function not found"
- **Solution:** Make sure you deployed both functions (Step 5)
- Verify with: `supabase functions list`

### Error: "GEMINI_API_KEY not configured"
- **Solution:** Make sure you set the secret (Step 4)
- Verify with: `supabase secrets list`

### Error: "Unauthorized" or 401
- **Solution:** Make sure you're using the correct anon key
- Check that your Supabase project is linked correctly

### Functions deploy but don't work
- **Solution:** Check function logs:
  ```bash
  supabase functions logs gemini-identity
  supabase functions logs gemini-report
  ```

## Quick Reference

**Deploy functions:**
```bash
supabase functions deploy gemini-identity
supabase functions deploy gemini-report
```

**Set/update secret:**
```bash
supabase secrets set GEMINI_API_KEY=your-key-here
```

**View secrets:**
```bash
supabase secrets list
```

**View function logs:**
```bash
supabase functions logs gemini-identity
supabase functions logs gemini-report
```

**List deployed functions:**
```bash
supabase functions list
```

## Success Indicators

✅ Both functions appear in `supabase functions list`  
✅ `GEMINI_API_KEY` appears in `supabase secrets list`  
✅ App can generate scouting reports without errors  
✅ No API key errors in browser console  

## Next Steps After Setup

Once everything is working:
1. Test the full flow: search for a player and generate a report
2. Monitor function logs for any issues
3. Consider adding rate limiting for production use
4. Set up monitoring/alerts if needed

---

**Need Help?** Check the full documentation in `EDGE_FUNCTIONS_SETUP.md` for more details.
