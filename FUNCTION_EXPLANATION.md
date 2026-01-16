# Edge Functions Explanation

## Two Functions Overview

### 1. `gemini-identity` (Username Discovery)
**Purpose:** Finds Chess.com and Lichess usernames via web search when they're not provided.

**When it's called:**
- ✅ **Called when:** User provides FIDE ID/USCF ID but NOT Chess.com/Lichess usernames
- ❌ **NOT called when:** User provides Chess.com/Lichess usernames directly

**What it does:**
1. Uses Google Search Retrieval to search for player profiles
2. Finds actual profile URLs (e.g., `chess.com/pub/player/username`, `lichess.org/@/username`)
3. Returns URLs that are then scraped to extract and verify usernames
4. Performs bio-metric matching (name, title, birth year, federation) to verify correctness

**Code location:** `services/identity.ts` line 179
```typescript
// Only called if needsChessComDiscovery || needsLichessDiscovery is true
if (needsChessComDiscovery || needsLichessDiscovery) {
    const text = await geminiService.generateContentWithSearch(prompt);
    // ... processes response to find usernames
}
```

**Why you might not see it called:**
- You're providing Chess.com/Lichess usernames directly in the search form
- Both usernames are already found/verified
- The identity resolution step is skipped

---

### 2. `gemini-report` (Scouting Report Generation)
**Purpose:** Generates the final scouting report with structured JSON output.

**When it's called:**
- ✅ **Always called** after games are fetched and analyzed
- ✅ Called when generating the scouting report with all game data

**What it does:**
1. Takes all fetched game data (up to 1000 games from Chess.com + Lichess)
2. Takes Stockfish analysis results
3. Takes opening statistics
4. Generates a comprehensive scouting report with:
   - Player strengths/weaknesses
   - Opening preferences and performance
   - Tactical patterns
   - Endgame accuracy
   - Overall assessment

**Code location:** `components/SearchScreen.tsx` line 476
```typescript
const reportData = await geminiService.generateContentWithSchema(
    prompt,
    responseSchema
);
```

---

## Why `gemini-identity` Isn't Being Called

If you're seeing `gemini-report` being called but not `gemini-identity`, it means:

1. **You provided usernames directly** - If you entered Chess.com/Lichess usernames in the search form, the identity discovery step is skipped entirely.

2. **Both usernames were found** - If the system already has both usernames (from previous searches or provided input), it doesn't need to search.

3. **Identity resolution completed earlier** - The identity resolution happens BEFORE game fetching. If it completed successfully, you won't see it called again.

## How to Test `gemini-identity`

To see `gemini-identity` being called:

1. **Don't provide Chess.com/Lichess usernames** - Only provide FIDE ID
2. **Use a player you know has accounts** - The function will search for their profiles
3. **Check the browser console** - You should see:
   ```
   [Identity] Running AI discovery for: { chesscom: true, lichess: true }
   [Gemini] Calling gemini-identity function...
   ```

## Summary

- **`gemini-identity`** = Optional, only when usernames need to be discovered
- **`gemini-report`** = Always called, generates the final report

If you're providing usernames directly, `gemini-identity` won't be called - this is expected behavior! ✅
