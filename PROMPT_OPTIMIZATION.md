# Prompt Optimization for Faster Google Search

## Changes Made

### 1. Simplified FIDE/USCF Search Prompt
**Before:** 6 search queries with detailed instructions (long prompt)
**After:** 2 simple queries:
- `"{Player Name} FIDE"`
- `"{Player Name} USCF"`

**Result:** Much shorter prompt, faster processing

### 2. Simplified Chess.com/Lichess Search Prompt  
**Before:** 16 search queries with extensive instructions (very long prompt)
**After:** 2 simple queries:
- `"{Player Name} chess.com"`
- `"{Player Name} lichess"`

**Result:** Dramatically reduced prompt length, should complete much faster

### 3. Increased Timeout
- Changed from 50 seconds to 55 seconds
- Allows Google Search to complete while staying under Supabase's ~60s limit

### 4. Re-enabled Google Search
- Changed default back to `useGoogleSearch: true`
- Needed for finding player IDs and usernames

## Expected Performance

- **Before:** 40-150+ seconds (timeout)
- **After:** 10-30 seconds (should complete successfully)

The simplified prompts should allow Google Search to complete much faster while still finding the necessary information.

## Next Steps

1. **Redeploy the function:**
   ```bash
   supabase functions deploy gemini-identity
   ```

2. **Test with a player name** - should complete in 10-30 seconds

3. **Check logs if still timing out:**
   ```bash
   supabase functions logs gemini-identity --follow
   ```

## If Still Getting 500 Errors

Check the function logs for the actual error message. The improved error handling will show:
- Error type
- Error message
- Full error details

This will help identify if it's:
- A timeout issue
- A Gemini API error
- A parsing error
- Something else
