# Debugging Steps for Edge Function Error

## Step 1: Hard Refresh Browser
The browser is using cached JavaScript. You need to force reload:
- **Mac**: `Cmd + Shift + R`
- **Windows/Linux**: `Ctrl + Shift + F5`

Or restart your dev server completely.

## Step 2: Check Supabase Dashboard Logs
1. Go to: https://supabase.com/dashboard/project/luzhlmrytqhdzaxaxlag/functions
2. Click on `gemini-report`
3. Click the **Logs** tab
4. Look for the most recent error entries
5. Copy the error message and share it

The logs will show:
- What error occurred inside the function
- Whether it's an API key issue
- Whether it's an API format issue
- The actual error message from Gemini API

## Step 3: Check Browser Console
After hard refresh, try again and look for:
- `[Gemini] ========== EXCEPTION CAUGHT ==========`
- `[Gemini] Exception type:`
- `[Gemini] err.context:`

## Step 4: Test Function Directly
You can test the function directly using curl:

```bash
# Get your anon key from .env.local
ANON_KEY=$(grep VITE_SUPABASE_ANON_KEY .env.local | cut -d '=' -f2)

# Test the function
curl -X POST 'https://luzhlmrytqhdzaxaxlag.supabase.co/functions/v1/gemini-report' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{
    "prompt": "Test prompt",
    "responseSchema": {
      "type": "object",
      "properties": {
        "test": {"type": "string"}
      }
    }
  }'
```

This will show you the actual error response from the function.
