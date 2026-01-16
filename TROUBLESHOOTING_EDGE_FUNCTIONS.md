# Troubleshooting Edge Functions

If you're getting "Edge Function returned a non-2xx status code", follow these steps:

## Step 1: Check if Functions are Deployed

```bash
supabase functions list
```

You should see both `gemini-identity` and `gemini-report` in the list.

**If functions are missing:**
```bash
supabase functions deploy gemini-identity
supabase functions deploy gemini-report
```

## Step 2: Verify API Key Secret is Set

```bash
supabase secrets list
```

You should see `GEMINI_API_KEY` in the list.

**If secret is missing:**
```bash
supabase secrets set GEMINI_API_KEY=your-actual-api-key-here
```

**Important:** Make sure you're using the correct project. Verify with:
```bash
supabase projects list
```

## Step 3: Check Function Logs

**View logs through Supabase Dashboard (Recommended):**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Edge Functions** in the left sidebar
4. Click on `gemini-identity` or `gemini-report`
5. Click on the **Logs** tab
6. Look for recent error messages

**Alternative: View logs via API (if you have the project ref):**
```bash
# Get your project ref first
supabase status

# Then view logs (replace YOUR_PROJECT_REF with your actual ref)
curl -H "Authorization: Bearer YOUR_ANON_KEY" \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/gemini-identity \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test"}'
```

Look for error messages that indicate:
- Missing API key
- Invalid API key
- Network errors
- Parsing errors

## Step 4: Test Functions Directly

### Test Identity Function

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/gemini-identity \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Test prompt"}'
```

### Test Report Function

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/gemini-report \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Test", "responseSchema": {"type": "object"}}'
```

Replace:
- `YOUR_PROJECT_REF` with your actual project reference ID
- `YOUR_ANON_KEY` with your Supabase anon key (from Dashboard → Settings → API)

## Common Errors and Solutions

### Error: "GEMINI_API_KEY not configured"
**Solution:** Set the secret:
```bash
supabase secrets set GEMINI_API_KEY=your-key-here
```

### Error: "Function not found" or 404
**Solution:** Deploy the functions:
```bash
supabase functions deploy gemini-identity
supabase functions deploy gemini-report
```

### Error: "Unauthorized" or 401
**Solution:** 
- Check that you're using the correct anon key
- Verify your project is linked: `supabase link --project-ref YOUR_PROJECT_REF`

### Error: "Invalid JSON" or 400
**Solution:**
- Check the request body format
- Ensure prompt is a string
- For report function, ensure responseSchema is a valid object

### Error: Network timeout or 504
**Solution:**
- Gemini API calls can take time
- Check function timeout settings in Supabase dashboard
- Consider increasing timeout if needed

## Step 5: Verify Project Link

Make sure your local project is linked to the correct Supabase project:

```bash
supabase status
```

This shows your linked project. If wrong, re-link:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

## Step 6: Check Browser Console (CRITICAL FOR "NO INVOCATIONS" ISSUE)

Open your browser's developer console (F12) and look for:
- **`[Gemini] Calling gemini-identity function...`** - confirms the function is being called
- **`[Gemini] Supabase URL: ...`** - verify this matches your project URL
- **`[Gemini] Function response status:`** - shows HTTP status code
- **`[Gemini] Function response error:`** - shows detailed error information
- Network tab → Check if request to `/functions/v1/gemini-identity` is being made
  - If NO network request appears → Supabase client isn't configured correctly
  - If request appears but fails → Check the error response
- Response status codes

The updated `geminiService.ts` now logs more detailed error information.

## Step 7: Verify Edge Function Code

Make sure the Edge Function files exist and are correct:

```bash
ls -la supabase/functions/gemini-identity/
ls -la supabase/functions/gemini-report/
```

Both should have an `index.ts` file.

## Still Having Issues?

1. **Check Supabase Dashboard:**
   - Go to your project dashboard
   - Navigate to Edge Functions
   - Check function status and logs

2. **Verify API Key:**
   - Test your Gemini API key directly:
   ```bash
   curl https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=YOUR_KEY \
     -H 'Content-Type: application/json' \
     -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
   ```

3. **Check Function Permissions:**
   - Ensure functions are publicly accessible or properly authenticated
   - Check RLS policies if using authentication

4. **Review Function Logs in Dashboard:**
   - Supabase Dashboard → Edge Functions → Select function → Logs
   - Look for detailed error messages

## Quick Checklist

- [ ] Functions are deployed (`supabase functions list`)
- [ ] API key secret is set (`supabase secrets list`)
- [ ] Project is linked (`supabase status`)
- [ ] Functions are accessible (test with curl)
- [ ] No errors in function logs (check Supabase Dashboard → Edge Functions → Logs)
- [ ] API key is valid (test directly)
