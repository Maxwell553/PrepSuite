# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PrepSuite is a React/TypeScript chess scouting platform that aggregates player data from Chess.com, Lichess, FIDE, and USCF, then generates AI-powered analysis reports. The full analysis pipeline runs in a **separate Node/Hono backend service** (Cloud Run); the frontend is a thin client that sends requests and receives reports via SSE.

## Commands

### Development
- `npm run dev` — Start dev server on port 3000
- `npm run build` — Production build (strips console.log/debugger)
- `npm run preview` — Preview production build

### Testing
- `npm test` — Run Vitest in watch mode
- `npm run test:run` — Run Vitest once (no watch)
- `npm run test:coverage` — Run with coverage (70% threshold on lines/functions/branches/statements)
- `npx vitest run src/services/__tests__/playerRepository.test.ts` — Run a single test file
- `npx vitest run -t "test name pattern"` — Run tests matching a name
- `npm run test:e2e` — Playwright E2E tests (Chromium, Firefox, WebKit)
- `npm run test:e2e:headed` — E2E tests in headed browser mode
- `npm run test:all` — Unit tests then E2E tests

### Pipeline Service (required for analysis)
- `cd pipeline-service && npm run dev` — Start pipeline service on port 8080
- Vite dev server proxies `/api/*` to the pipeline service

### Supabase
- `npx supabase functions serve` — Run edge functions locally (delete-user, health)
- `npx supabase functions deploy <function-name>` — Deploy a single edge function

## Architecture

### Source Layout
All application source lives under `src/`. Path alias `@/` maps to `src/`.

- `src/App.tsx` — Root component. Owns top-level state: active tab, selected report, history, auth session, and analysis progress. Tab-based navigation (no router).
- `src/types.ts` — Core interfaces: `PlayerMetadata`, `OpeningStat`, `MoveSequence`, `GameData`, `ScoutingReport`, `SearchResult`.
- `src/components/` — React components. `SearchScreen.tsx` orchestrates the search flow; it calls the pipeline service.
- `src/services/` — Business logic:
  - **pipelineClient.ts** — `runPipeline()` and `chatWithPipeline()` — HTTP/SSE client to the pipeline service
  - **playerRepository.ts** — Supabase CRUD for players and scouting reports
- `src/lib/` — Utilities: Supabase client (`supabase.ts`), env validation (`env.ts`), Zod schemas (`validation.ts`), error formatting (`errorUtils.ts`), Sentry init (`sentry.ts`), theme context (`themeContext.tsx`), PGN utils (`pgnUtils.ts`).
- `src/hooks/` — Custom hooks (e.g., `useScrollAnimation.ts`).

### Pipeline Service (separate repo subtree)
Located in `pipeline-service/`. Node/Hono backend that:
- Resolves player identity (FIDE, USCF, Chess.com, Lichess)
- Fetches games from Chess.com and Lichess APIs
- Parses PGNs, classifies openings, aggregates stats
- Runs native Stockfish engine analysis (parallel workers)
- Generates AI report via Google Gemini
- Serves `/api/analyze` (SSE) and `/api/chat` (REST)

### Supabase Edge Functions
Located in `supabase/functions/`. Deno-based serverless functions:
- `delete-user/` — Account deletion (requires auth)
- `health/` — Health check

**Note:** `gemini-identity` and `gemini-report` have been removed. The pipeline service handles identity and report generation.

### Database
Two tables with Row-Level Security (RLS):
- `players` — Player profiles (FIDE ID, USCF ID, platform usernames, metadata JSONB)
- `scouting_reports` — Reports tied to users (report_data JSONB, 30-day expiration)

Migrations in `supabase/migrations/`.

### Data Flow
1. User submits search form in SearchScreen
2. SearchScreen calls `runPipeline()` with JWT and optional callbacks
3. Pipeline service: identity → games → parsing → Stockfish → Gemini report
4. SSE streams progress; final report returned as JSON
5. Report displayed in ReportDashboard; saved via playerRepository

### State Management
- **React Context** for theme (dark/light) and default federation (`themeContext.tsx`)
- **Lifted state** in App.tsx for cross-component data (analysis progress, auth, history)
- **Local state** within SearchScreen and ReportDashboard for their respective flows
- **Supabase Auth** with `onAuthStateChange` listener in App.tsx

### Key Patterns
- Vite dev proxy: `/api` → pipeline service (localhost:8080), `/lichess-export` → lichess.org (for PGN fetch in AnalysisBoard)
- Zod validation on all user inputs before processing
- `errorUtils.ts` converts technical errors to user-friendly messages with operation context

## Environment Variables
Required in `.env.local`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional:
- `VITE_PIPELINE_SERVICE_URL` — Override for pipeline service URL (default: same-origin for dev)
- `VITE_SENTRY_DSN` (production error tracking)
- `VITE_SENTRY_ENABLE_DEV` (enable Sentry in dev)

## Testing Notes
- Unit tests sit alongside source as `__tests__/*.test.ts` within each module directory
- E2E tests in `e2e/` directory
- Test setup (`vitest.setup.ts`) mocks `window.matchMedia` and `IntersectionObserver`
- Vitest env defaults `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to empty strings; use `vi.stubEnv()` to override in tests
- Shared mock data in `__tests__/utils/mocks.ts`
- Pipeline service has its own tests in `pipeline-service/__tests__/`

## Tech Stack
React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4, Supabase (auth + DB + edge functions), Vitest, Playwright, chess.js, recharts, Zod, Sentry. Pipeline service: Node, Hono, native Stockfish, Google Gemini.
