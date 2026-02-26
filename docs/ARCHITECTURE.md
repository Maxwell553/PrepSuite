# PrepSuite Architecture Document

## Table of Contents

1. [System Overview](#1-system-overview)
2. [The Pipeline: Search to Report](#2-the-pipeline-search-to-report)
3. [The Chatbot Workflow](#3-the-chatbot-workflow)
4. [Frontend Components](#4-frontend-components)
5. [Supabase Edge Functions](#5-supabase-edge-functions)
6. [Database and Persistence](#6-database-and-persistence)
7. [Observability and Logging](#7-observability-and-logging)
8. [Assessment: What Works Well](#8-assessment-what-works-well)
9. [Assessment: Challenges and Failure Modes](#9-assessment-challenges-and-failure-modes)

---

## 1. System Overview

PrepSuite is a chess scouting platform. A user enters a player's name (and optionally FIDE/USCF IDs and platform usernames), and the system produces a comprehensive opponent analysis report.

**Architecture**: The frontend is a React SPA. The full analysis pipeline runs in a **separate Node/Hono backend service** (pipeline-service) deployed to Cloud Run. The browser sends a single request with JWT auth and receives progress updates via SSE plus a final `ScoutingReport` JSON.

**Stack**:
- **Frontend**: React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4
- **Pipeline Service**: Node, Hono, native Stockfish, Google Gemini
- **Backend**: Supabase (auth, PostgreSQL, edge functions for delete-user and health)

**Key characteristic**: No browser-side game fetching, parsing, or engine analysis. All heavy work runs in the pipeline service.

---

## 2. The Pipeline: Search to Report

The pipeline is orchestrated by the **pipeline-service** (`pipeline-service/src/routes/analyze.ts`). The frontend `SearchScreen` calls `runPipeline()` in `pipelineClient.ts`, which POSTs to `/api/analyze` and reads SSE events for progress.

### Pipeline Phases (Server-Side)

| Phase | Location | Description |
|-------|----------|-------------|
| 1. Identity | `pipeline/identity.ts` | Resolve player: FIDE/USCF search, Chess.com/Lichess autocomplete, Gemini fallback |
| 2. Games | `pipeline/chessCom.ts`, `pipeline/lichess.ts` | Fetch games from Chess.com and Lichess APIs |
| 3. Parsing | `pipeline/gameParser.ts`, `pipeline/moveSequenceExtractor.ts` | Parse PGNs, normalize, extract opening sequences |
| 4. Stats | `pipeline/statsAggregator.ts`, `pipeline/openingClassifier.ts` | Aggregate opening stats, classify ECO |
| 5. Engine | `pipeline/enginePool.ts`, `pipeline/engineSampler.ts` | Native Stockfish analysis (parallel workers, sampled games) |
| 6. Report | `pipeline/geminiReport.ts`, `pipeline/promptBuilder.ts`, `pipeline/reportPostProcessor.ts` | Build prompt, call Gemini, post-process JSON |

### Frontend Flow

1. User submits form in `SearchScreen`
2. `validatePlayerSearch()` (Zod) validates input
3. Optional: Check Supabase for cached report (if FIDE/USCF IDs provided)
4. `runPipeline(params, accessToken, callbacks)` — POST to `/api/analyze` with JWT
5. SSE stream: `onPhase` and `onProgress` callbacks update UI (loading stage, status text)
6. Final JSON: `ScoutingReport` returned
7. `onReportGenerated(report)` → switch to dashboard, save via `playerRepository`

### Vite Dev Proxy

- `/api` → `http://localhost:8080` (pipeline service)
- `/lichess-export` → `https://lichess.org` (for PGN fetch in AnalysisBoard)

---

## 3. The Chatbot Workflow

**Files**: `src/components/RepertoireChat.tsx`, `src/services/pipelineClient.ts`, `pipeline-service/src/routes/chat.ts`

The chatbot calls `chatWithPipeline()` which POSTs to `/api/chat`. The pipeline service:

- Accepts conversation history and report context
- Uses Gemini with tools: `get_game`, `get_pgn`, `run_stockfish`, `get_opening_breakdown`
- Returns assistant response

---

## 4. Frontend Components

| Component | Purpose |
|-----------|---------|
| `App.tsx` | Root: tabs, auth, history, selected report, loading state |
| `SearchScreen.tsx` | Search form, pipeline invocation, progress display |
| `ReportDashboard.tsx` | Report display, charts, AnalysisBoard, RepertoireChat |
| `AnalysisBoard.tsx` | Interactive board, game list, PGN display (uses `pgnUtils.ts` for loadPgn) |
| `RepertoireChat.tsx` | Chat panel, message history, `chatWithPipeline` |
| `LandingPage.tsx` | Marketing/landing when not logged in |
| `Sidebar.tsx` | Navigation |
| `playerRepository.ts` | Supabase CRUD for players and scouting reports |
| `pipelineClient.ts` | `runPipeline`, `chatWithPipeline` — HTTP/SSE client |

---

## 5. Supabase Edge Functions

| Function | Purpose | Auth |
|----------|---------|------|
| `delete-user` | Account deletion | JWT required |
| `health` | Health check | None |

**Removed**: `gemini-identity`, `gemini-report`, `gemini-chat` — replaced by pipeline service.

---

## 6. Database and Persistence

- **players**: Player profiles (FIDE ID, USCF ID, platform usernames, metadata)
- **scouting_reports**: Reports tied to users (report_data JSONB, 30-day expiration)

RLS policies enforce user-scoped access. Migrations in `supabase/migrations/`.

---

## 7. Observability and Logging

- **Structured logging**: `pipeline-service/src/lib/logger.ts` (Pino)
- **Pipeline metrics**: Phase timing, success/failure, game counts (see §9 for enhancement)
- **Sentry**: Frontend error tracking; breadcrumbs at pipeline phase transitions

---

## 8. Assessment: What Works Well

- Pipeline migration complete: analysis time reduced from 8–20 min to 45s–3 min
- Native Stockfish with parallel workers
- Direct API access (no CORS proxies in production)
- Zod validation on all inputs
- RLS on database tables
- API keys server-side only

---

## 9. Assessment: Challenges and Failure Modes

### Identity Resolution

- FIDE/USCF search can fail for uncommon names
- Platform autocomplete (Lichess, Chess.com) is more reliable than Gemini fallback

### Pipeline Brittleness

- No checkpointing: failure at any phase loses all prior work
- No caching of intermediate results for same player

### Observability Enhancements (Recommended)

- **Structured logging**: Replace `console.log` with `logger.info` in frontend
- **Pipeline metrics**: Track phase duration, success rate, game counts → Sentry or custom endpoint
- **Sentry breadcrumbs**: Add at each pipeline phase transition in `pipelineClient.ts`
