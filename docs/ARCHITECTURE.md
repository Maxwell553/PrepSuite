# PrepSuite Architecture Document

## Table of Contents

1. [System Overview](#1-system-overview)
2. [The Pipeline: Search to Report](#2-the-pipeline-search-to-report)
   - [Phase 1: Input Validation](#phase-1-input-validation)
   - [Phase 2: Identity Resolution](#phase-2-identity-resolution)
   - [Phase 3: Game Fetching](#phase-3-game-fetching)
   - [Phase 4: Game Parsing and Normalization](#phase-4-game-parsing-and-normalization)
   - [Phase 5: Statistical Aggregation](#phase-5-statistical-aggregation)
   - [Phase 6: Stockfish Engine Analysis](#phase-6-stockfish-engine-analysis)
   - [Phase 7: AI Report Generation](#phase-7-ai-report-generation)
   - [Phase 8: Post-Processing and Persistence](#phase-8-post-processing-and-persistence)
3. [The Chatbot Workflow](#3-the-chatbot-workflow)
4. [External Interfaces](#4-external-interfaces)
5. [Edge Functions (Server-Side)](#5-edge-functions-server-side)
6. [Database and Persistence](#6-database-and-persistence)
7. [Assessment: What Works Well](#7-assessment-what-works-well)
8. [Assessment: Challenges and Failure Modes](#8-assessment-challenges-and-failure-modes)
9. [Professionalization Guide](#9-professionalization-guide)

---

## 1. System Overview

PrepSuite is a chess scouting platform. A user enters a player's name (and optionally FIDE/USCF IDs and platform usernames), and the system produces a comprehensive opponent analysis report. The system fetches games from Chess.com and Lichess, runs Stockfish engine analysis in the browser, and uses Google Gemini AI to synthesize everything into a scouting dossier.

**Stack**: React 19 + TypeScript 5.8 + Vite 6 (client), Supabase (auth, PostgreSQL, Edge Functions), Google Gemini API (AI), Stockfish.js (engine analysis in browser via Web Worker).

**Key architectural characteristic**: This is a monolithic single-page application. There is no backend application server — all logic runs in the browser except for three Supabase Edge Functions that proxy Gemini API calls and one that handles account deletion. The browser does all game fetching, parsing, statistical aggregation, and engine analysis. The Edge Functions exist solely to keep the Gemini API key server-side.

---

## 2. The Pipeline: Search to Report

The entire pipeline is orchestrated by `SearchScreen.tsx`'s `handleSubmit` function (~880 lines). It is sequential — each phase depends on the output of the previous one. There is no task queue, no background processing, and no ability to resume a failed pipeline.

### Phase 1: Input Validation

**File**: `src/lib/validation.ts`

User submits a form with:
- **Player name** (required): 1–200 chars, dangerous chars rejected via Zod
- **FIDE ID** (optional): digits only, max 20 chars
- **USCF ID** (optional): digits only, max 20 chars
- **Chess.com username** (optional): alphanumeric + underscore/hyphen, max 50 chars
- **Lichess username** (optional): same rules
- **Game limit**: 1–5000, defaults to 1000
- **Engine depth**: configurable Stockfish depth

`validatePlayerSearch()` sanitizes all inputs (strips dangerous chars, normalizes whitespace) and validates against a Zod schema. If validation fails, the pipeline stops with a user-facing error.

### Phase 2: Identity Resolution

**Files**: `src/services/identity.ts`, `src/services/geminiService.ts`, `supabase/functions/gemini-identity/index.ts`

This is the most failure-prone phase. Its job is to take a player name and resolve it into: a FIDE profile, a USCF profile, a Chess.com username, and a Lichess username.

#### Step 2a: FIDE/USCF ID Discovery (if not provided by user)

If the user did not provide FIDE or USCF IDs, the system asks Gemini with Google Search enabled to find them:

```
Prompt → gemini-identity Edge Function → Gemini 3 Flash Preview (with Google Search tool)
```

The prompt instructs Gemini to perform two site-specific searches:
- `site:ratings.fide.com "{playerName}"`
- `site:ratings.uschess.org "{playerName}"`

And return raw JSON: `{"fideId": number|null, "uscfId": number|null}`

**Model**: `gemini-3-flash-preview` with `temperature: 0.0`, `maxOutputTokens: 2048`, Google Search tool enabled.

**Timeout**: 55 seconds (Supabase functions have a ~60s limit). Google Search can take 30–90 seconds.

The response goes through fragile JSON repair logic: strip markdown code blocks, find the first `{`, count open braces/brackets, close truncated strings and structures. This repair logic is duplicated across `identity.ts` in at least 3 locations.

#### Step 2b: FIDE/USCF Profile Fetch

If IDs were found (or provided), profiles are fetched in parallel:

- **FIDE**: `src/services/fide.ts` → `GET /fide-proxy/profile/{fideId}` → HTML scraping of `ratings.fide.com/profile/{id}` via Vite dev proxy. Extracts name, rating, federation, birth year, and title from HTML using 5 different regex strategies for each field. Retries up to 2 times with exponential backoff.
- **USCF**: `src/services/uscf.ts` → tries `GET /uscf-proxy/profile/{uscfId}` (new profile page) first, then falls back to `GET /uscf-msa-proxy/MbrDtlMain.php?{uscfId}` (legacy MSA page). Also HTML scraping with multiple regex strategies. Same retry pattern.

After fetching, there is a **name validation** step: the system checks that the profile name matches the search name using a fuzzy match (at least 2 name parts must match, case-insensitive, punctuation-stripped). If the name doesn't match, the profile is rejected.

#### Step 2c: Platform Username Discovery

If Chess.com or Lichess usernames were not provided by the user, the system asks Gemini (with Google Search) to find them:

```
Prompt: "Search for this chess player's Chess.com and Lichess accounts: {officialName} (FIDE ID: X, USCF ID: Y)"
Instructions: Use site:chess.com/members and site:lichess.org to find profile URLs
Return JSON: {"chessComCandidates": [...], "lichessCandidates": [...]}
```

Same model/config as Step 2a.

The response is parsed with the same JSON repair logic. URLs in the response are regex-matched to extract usernames from patterns like `chess.com/member/USERNAME` or `lichess.org/@/USERNAME`.

#### Step 2d: Username Verification

Each discovered username is verified by:
1. Fetching the profile from the platform API (`chessComService.getPlayerProfile` / `lichessService.getPlayerProfile`)
2. Running bio-metric matching:
   - **Title match**: If the player has a FIDE title (GM, IM, etc.), the platform profile must have the same title. Mismatch = immediate rejection.
   - **Name match**: At least 2 parts of the official name must appear in the profile name.
   - **Handle match**: Username must contain name parts (e.g., "JamisonKao" contains "jamison" and "kao").
   - **Birth year match**: FIDE birth year in profile bio.
   - Combinations of these signals are used for confidence levels.

If provided by the user, usernames are **trusted without verification**.

#### Identity Resolution Output

```typescript
interface ResolvedIdentity {
    verifiedName: string;        // Best name found (FIDE > USCF > user input)
    fideProfile: FideProfile | null;
    uscfProfile: UscfProfile | null;
    chessComUsername: string;     // Empty string if not found
    lichessUsername: string;      // Empty string if not found
    confidence: number;          // 1.0 if any username found, 0 otherwise
}
```

### Phase 3: Game Fetching

**Files**: `src/services/chessCom.ts`, `src/services/lichess.ts`

Games are fetched from both platforms in sequence (Lichess first, then Chess.com with an adjusted limit).

#### Chess.com Game Fetching

1. Fetch archive list: `GET /chess-api/pub/player/{username}/games/archives` → returns monthly archive URLs
2. Take up to 60 most recent monthly archives, reverse order (newest first)
3. Process in batches of 5 archives at a time, with `Promise.all` per batch
4. Each archive URL is rewritten from `https://api.chess.com/...` to `/chess-api/...` (Vite proxy)
5. `fetchWithRetry`: 2 retries, exponential backoff on 429/500+
6. 500ms delay between batches
7. Sort all games by `end_time` descending (most recent first)
8. Return up to `limit` games (default 5000)

**All time controls are fetched** — rapid, blitz, bullet, classical. There is no filtering by time control.

#### Lichess Game Fetching

1. `GET /lichess-api/games/user/{username}?max=500&opening=true&moves=true&pgnInJson=true`
2. `Accept: application/x-ndjson` — games come as newline-delimited JSON
3. Pagination: up to 10 requests of 500 games each (max 5000 total)
4. 500ms delay between pagination requests
5. If rate limited (429), stop fetching and return what was collected

**Key difference from Chess.com**: Lichess returns games with `opening.name` already populated (e.g., "Sicilian Defense: Najdorf, Zagreb (Fianchetto) Variation"), which is preserved and used later. Chess.com only provides ECO codes.

### Phase 4: Game Parsing and Normalization

**Files**: `src/services/gameAnalysis.ts`, `src/services/analysis.worker.ts`

All parsing happens in a **Web Worker** (`analysis.worker.ts`) to avoid blocking the main thread. The worker is a singleton — one instance is reused across all calls.

#### Chess.com Game Parsing

Raw Chess.com API objects are converted to `GameData`:
- Username extraction from `white.username` / `black.username`
- ECO code extraction with multiple format handling (string, array, URL suffix)
- Result resolution: maps Chess.com result strings (`win`, `checkmated`, `resign`, `timeout`, `stalemate`, `insufficient`, `repetition`, `50move`, `abandoned`, `agreed`) to standard `1-0`/`0-1`/`1/2-1/2`
- Timestamp: `end_time` (Unix seconds) → ISO string

#### Lichess Game Parsing

NDJSON lines are parsed individually:
- Player names from `players.white.user.name` (falls back to `userId`, then "Anonymous")
- PGN from `pgn` field; if missing, constructed from `moves` array
- Opening name preserved from `opening.name`
- ECO from `opening.eco` or `eco`
- Result from `winner` field ("white"/"black"/undefined → `1-0`/`0-1`/`1/2-1/2`)

#### Unified GameData Format

```typescript
interface GameData {
    id: string;
    source: 'chess.com' | 'lichess';
    white: string;
    black: string;
    result: string;           // '1-0' | '0-1' | '1/2-1/2'
    eco: string;              // ECO code like 'B20'
    pgn: string;              // Full PGN text
    playedAt: string;         // ISO date
    timeControl: string;
    openingName?: string;     // From Lichess opening.name or ECO library lookup
}
```

### Phase 5: Statistical Aggregation

**Files**: `src/services/gameAnalysis.ts`, `src/services/openingService.ts`, `src/services/analysis.worker.ts`

Statistics are generated separately for white and black games.

#### Opening Identification (ECO Library)

Before aggregation, each game is enriched with an opening name using the `@chess-openings/eco.json` library (12,000+ openings):

1. **PGN-based lookup** (`lookupByMoves`): Load PGN into `chess.js`, look up position in the ECO database with `maxMovesBack: 30`
2. **ECO code fallback** (`lookupByEcoCode`): If PGN lookup fails, use the game's ECO code to look up the opening family in the database

If neither works, the Web Worker falls back to a **massive hardcoded switch/case** in `analysis.worker.ts` (lines 56–630): ~375 lines of nested `if` statements checking the first 10–15 moves to classify openings. This is duplicated logic (the ECO library should handle it) and is a significant maintenance burden.

#### Aggregation in the Worker

Games are:
1. Filtered by side (only games where target player played white for whiteStats, black for blackStats)
2. Opening names are "familied" — `"Sicilian Defense: Najdorf, Zagreb Variation"` → `"Sicilian Defense"` (strips after `:` and `(`)
3. Aggregated by opening family: count wins/draws/losses, track frequency
4. Filtered to openings with **10+ games** (minimum for statistical significance)
5. Sorted by frequency descending

#### Output: `OpeningStat[]`

```typescript
interface OpeningStat {
    name: string;          // "Sicilian Defense"
    eco: string;           // Opening family name (same as name in this context)
    frequency: number;     // 0–1, relative to total games on that side
    winRate: number;       // 0–1
    drawRate: number;      // 0–1
    lossRate: number;      // 0–1
    wins: number;
    draws: number;
    losses: number;
    totalGames: number;
    trend: 'increasing' | 'stable' | 'decreasing';  // Always 'stable' currently
}
```

### Phase 6: Stockfish Engine Analysis

**File**: `src/services/stockfishAnalysis.ts`

Stockfish runs in the browser via `stockfish.js` in a Web Worker. A singleton `StockfishAnalyzer` instance is used.

#### Initialization
- Checks for WebAssembly support
- Loads `stockfish.wasm.js` (or `stockfish.js` asm fallback)
- Sends `uci` command, waits for `uciok` response

#### Per-Game Analysis

For each game:
1. Parse PGN to extract moves (same regex-based parser as `moveSequenceExtractor.ts`)
2. Skip games with <10 moves
3. Analyze **key positions only** (not every move): moves 10, 20, 30, 40, 50, then every 10th move
4. For each position:
   - Set position: `position startpos moves {moveSequence}`
   - Evaluate: `go depth {configuredDepth}` (default 10)
   - Parse evaluation from UCI output (centipawns or mate score)
   - Compare with previous position to detect mistakes (>150 centipawn swing)
5. Calculate: average evaluation, evaluation trend (improving/declining/stable), endgame accuracy
6. 30ms delay between games

#### Output: `GameAnalysis[]`

```typescript
interface GameAnalysis {
    gameId: string;
    criticalMistakes: Array<{
        moveNumber: number;
        move: string;
        evaluationBefore: number;
        evaluationAfter: number;
        mistakeSeverity: number;
    }>;
    averageEvaluation: number;
    evaluationTrend: 'improving' | 'declining' | 'stable';
    endgameAccuracy: number;  // 0–100
}
```

**This phase analyzes ALL games** (not a sample), which can be very slow for large game sets. 1000 games at depth 10 with ~5 key positions each = ~5000 Stockfish evaluations.

### Phase 7: AI Report Generation

**Files**: `src/components/SearchScreen.tsx` (prompt construction), `src/services/geminiService.ts`, `supabase/functions/gemini-report/index.ts`

#### Move Sequence Extraction

Before building the prompt, `extractMostPlayedLines` extracts the top 10 most common 10-move opening sequences for both white and black games. These are included in the prompt as "most played lines."

#### Stratified Sampling

The prompt can't include all game data (token limits), so games are sampled:
- **Metadata sample**: ~200 games, stratified by opening (proportional representation)
- **Move list sample**: ~100 games with PGN, up to 20 moves each
- **PGN sample**: subset of games with full (truncated) PGN text

#### The Analysis Prompt

The prompt sent to Gemini is ~200 lines long and includes:

1. **Player identity**: Verified name, FIDE/USCF ratings, platform usernames
2. **Naming instruction**: "Always refer to the player by verified name, not username"
3. **Aggregated opening stats**: Full JSON of `whiteStats` and `blackStats` (computed from all games)
4. **Most played lines**: Top 10 lines per side with game counts
5. **Game metadata sample**: Source, players, result, ECO, date, time control
6. **Move list sample**: First 20 moves per game
7. **PGN sample**: Truncated game PGNs
8. **Stockfish engine analysis**: Opening-specific insights, critical mistakes, accuracy metrics
9. **Detailed instructions**: Statistical significance rules, color confusion prevention, formatting rules, JSON validation requirements

#### The Schema

The response is constrained by a JSON schema (`responseSchema`) that defines the `ScoutingReport` structure with all required fields. This is sent alongside the prompt.

#### Edge Function: gemini-report

- **Model**: `gemini-3-flash-preview`
- **Temperature**: 0.7
- **Max output tokens**: 65,536 (maximum allowed)
- **Response MIME type**: `application/json`
- **Retry logic**: 2 retries for 503 (model overloaded) with exponential backoff (5s, 10s)
- **JSON repair**: If the response is truncated (MAX_TOKENS), the function attempts to repair the JSON by: (a) trimming from the end to find the last valid JSON boundary, (b) counting brace/bracket imbalance and appending closers

#### Client-Side Retry

The `geminiService.generateContentWithSchema` method has its own retry logic:
- 2 retries for 500, 503, truncated/incomplete JSON
- Exponential backoff with jitter
- Session refresh before each attempt (to avoid JWT expiration)
- Special handling for 429 (rate limit — never retry immediately), 546 (worker limit)

### Phase 8: Post-Processing and Persistence

#### Post-Processing

After receiving the Gemini response:
1. **Player data override**: The Gemini-generated player object is overridden with real data (verified name, FIDE/USCF ratings, platform usernames)
2. **Opening stats override**: Gemini-generated whiteOpenings/blackDefenses are replaced with the actual computed stats (whiteStats/blackStats)
3. **Most played lines**: Replaced with the pre-computed `mostPlayedLinesForPrompt`
4. **Numeric validation**: All opening stats run through `validateOpeningStats` (ensures integers, clamped rates, totalGames consistency)
5. **Default values**: Any missing text fields are set to "Analysis pending..."

#### Persistence

1. **Player record**: `playerRepository.createVerifiedPlayer` — upsert into `players` table (find by FIDE/USCF ID, update if exists, insert if new)
2. **Report save**: Currently has a bug — the `saveReport` call is missing from the persistence block. The `console.log("Persisted new report to Supabase")` is present but the actual `playerRepository.saveReport()` call is not made in the main flow. Reports are only saved when the user explicitly clicks "Save" in the ReportDashboard.
3. **Games attached**: `reportData.games` is set to the full game array (up to `gameLimit`)

---

## 3. The Chatbot Workflow

**Files**: `src/components/RepertoireChat.tsx`, `src/services/geminiService.ts`, `supabase/functions/gemini-chat/index.ts`

### Architecture

The chatbot is a collapsible panel within the ReportDashboard. It operates statelessly — each question is independent. There is no conversation history sent to the model; each request builds a fresh prompt with the full report context.

### Per-Message Flow

1. User types a question
2. The system builds a prompt that includes:
   - Player name, FIDE rating, USCF rating, country
   - Top 10 white openings with game counts and win rates
   - Top 10 black defenses with game counts and win rates
   - Top 5 most played lines for both colors
   - `preparationSummary` and `blackStrategicSummary` from the report
   - The user's question
   - Detailed instructions (statistical significance, formatting, no game number references)
3. Calls `geminiService.generateChatResponse(prompt)`
4. Edge function: `gemini-chat`
   - **Model**: `gemini-3-flash-preview`
   - **Temperature**: 0.7
   - **Max output tokens**: 16,384
   - **No JSON mode**: Plain text output, no schema constraints
   - **No Google Search**: Uses only the data provided in the prompt
   - **No retry logic**: Single attempt
5. Response displayed; `**bold**` formatting is stripped (replaced with empty string)

### Key Limitations

- **No conversation memory**: Each message is independent. If the user asks a follow-up, the model doesn't know what was discussed before.
- **No game data access**: The chatbot only sees the aggregated report data (opening stats, summaries), not individual games or PGNs.
- **No streaming**: The full response is awaited before display.
- **Single prompt**: The entire report context is re-sent with every question (could be optimized with conversation history).

---

## 4. External Interfaces

### APIs Called from the Browser

| Service | Proxy Path | Real Target | Auth | Data Format |
|---------|-----------|-------------|------|-------------|
| Chess.com Profile | `/chess-api/pub/player/{username}` | `api.chess.com/pub/player/{username}` | None (public API) | JSON |
| Chess.com Stats | `/chess-api/pub/player/{username}/stats` | `api.chess.com/pub/player/{username}/stats` | None | JSON |
| Chess.com Archives | `/chess-api/pub/player/{username}/games/archives` | `api.chess.com/pub/player/{username}/games/archives` | None | JSON |
| Chess.com Games | `/chess-api/pub/player/{username}/games/{YYYY}/{MM}` | `api.chess.com/pub/player/{username}/games/{YYYY}/{MM}` | None | JSON |
| Lichess Profile | `/lichess-api/user/{username}` | `lichess.org/api/user/{username}` | None | JSON |
| Lichess Games | `/lichess-api/games/user/{username}` | `lichess.org/api/games/user/{username}` | None | NDJSON |
| FIDE Profile | `/fide-proxy/profile/{fideId}` | `ratings.fide.com/profile/{fideId}` | None | HTML (scraped) |
| USCF Profile (new) | `/uscf-proxy/profile/{uscfId}` | `ratings.uschess.org/profile/{uscfId}` | None | HTML (scraped) |
| USCF Profile (legacy) | `/uscf-msa-proxy/MbrDtlMain.php?{uscfId}` | `www.uschess.org/msa/MbrDtlMain.php?{uscfId}` | None | HTML (scraped) |

All proxies are Vite dev-server proxies defined in `vite.config.ts`. In production, these would need a reverse proxy or CORS-friendly deployment strategy.

### Supabase Edge Functions (Server-Side)

| Function | Purpose | Model | Google Search | Max Tokens | Auth Required |
|----------|---------|-------|---------------|------------|---------------|
| `gemini-identity` | Player ID/username discovery | gemini-3-flash-preview | Yes (configurable) | 2,048 | No (anon key) |
| `gemini-report` | Scouting report generation | gemini-3-flash-preview | No | 65,536 | Yes (JWT) |
| `gemini-chat` | Follow-up Q&A | gemini-3-flash-preview | No | 16,384 | Yes (JWT) |
| `delete-user` | Account deletion | N/A | N/A | N/A | Yes (JWT) |
| `health` | Health check | N/A | N/A | N/A | No |

### Rate Limits and Quotas

- **Chess.com**: No explicit rate limit documented, but returns 429 on heavy use. `fetchWithRetry` handles with 2 retries + exponential backoff.
- **Lichess**: Documented rate limit; stops fetching on 429.
- **Gemini API**: Subject to Google AI Studio quotas. 429 is not retried (requires longer wait).
- **FIDE/USCF**: No rate limits documented, but scraping is fragile and HTML structure changes will break it.

---

## 5. Edge Functions (Server-Side)

All Edge Functions are Deno-based, deployed to Supabase, and share a `_shared/cors.ts` helper.

### CORS Handling (`_shared/cors.ts`)

- Production: Only allows `https://prepsuite.ai`
- Development: Allows `http://localhost:*` (wildcard port matching)
- Preflight responses include `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`

### gemini-identity (567 lines)

The most complex edge function. Handles:
- Request ID generation for tracking (`crypto.randomUUID()`)
- 55-second timeout with `AbortController`
- Retry loop: 2 retries for 503 and network errors, with exponential backoff + jitter
- MAX_TOKENS handling: retries with higher token limit (still 2048 — this is a bug, same value)
- MALFORMED_FUNCTION_CALL handling: retries without Google Search
- Safety filter handling (SAFETY, RECITATION finish reasons)
- Detailed error responses with `requestId` for debugging

### gemini-report (416 lines)

- No timeout (relies on Supabase's default function timeout)
- JSON mode: `responseMimeType: "application/json"` with optional `responseSchema`
- 65,536 max output tokens
- JSON repair pipeline on truncated responses:
  1. Try direct `JSON.parse`
  2. Extract JSON between first `{` and last `}`
  3. Check brace/bracket balance
  4. Trim from end to find last complete JSON boundary
  5. Count imbalance and append closers

### gemini-chat (124 lines)

Simplest edge function. Plain text generation, no JSON constraints, no retry logic, no timeout handling.

---

## 6. Database and Persistence

### Schema

Two tables in Supabase PostgreSQL:

#### `players`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| full_name | text | |
| fide_id | text | Indexed, used for lookup |
| uscf_id | text | Indexed, used for lookup |
| chess_com_username | text | |
| lichess_username | text | |
| metadata | JSONB | Platform stats, country |
| last_scanned_at | timestamptz | |

#### `scouting_reports`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| player_id | UUID (FK → players) | |
| user_id | UUID (FK → auth.users) | |
| report_data | JSONB | Full ScoutingReport object |
| valid_until | timestamptz | 30-day expiration |
| created_at | timestamptz | |

### Row-Level Security (RLS)

- `players`: Any authenticated user can read. Insert allowed for authenticated users.
- `scouting_reports`: Users can only read/insert/delete their own reports (`user_id = auth.uid()`).

Six migration files refining RLS policies suggest this was iteratively debugged.

### Persistence Operations (`playerRepository.ts`)

- `findVerifiedPlayer(fideId, uscfId)`: Searches by FIDE ID first, then USCF ID
- `createVerifiedPlayer(data)`: Upsert — finds existing by ID, updates if found, inserts if not. Handles unique constraint violations by falling back to update.
- `saveReport(playerId, report, userId)`: Insert into `scouting_reports`
- `deleteReport(reportId)`: Delete with count check (warns if RLS prevented deletion)
- `getUserHistory(userId)`: Fetch all reports for user, joined with `players`, ordered by `created_at` desc
- `getLatestReport(playerId)`: Get most recent non-expired report for a player

---

## 7. Assessment: What Works Well

1. **Separation of AI and computation**: Keeping Gemini calls server-side (Edge Functions) while running Stockfish client-side is a sound architectural split. AI calls need API keys; engine analysis is CPU-bound and benefits from running locally.

2. **Multi-source data aggregation**: Fetching from both Chess.com and Lichess, normalizing to a unified format, and combining for analysis is well-executed. The parsing handles the very different API shapes competently.

3. **ECO opening library integration**: Using `@chess-openings/eco.json` (12,000+ openings) for classification is the right approach. It's much more accurate than the hardcoded fallback.

4. **Structured AI output**: Using Gemini's JSON schema mode for report generation provides type-safe output. Post-processing that overrides AI-generated numeric data with real computed stats is smart defensive programming.

5. **Retry and backoff patterns**: The retry logic throughout (Gemini calls, FIDE/USCF scraping, Chess.com fetching) handles transient failures well.

6. **Statistical significance filtering**: The 10-game minimum for opening stats prevents misleading conclusions from small samples.

---

## 8. Assessment: Challenges and Failure Modes

### Identity Resolution Failures

**The core problem**: Using an LLM with Google Search to find FIDE/USCF IDs is unreliable.

- **Gemini Google Search is non-deterministic**: The same query can return different results. Google Search within Gemini has latency issues (30-90 seconds), often timing out at the 55-second limit.
- **JSON response parsing is brittle**: The system expects raw JSON but Gemini frequently returns markdown-wrapped JSON, truncated responses, or non-JSON text. The repair logic is extensive but still fails.
- **No direct API for FIDE/USCF search by name**: The system uses an AI-mediated web search instead of querying FIDE/USCF directly. FIDE actually has an API and search functionality at `ratings.fide.com` that could be scraped directly with a name search.
- **Name matching is fuzzy and permissive**: The `namesMatch` function can accept wrong players if names share common parts.
- **Two Gemini calls for identity**: One for FIDE/USCF IDs, one for platform usernames. Each can independently fail, timeout, or return garbage.

### HTML Scraping Fragility

FIDE and USCF profiles are scraped from HTML pages:
- **5+ regex strategies per field** for FIDE (name, rating, federation, birth year, title)
- **Multiple page formats** for USCF (new profile page, legacy MSA page)
- Any HTML structure change breaks scraping silently (returns null, not error)
- No monitoring for scraping accuracy degradation

### Pipeline Brittleness

- **No checkpointing**: If the pipeline fails at step 6 (report generation), all work from steps 1-5 is lost. The user must restart from scratch.
- **No caching of intermediate results**: Game data, stats, and engine analysis are not cached. Re-running for the same player refetches everything.
- **Sequential phases**: The pipeline cannot parallelize identity resolution with game fetching (because it needs the usernames first).
- **Monolithic orchestration**: The `handleSubmit` function in SearchScreen.tsx is ~880 lines with all pipeline logic inline.

### Performance Issues

- **Stockfish analyzes ALL games**: For 1000+ games at depth 10, this takes many minutes. Each game requires multiple position evaluations (moves 10, 20, 30, 40, 50+).
- **No game sampling for engine analysis**: Unlike the prompt which uses stratified sampling, Stockfish processes every game.
- **Web Worker limitations**: Single-threaded Stockfish in browser can't use multiple cores.
- **Large payloads**: The analysis prompt with game data can be very large, approaching token limits.

### Code Duplication

- **JSON repair logic**: Duplicated at least 3 times in `identity.ts` and once in each edge function
- **PGN parsing**: Two implementations — `moveSequenceExtractor.ts` and `stockfishAnalysis.ts` (private `parsePGN` method)
- **Opening classification**: ECO library in `openingService.ts` AND 375-line hardcoded switch in `analysis.worker.ts`
- **Error handling in geminiService.ts**: `generateContentWithoutSearch` and `generateContentWithSearch` are ~200 lines each of nearly identical error extraction code
- **Username URL extraction**: Regex patterns for extracting usernames from URLs are duplicated 3+ times in `identity.ts`

### Missing Infrastructure

- **No structured logging**: All logging is `console.log`/`console.warn`/`console.error` with `[ServiceName]` prefixes. No log levels, no structured data, no log aggregation.
- **No metrics/metering**: No timing of pipeline phases, no success/failure rates, no performance tracking. No way to know which step is slow or failing.
- **No request tracing**: The edge function generates `requestId` but the client doesn't correlate pipeline phases.
- **Minimal Sentry integration**: Present for FIDE/USCF scraping failures but not for the rest of the pipeline.
- **No feature flags**: All behavior is hardcoded.

---

## 9. Professionalization Guide

### Priority 1: Observability (Metering, Logging, Tracing)

**Goal**: Know what's happening, what's failing, and how long things take.

#### Structured Logging

Replace all `console.log`/`warn`/`error` with a structured logger:

```typescript
// lib/logger.ts
enum LogLevel { DEBUG, INFO, WARN, ERROR }

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  operation: string;
  requestId?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  error?: { message: string; stack?: string };
}
```

Every service function should log at entry and exit with timing:
```typescript
const start = performance.now();
// ... do work ...
logger.info('identity', 'resolve', { durationMs: performance.now() - start, fideFound: !!fideProfile });
```

#### Pipeline Metering

Create a `PipelineMetrics` class that tracks each phase:

```typescript
interface PipelinePhaseMetric {
  phase: string;
  startTime: number;
  endTime?: number;
  success: boolean;
  metadata: Record<string, unknown>;  // game counts, retry counts, etc.
}
```

After the pipeline completes (success or failure), send metrics to Sentry or a custom endpoint. This gives you:
- Which phase is slowest (likely identity resolution or Stockfish)
- Which phase fails most often
- Correlation between input parameters and failure rates

#### Sentry Enhancement

- Add Sentry breadcrumbs at each pipeline phase transition
- Track custom performance transactions for the full pipeline
- Tag errors with pipeline phase, player name, and game count
- Use Sentry's `startTransaction`/`startChild` for distributed tracing

### Priority 2: Fix Identity Resolution

This is the biggest source of user-visible failures. Recommended approach:

#### Direct Search Before AI

Before calling Gemini, attempt direct searches:
1. **FIDE**: Scrape `ratings.fide.com/search` with the player name (it has a search form). Parse the results table to find matching players by name + country.
2. **USCF**: Scrape `www.uschess.org/msa/MbrDtlTnmtHst.php` or use the member search at `ratings.uschess.org` with name query.
3. **Chess.com**: Use `chess.com/callback/member/search?keyword={name}` (undocumented but functional).
4. **Lichess**: Use `lichess.org/api/player/autocomplete?term={name}` (documented API).

Only fall back to Gemini+Search when direct methods fail. This eliminates the most common failure path.

#### Deterministic JSON Extraction

Instead of asking Gemini to return JSON (which it frequently wraps in markdown or truncates), ask it to return structured text that's easier to parse:
```
Return in this exact format, one per line:
FIDE_ID: {number or NONE}
USCF_ID: {number or NONE}
```

Or use Gemini's native function calling/tool use feature (structured output) instead of asking for raw JSON in the prompt.

#### Cache Resolved Identities

Store resolved identities (name → IDs mapping) in Supabase. For subsequent searches of the same player, skip identity resolution entirely.

### Priority 3: Pipeline Architecture

#### Extract Pipeline into Service

Move the pipeline out of `SearchScreen.tsx` into a dedicated `src/services/pipeline.ts`:

```typescript
interface PipelineConfig {
  playerName: string;
  fideId?: string;
  uscfId?: string;
  chessComUsername?: string;
  lichessUsername?: string;
  gameLimit: number;
  engineDepth: number;
}

interface PipelineResult {
  report: ScoutingReport;
  metrics: PipelinePhaseMetric[];
}

interface PipelineCallbacks {
  onPhaseStart: (phase: string) => void;
  onPhaseComplete: (phase: string, result: unknown) => void;
  onProgress: (phase: string, current: number, total: number) => void;
}

async function runPipeline(config: PipelineConfig, callbacks: PipelineCallbacks): Promise<PipelineResult>
```

This separates concerns (UI from logic), enables testing of the pipeline in isolation, and makes it possible to add checkpointing.

#### Add Checkpointing

After each phase, save intermediate results to `sessionStorage` or IndexedDB. If the pipeline fails at phase 6, the user can retry from phase 6 without re-running phases 1-5.

#### Sample Games for Stockfish

Instead of analyzing all games, sample ~50-100 games stratified by opening for Stockfish analysis. This would cut analysis time from minutes to seconds while maintaining statistical representativeness.

### Priority 4: Eliminate Code Duplication

1. **JSON repair**: Extract into `lib/jsonRepair.ts` used by both `identity.ts` and edge functions
2. **PGN parsing**: Single implementation in `moveSequenceExtractor.ts`, imported by `stockfishAnalysis.ts`
3. **Opening classification**: Remove the 375-line hardcoded fallback in `analysis.worker.ts` — the ECO library should be the single source
4. **Gemini error handling**: Extract error parsing into a shared `lib/geminiErrors.ts`
5. **URL username extraction**: Single function `extractUsernameFromUrl(url, platform)` used everywhere

### Priority 5: Production Deployment

#### Proxy Strategy

The Vite dev proxies won't work in production. Options:
- Deploy Supabase Edge Functions as proxies for FIDE/USCF/Chess.com/Lichess
- Use a Cloudflare Worker or similar edge proxy
- Use a dedicated backend (Node/Deno) for proxying

#### Error Budget and Alerting

Define acceptable failure rates:
- Identity resolution: <10% failure rate
- Game fetching: <5% failure rate (per platform)
- Report generation: <5% failure rate
- Overall pipeline: <15% failure rate

Alert when failure rates exceed these thresholds.

### Priority 6: Testing

The current test suite focuses on unit tests for individual services but has no integration tests for the pipeline as a whole.

Add:
- **Pipeline integration tests**: Mock external APIs, run the full pipeline, verify output structure
- **Identity resolution tests**: Test with known players, verify correct ID/username resolution
- **Edge function tests**: Test Gemini response handling with various failure modes (truncated JSON, empty responses, rate limits)
- **Snapshot tests**: For a known player + known game set, the report structure should be consistent

### Priority 7: Feature Evolution

#### Conversation Memory for Chat

Maintain message history and send it with each request:
```typescript
const conversationHistory = messages.map(m => ({
  role: m.role,
  parts: [{ text: m.content }]
}));
```

#### Streaming Responses

Use Gemini's streaming API for both report generation and chat to provide progressive updates instead of waiting for the full response.

#### Background Processing

Move Stockfish analysis to a shared Web Worker pool or to the server (using a headless Stockfish binary). This frees the browser and enables analysis to continue while the user navigates.

#### Caching Layer

- Cache resolved identities indefinitely (FIDE/USCF IDs don't change)
- Cache game data for 24 hours (games don't change once played)
- Cache reports for 30 days (already has `valid_until`)
- Use IndexedDB for client-side caching

#### Time Control Filtering

Add ability to filter games by time control (rapid, blitz, bullet, classical). Currently all time controls are mixed together, which can skew analysis for players who play differently across formats.
