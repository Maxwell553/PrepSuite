# Pipeline Service Migration Plan

Move the analysis pipeline from the browser to a GCP Cloud Run backend service. This eliminates CORS proxies, replaces WASM Stockfish with a native binary, enables parallel engine analysis, and improves identity resolution reliability.

**Expected outcome**: Total pipeline time drops from 8–20 minutes to 45 seconds – 3 minutes.

---

## Current State

| Component | Where it runs | Limitation |
|-----------|--------------|------------|
| Identity resolution | Browser → Supabase Edge Function → Gemini+Search | 55s timeout, AI-mediated, unreliable |
| Game fetching | Browser via Vite dev proxies | CORS issues in prod, preflight per request |
| Game parsing + stats | Browser Web Worker (single thread) | Minor — already fast enough |
| Stockfish analysis | Browser WASM (single thread, all games) | **5–15 min** for 1000 games |
| Report generation | Browser → Supabase Edge Function → Gemini | Extra network hop, 60s edge function limit |
| Persistence | Browser → Supabase REST | Works fine |

---

## Target Architecture

```
┌─────────────┐         ┌──────────────────────────────────────────────┐
│   Browser    │         │           Cloud Run (Pipeline Service)       │
│  (React SPA) │  POST   │                                              │
│             ├────────►│  1. Identity Resolution                      │
│             │  SSE     │     ├─ Direct HTTP: FIDE search, USCF search │
│  Progress   ◄────────┤     ├─ Direct HTTP: Lichess autocomplete      │
│  updates    │         │     ├─ Gemini API (fallback only)            │
│             │         │     └─ Name verification                     │
│             │         │                                              │
│             │         │  2. Game Fetching                            │
│             │         │     ├─ Chess.com API (direct, no proxy)      │
│             │         │     └─ Lichess API (direct, no proxy)        │
│             │         │                                              │
│             │         │  3. Parsing + Stats                          │
│             │         │     ├─ Game normalization                    │
│             │         │     ├─ ECO library classification            │
│             │         │     └─ Opening aggregation                   │
│             │         │                                              │
│             │         │  4. Stockfish Analysis (NATIVE BINARY)       │
│             │         │     ├─ Worker pool (4 parallel engines)      │
│             │         │     └─ Sampled games (50-100, not all)       │
│             │         │                                              │
│             │         │  5. Gemini Report Generation (direct)        │
│             │         │     └─ No edge function proxy needed         │
│             │         │                                              │
│             │         │  6. Persist to Supabase (service role key)   │
│             │         │     └─ Save player + report                  │
│             │         │                                              │
│             │         │  → Return ScoutingReport JSON                │
└─────────────┘         └──────────────────────────────────────────────┘
                                          │
                                          ▼
                                  ┌──────────────┐
                                  │   Supabase    │
                                  │  PostgreSQL   │
                                  └──────────────┘
```

### Why Cloud Run

Already in the GCP ecosystem. Cloud Run is the natural fit:

- Same GCP project, same billing, same IAM
- Runs containers — deploy a Node image with native Stockfish bundled
- Configurable timeout up to 60 minutes (vs Supabase's ~60 seconds)
- Scales to zero when idle (pay only when analyzing)
- 4 vCPUs / 8 GB RAM available per instance
- Can call Chess.com, Lichess, FIDE, USCF directly — no CORS, no proxy
- Can call Gemini API directly — no edge function middleman
- Can write to Supabase DB directly via service role key

### What Stays in the Browser

- UI rendering (React SPA, served by Cloud Run)
- Auth flow (Supabase auth)
- Report display, charts, analysis board
- Chat (calls `gemini-chat` edge function directly — lightweight, low-latency)
- Initiating pipeline requests (POST to Cloud Run)
- Receiving progress updates (SSE from Cloud Run)

### What Happens to Edge Functions

| Function | Disposition |
|----------|-------------|
| `gemini-identity` | **Eliminated** (Phase 3). Identity moves to pipeline service. |
| `gemini-report` | **Eliminated** (Phase 3). Report generation moves to pipeline service. |
| `gemini-chat` | **Stays**. Chat is lightweight and benefits from edge latency. |
| `delete-user` | **Stays**. Simple DB operation. |
| `health` | **Stays**. |

---

## Performance Comparison

| Phase | Current (Browser) | Backend (Cloud Run) | Why |
|-------|-------------------|---------------------|-----|
| Identity resolution | 10–60s (Gemini+Search, often timeouts) | 2–5s (direct FIDE/USCF search, Gemini fallback) | Direct HTTP eliminates AI roundtrip for most players |
| Game fetching | 5–30s (proxied, CORS preflight per request) | 2–10s (direct API, HTTP/2 pooling, no CORS) | Eliminates proxy hop and preflight overhead |
| Game parsing | 1–3s (Web Worker) | <1s (native CPU) | Marginal — already fast |
| **Stockfish (1000 games)** | **5–15 min** (WASM, 1 thread, all games) | **30–90s** (native, 4 parallel, sampled ~80 games) | Native ~5x faster, 4x parallelism, 90% less input = **~50–100x** |
| Gemini report | 10–30s (browser → edge fn → Gemini) | 8–20s (direct to Gemini) | One fewer network hop |
| **Total** | **8–20 min** | **45s – 3 min** | Stockfish dominance eliminated |

---

## Cost Estimate

Cloud Run pricing for this workload:

- 4 vCPU, 4 GB RAM instance
- ~2 minutes per analysis (worst case)
- At 100 analyses/day: ~$5–15/month
- Scales to zero when idle: $0 when nobody's analyzing
- Negligible compared to existing Supabase costs

---

## Service Structure

```
pipeline-service/
├── Dockerfile
├── package.json
├── tsconfig.json
├── cloudbuild.yaml                # CI/CD to Cloud Run
├── src/
│   ├── server.ts                  # HTTP server (Hono)
│   ├── middleware/
│   │   ├── auth.ts                # Validate Supabase JWT
│   │   └── cors.ts                # CORS for SPA origin
│   ├── pipeline/
│   │   ├── orchestrator.ts        # Run phases sequentially, emit SSE progress
│   │   ├── identity.ts            # Phase 1: deterministic-first identity resolution
│   │   ├── gameFetcher.ts         # Phase 2: Chess.com + Lichess direct fetch
│   │   ├── gameParser.ts          # Phase 3: normalize + classify + aggregate
│   │   ├── enginePool.ts          # Phase 4: Stockfish child process pool
│   │   ├── reportGenerator.ts     # Phase 5: prompt construction + Gemini direct call
│   │   └── persistence.ts         # Phase 6: save to Supabase via service role
│   ├── lib/
│   │   ├── logger.ts              # Structured logging (pino)
│   │   ├── metrics.ts             # Phase timing, counters
│   │   ├── jsonRepair.ts          # Single shared implementation
│   │   └── cache.ts               # In-memory LRU for identities, game data
│   └── stockfish/
│       └── (native binary via apt) # Linux x86_64 stockfish
└── __tests__/
    ├── identity.test.ts
    ├── gameFetcher.test.ts
    ├── enginePool.test.ts
    └── orchestrator.test.ts
```

---

## API Contract

### `POST /api/analyze`

Request:
```json
{
  "playerName": "Magnus Carlsen",
  "fideId": "",
  "uscfId": "",
  "chessComUsername": "",
  "lichessUsername": "",
  "gameLimit": 1000,
  "engineDepth": 10
}
```

Headers:
```
Authorization: Bearer {supabase_jwt}
Content-Type: application/json
```

Response: **Server-Sent Events** stream. The browser opens an `EventSource` or reads from a `fetch` `ReadableStream`.

```
event: phase
data: {"phase":"identity","status":"started"}

event: phase
data: {"phase":"identity","status":"complete","durationMs":3200,"fideId":"1503014"}

event: phase
data: {"phase":"games","status":"started"}

event: progress
data: {"phase":"games","current":500,"total":1200}

event: phase
data: {"phase":"games","status":"complete","durationMs":8400,"gameCount":1200}

event: phase
data: {"phase":"engine","status":"started"}

event: progress
data: {"phase":"engine","current":30,"total":80}

event: phase
data: {"phase":"engine","status":"complete","durationMs":45000,"gamesAnalyzed":80}

event: phase
data: {"phase":"report","status":"started"}

event: phase
data: {"phase":"report","status":"complete","durationMs":15000}

event: complete
data: {full ScoutingReport JSON}
```

Error case:
```
event: error
data: {"phase":"identity","error":"Player not found","code":"PLAYER_NOT_FOUND"}
```

### `GET /health`

Returns `200 OK` with `{"status":"ok","version":"..."}`.

---

## Stockfish Worker Pool

The Dockerfile bundles a native Stockfish binary:

```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y stockfish && rm -rf /var/lib/apt/lists/*
COPY . /app
WORKDIR /app
RUN npm ci --production
CMD ["node", "dist/server.js"]
```

`enginePool.ts` spawns N child processes, each communicating with Stockfish via stdin/stdout UCI protocol:

```typescript
class StockfishPool {
  private workers: StockfishWorker[];

  constructor(options: { workerCount: number; depth: number }) {
    // Spawn `workerCount` Stockfish child processes
    // Each process: spawn('stockfish'), send 'uci', wait for 'uciok'
  }

  async analyzeGames(
    games: GameData[],
    targetUsername: string,
    depth: number
  ): Promise<GameAnalysis[]> {
    // Distribute games across workers round-robin
    // 4 games analyzed simultaneously on 4 vCPUs
    // Each worker: set position, go depth N, parse bestmove + eval
  }

  async shutdown(): Promise<void> {
    // Kill all child processes
  }
}
```

Key design decisions:
- **4 workers** on 4-vCPU instance (1 engine per core)
- **Sample ~80 games** (stratified by opening) instead of analyzing all 1000+
- **Native binary** (~5x faster than WASM for position evaluation)
- Combined improvement: **~50–100x faster** than current browser approach

---

## Phase 1: Cloud Run Service Foundation + Identity Resolution + Game Fetching

**Goal**: Deploy a Cloud Run service that handles identity resolution and game fetching. The browser still handles parsing, stats, Stockfish, and Gemini report generation. This immediately unblocks CORS issues and improves identity resolution.

### Deliverables

1. **Cloud Run project scaffolding**
   - `pipeline-service/` directory with Dockerfile, package.json, tsconfig.json
   - Hono HTTP server with CORS middleware and Supabase JWT validation
   - Health check endpoint
   - Structured logging with pino
   - `cloudbuild.yaml` for CI/CD (or `gcloud run deploy` script)

2. **Deterministic identity resolution** (`pipeline/identity.ts`)
   - **Direct FIDE search**: HTTP GET to `ratings.fide.com` search page with player name, parse results HTML for FIDE ID + profile data
   - **Direct USCF search**: HTTP GET to USCF member search with player name, parse results
   - **Lichess autocomplete**: `GET lichess.org/api/player/autocomplete?term={name}` (documented API)
   - **Chess.com search**: `GET chess.com/callback/member/search?keyword={name}` (undocumented but functional)
   - **Gemini fallback**: Only if direct methods fail, use Gemini+Search as last resort
   - **Name verification**: Reuse existing bio-metric matching logic, cleaned up and deduplicated

3. **Game fetching** (`pipeline/gameFetcher.ts`)
   - Port `chessCom.ts` and `lichess.ts` logic to Node/server context
   - Direct API calls (no CORS proxies)
   - HTTP/2 connection pooling
   - Same archive batching / NDJSON pagination approach

4. **SSE progress endpoint**
   - `POST /api/analyze` returns SSE stream
   - Phase 1 scope: streams identity + game fetching progress
   - Returns JSON payload with `{ identity, games }` on completion
   - Browser receives this and continues local processing (parse, stats, Stockfish, report)

5. **Browser integration**
   - New `src/services/pipelineClient.ts`: calls Cloud Run service, reads SSE stream
   - `SearchScreen.tsx` updated: calls pipeline service for identity + games, then runs local phases as before
   - Feature flag or environment variable to toggle between old (all-browser) and new (hybrid) mode

### Tasks

- [ ] Create `pipeline-service/` directory with project scaffolding
- [ ] Set up Hono server with CORS, auth middleware, health endpoint
- [ ] Implement structured logger (pino)
- [ ] Implement deterministic identity resolution (direct FIDE/USCF/platform search)
- [ ] Port game fetching logic (Chess.com + Lichess) to server context
- [ ] Implement SSE streaming for progress events
- [ ] Write Dockerfile
- [ ] Write `cloudbuild.yaml` or deploy script
- [ ] Deploy to Cloud Run in `prepsuite-acfb8` GCP project
- [ ] Create `src/services/pipelineClient.ts` in the SPA
- [ ] Update `SearchScreen.tsx` to use pipeline client for identity + games
- [ ] Test end-to-end: browser → Cloud Run → identity + games → browser continues locally
- [ ] Add integration tests for identity resolution with known players

---

## Phase 2: Move Parsing, Stats, and Stockfish to the Service

**Goal**: The pipeline service now handles everything from identity resolution through Stockfish analysis. The browser only sends the request and receives progress + final report data (minus AI summary). Gemini calls still go through Edge Functions.

### Deliverables

1. **Game parsing** (`pipeline/gameParser.ts`)
   - Port `analysis.worker.ts` parsing logic (Chess.com + Lichess normalization)
   - Port `openingService.ts` ECO classification (use `@chess-openings/eco.json` — the single source, no hardcoded fallback)
   - Port statistical aggregation (opening stats, move sequence extraction)

2. **Stockfish native engine pool** (`pipeline/enginePool.ts`)
   - Stockfish installed via `apt-get install stockfish` in Dockerfile
   - Worker pool: spawn 4 child processes, UCI protocol over stdin/stdout
   - Stratified game sampling: select ~80 games proportional to opening distribution
   - Parallel analysis across 4 workers
   - Key position analysis (moves 10, 20, 30, 40, 50+) same as current approach

3. **Updated SSE stream**
   - Progress events for all phases: identity → games → parsing → engine → done
   - Granular engine progress (game N of M)
   - Return `{ identity, games, stats, engineAnalysis }` on completion

4. **Browser simplification**
   - Remove or disable: analysis.worker.ts usage, stockfishAnalysis.ts, openingService.ts calls from SearchScreen
   - `SearchScreen.tsx` pipeline: call Cloud Run → receive identity + games + stats + engine data → construct prompt → call gemini-report edge function → post-process → display
   - Stockfish.js WASM remains available for the AnalysisBoard interactive feature

### Tasks

- [ ] Port game parsing (Chess.com + Lichess normalization) to `gameParser.ts`
- [ ] Port ECO library opening classification (drop the 375-line hardcoded fallback)
- [ ] Port statistical aggregation + move sequence extraction
- [ ] Implement Stockfish worker pool with native binary
- [ ] Implement stratified game sampling (select ~80 from all games)
- [ ] Update Dockerfile to install stockfish
- [ ] Update Cloud Run instance to 4 vCPU / 4 GB RAM
- [ ] Extend SSE stream with parsing + engine progress events
- [ ] Update `pipelineClient.ts` to handle new progress events
- [ ] Simplify `SearchScreen.tsx` — remove local parsing/stats/Stockfish phases
- [ ] Test with large game sets (1000+ games) — verify <90s engine phase
- [ ] Integration tests for engine pool

---

## Phase 3: Move Gemini Report Generation into the Service

**Goal**: The pipeline service handles the entire analysis pipeline end-to-end. The browser sends a request and receives a complete `ScoutingReport`. Eliminate `gemini-identity` and `gemini-report` edge functions.

### Deliverables

1. **Report generation** (`pipeline/reportGenerator.ts`)
   - Port prompt construction logic from `SearchScreen.tsx` (~200-line prompt)
   - Port response schema definition
   - Call Gemini API directly (no edge function proxy)
   - Port JSON repair logic from `gemini-report` edge function → shared `lib/jsonRepair.ts`
   - Port post-processing: player data override, stats override, numeric validation
   - Retry logic: 2 retries for 503/truncated with exponential backoff

2. **Persistence** (`pipeline/persistence.ts`)
   - Save player record via Supabase service role key
   - Save scouting report
   - Attach games to report
   - Return complete `ScoutingReport` to browser

3. **SSE stream: full pipeline**
   - All 6 phases streamed
   - Final `complete` event with full `ScoutingReport` JSON

4. **Edge function cleanup**
   - Delete `gemini-identity` edge function
   - Delete `gemini-report` edge function
   - Update `supabase/config.toml` to remove their entries
   - Keep `gemini-chat`, `delete-user`, `health`

5. **Browser simplification**
   - `SearchScreen.tsx` becomes: validate input → call pipeline service → display progress → receive report → render
   - Remove `geminiService.generateContentWithSchema`, `geminiService.generateContentWithoutSearch`, `geminiService.generateContentWithSearch`
   - Keep `geminiService.generateChatResponse` (still used by RepertoireChat)
   - Remove Vite proxy config for FIDE/USCF/Chess.com/Lichess (no longer needed)

6. **Environment variables**
   - Cloud Run service needs: `GEMINI_API_KEY`, `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - SPA needs: `VITE_PIPELINE_SERVICE_URL` (Cloud Run URL)

### Tasks

- [ ] Port prompt construction + schema from SearchScreen.tsx
- [ ] Implement direct Gemini API call with JSON schema mode
- [ ] Port JSON repair to shared `lib/jsonRepair.ts`
- [ ] Port post-processing (player override, stats override, validation)
- [ ] Implement persistence with Supabase service role key
- [ ] Update SSE stream for full 6-phase pipeline
- [ ] Delete `gemini-identity` and `gemini-report` edge functions
- [ ] Update `supabase/config.toml`
- [ ] Strip `SearchScreen.tsx` to thin client (validate → call → display)
- [ ] Remove unused client-side services (identity.ts, large parts of geminiService.ts)
- [ ] Remove Vite proxy entries for external APIs
- [ ] Set up Cloud Run environment variables (Secret Manager for API keys)
- [ ] End-to-end test: browser → Cloud Run → complete ScoutingReport
- [ ] Verify `gemini-chat` still works independently

---

## Phase 4: Observability, Caching, and Hardening

**Goal**: Bring the service to production quality. Add structured logging, metrics, caching, alerting, and error budgets.

### Deliverables

1. **Structured logging** (`lib/logger.ts`)
   - pino logger with JSON output (consumed by Cloud Logging)
   - Every pipeline phase logs: start, completion, duration, key metadata
   - Request ID (UUID) propagated through all phases for tracing
   - Log levels: DEBUG (position evaluations), INFO (phase transitions), WARN (retries), ERROR (failures)

2. **Metrics and metering** (`lib/metrics.ts`)
   - Phase timing: record duration of each pipeline phase per request
   - Success/failure counters per phase
   - Game count histograms
   - Stockfish positions/second throughput
   - Export to Cloud Monitoring (custom metrics) or log-based metrics

3. **Caching** (`lib/cache.ts`)
   - **Identity cache**: player name → resolved identity, stored in Supabase `players` table (already exists), checked before running identity resolution
   - **Game cache**: player username + platform → games, stored in Redis or Supabase, TTL 24 hours
   - **Report cache**: check `scouting_reports.valid_until` before re-analyzing (already partially implemented)

4. **Alerting**
   - Cloud Monitoring alerts on:
     - Error rate > 10% over 5 minutes
     - P95 latency > 5 minutes
     - Identity resolution failure rate > 15%
     - Stockfish worker crash/restart
   - Alert channels: email, PagerDuty/Slack (per preference)

5. **Error budgets**
   - Identity resolution: <10% failure rate
   - Game fetching: <5% failure rate per platform
   - Report generation: <5% failure rate
   - Overall pipeline: <15% end-to-end failure rate

6. **Hardening**
   - Request validation (Zod schemas on the server)
   - Rate limiting per user (prevent abuse)
   - Graceful shutdown (drain in-flight requests, kill Stockfish processes)
   - Request timeout: 5 minutes max per pipeline run
   - Circuit breaker for Gemini API (if repeated failures, fail fast)
   - Health check includes Stockfish process liveness

7. **SPA observability**
   - Pipeline request timing sent to Sentry as performance transactions
   - Each SSE phase becomes a Sentry span
   - Error events tagged with phase, player name, game count

### Tasks

- [ ] Implement structured logger with request ID propagation
- [ ] Add phase timing to all pipeline phases
- [ ] Set up Cloud Monitoring dashboards (latency, error rate, throughput)
- [ ] Implement identity cache (check Supabase before resolving)
- [ ] Implement game cache (Redis or Supabase, 24h TTL)
- [ ] Set up Cloud Monitoring alerting rules
- [ ] Add request validation with Zod
- [ ] Add per-user rate limiting
- [ ] Implement graceful shutdown
- [ ] Add circuit breaker for Gemini API
- [ ] Update health check to verify Stockfish liveness
- [ ] Add Sentry performance tracing in SPA for pipeline requests
- [ ] Load test: 10 concurrent analyses, verify scaling behavior
- [ ] Document runbook: common failures, how to debug, how to rollback

---

## Summary

| Phase | What moves to Cloud Run | What browser still does | Key win |
|-------|------------------------|------------------------|---------|
| **1** | Identity resolution, game fetching | Parsing, stats, Stockfish, Gemini report | Reliable identity, no CORS |
| **2** | + Parsing, stats, Stockfish | Gemini report (via edge fn), display | 50–100x faster engine analysis |
| **3** | + Gemini report, persistence | Display, chat, auth | Full server pipeline, 2 edge fns eliminated |
| **4** | + Caching, metrics, logging, alerting | Same as Phase 3 | Production-grade observability |

Each phase is independently deployable and testable. The browser can fall back to local processing if the Cloud Run service is unavailable (feature flag).
