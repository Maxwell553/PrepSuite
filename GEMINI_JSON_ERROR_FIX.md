# Gemini JSON Parsing Error Fix

## Problem Explanation

The error "Gemini response does not contain valid JSON. Response may be incomplete." occurs **occasionally** due to several possible causes:

### Root Causes

1. **Response Truncation**: Gemini API may truncate responses when:
   - The response exceeds token limits (output token limits)
   - Network issues cause incomplete transmission
   - Edge function timeout limits are reached

2. **Incomplete JSON Generation**: Gemini may occasionally:
   - Hit token limits mid-generation, cutting off JSON mid-object
   - Generate malformed JSON due to prompt complexity
   - Return partial responses when processing very large prompts

3. **Network Issues**: Intermittent network problems can cause:
   - Partial response transmission
   - Connection timeouts mid-stream
   - Response corruption during transfer

### Why It's Intermittent

- **Variable Prompt Size**: Different players have different amounts of game data, causing variable prompt sizes
- **Gemini API Load**: API response times and completeness vary with server load
- **Network Conditions**: Network stability affects response completeness

## Solutions Implemented

### 1. Enhanced JSON Parsing with Repair Logic (`supabase/functions/gemini-report/index.ts`)

**Added:**
- **JSON Completeness Checker**: `isJsonComplete()` function that validates JSON structure by:
  - Counting balanced braces `{}` and brackets `[]`
  - Properly handling strings (ignoring braces inside strings)
  - Detecting escape sequences

- **Automatic JSON Repair**: When incomplete JSON is detected:
  - Extracts the JSON object from the response
  - Works backwards from the end to find the last complete closing brace
  - Truncates at the last valid position
  - Attempts to parse the repaired JSON

- **Better Error Reporting**: Error responses now include:
  - Response length
  - Finish reason from Gemini (indicates truncation)
  - Preview of response start/end
  - Extracted JSON length

### 2. Client-Side Retry Logic (`services/geminiService.ts`)

**Added:**
- **Automatic Retry**: Up to 2 retries (3 total attempts) for:
  - 500 errors
  - "incomplete" errors
  - "truncated" errors
  - "valid JSON" errors

- **Exponential Backoff**: Waits 1s, then 2s between retries

- **Smart Retry Detection**: Only retries on recoverable errors (not auth errors, etc.)

### 3. Improved Logging

- Logs `finishReason` from Gemini API (indicates if response was truncated)
- Logs response length and preview
- Better error context for debugging

## Expected Behavior

**Before Fix:**
- ❌ Intermittent failures with "incomplete JSON" error
- ❌ No retry mechanism
- ❌ No JSON repair attempt

**After Fix:**
- ✅ Automatic retry on failures (up to 3 attempts)
- ✅ JSON repair attempts for incomplete responses
- ✅ Better error messages with diagnostic info
- ✅ Detection of truncated responses via `finishReason`

## How It Works

1. **First Attempt**: Normal JSON parse
2. **If Parse Fails**: 
   - Extract JSON object from response
   - Check if JSON is complete (balanced braces)
   - If incomplete: Find last complete closing brace and truncate there
   - Attempt to parse repaired JSON
3. **If Still Fails**: Return error with diagnostic info
4. **Client Retry**: Client automatically retries the entire request (up to 2 more times)

## Monitoring

To monitor this issue:
- Check Supabase function logs for `finishReason` values
- Look for "truncated" or "MAX_TOKENS" finish reasons
- Monitor response lengths - if consistently >100k chars, consider reducing prompt size further

## Future Improvements

If the issue persists:
1. **Reduce Prompt Size Further**: 
   - Reduce PGN sample from 30 to 20 games
   - Reduce game metadata from 50 to 30 games
   - Truncate PGNs to first 30 moves instead of 50

2. **Implement Streaming**: Use Gemini's streaming API to detect truncation earlier

3. **Chunked Responses**: Split large reports into multiple API calls

4. **Database Function**: Create a Supabase database function to handle JSON repair server-side
