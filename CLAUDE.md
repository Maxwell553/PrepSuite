# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PrepSuite is a React/TypeScript chess scouting platform that aggregates player data from Chess.com, Lichess, FIDE, and USCF, then generates AI-powered analysis reports using Google Gemini via Supabase Edge Functions.

## Commands

### Development
- `npm run dev` — Start dev server on port 3000
- `npm run build` — Production build (strips console.log/debugger)
- `npm run preview` — Preview production build

### Testing
- `npm test` — Run Vitest in watch mode
- `npm run test:run` — Run Vitest once (no watch)
- `npm run test:coverage` — Run with coverage (70% threshold on lines/functions/branches/statements)
- `npx vitest run src/services/__tests__/chessCom.test.ts` — Run a single test file
- `npx vitest run -t "test name pattern"` — Run tests matching a name
- `npm run test:e2e` — Playwright E2E tests (Chromium, Firefox, WebKit)
- `npm run test:e2e:headed` — E2E tests in headed browser mode
- `npm run test:all` — Unit tests then E2E tests

### Supabase
- `npx supabase functions serve` — Run edge functions locally
- `npx supabase functions deploy <function-name>` — Deploy a single edge function

## Architecture

### Source Layout
All application source lives under `src/`. Path alias `@/` maps to `src/`.

- `src/App.tsx` — Root component. Owns top-level state: active tab, selected report, history, auth session, and analysis progress. Tab-based navigation (no router).
- `src/types.ts` — Core interfaces: `PlayerMetadata`, `OpeningStat`, `MoveSequence`, `GameData`, `ScoutingReport`, `SearchResult`.
- `src/components/` — React components. `SearchScreen.tsx` (~1300 lines) is the main orchestrator for the search-to-report flow.
- `src/services/` — Business logic, all stateless modules:
  - **Data fetching**: `chessCom.ts`, `lichess.ts`, `fide.ts`, `uscf.ts`
  - **Identity resolution**: `identity.ts` — resolves player names to FIDE/USCF IDs via Gemini search
  - **Analysis pipeline**: `gameAnalysis.ts` → `moveSequenceExtractor.ts` → `stockfishAnalysis.ts` (via `analysis.worker.ts` Web Worker)
  - **AI integration**: `geminiService.ts` — calls Supabase Edge Functions (never calls Gemini directly from client)
  - **Persistence**: `playerRepository.ts` — Supabase CRUD for players and scouting reports
  - **Openings**: `openingService.ts` — ECO code lookup
- `src/lib/` — Utilities: Supabase client (`supabase.ts`), env validation (`env.ts`), Zod schemas (`validation.ts`), error formatting (`errorUtils.ts`), Sentry init (`sentry.ts`), theme context (`themeContext.tsx`).
- `src/hooks/` — Custom hooks (e.g., `useScrollAnimation.ts`).

### Supabase Edge Functions
Located in `supabase/functions/`. Each is a Deno-based serverless function:
- `gemini-identity/` — AI-powered player identity search
- `gemini-report/` — AI scouting report generation
- `gemini-chat/` — Follow-up chat analysis
- `delete-user/` — Account deletion
- `health/` — Health check

The `GEMINI_API_KEY` is server-side only, set via `supabase secrets set`.

### Database
Two tables with Row-Level Security (RLS):
- `players` — Player profiles (FIDE ID, USCF ID, platform usernames, metadata JSONB)
- `scouting_reports` — Reports tied to users (report_data JSONB, 30-day expiration)

Migrations in `supabase/migrations/`.

### Data Flow
SearchScreen drives the main pipeline:
1. Validate input (Zod) → resolve player identity → fetch games from Chess.com/Lichess
2. Parse PGNs → extract opening sequences → Stockfish analysis (Web Worker)
3. Generate AI report via edge function → display in ReportDashboard → save via playerRepository

### State Management
- **React Context** for theme (dark/light) and default federation (`themeContext.tsx`)
- **Lifted state** in App.tsx for cross-component data (analysis progress, auth, history)
- **Local state** within SearchScreen and ReportDashboard for their respective flows
- **Supabase Auth** with `onAuthStateChange` listener in App.tsx

### Key Patterns
- Dev proxy in `vite.config.ts` for FIDE, USCF, Chess.com, Lichess APIs (avoids CORS in dev)
- Retry with exponential backoff in service modules (e.g., `chessCom.ts`)
- Stratified sampling for large game sets to maintain opening representation
- Zod validation on all user inputs before processing
- `errorUtils.ts` converts technical errors to user-friendly messages with operation context

## Environment Variables
Required in `.env.local`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional:
- `VITE_SENTRY_DSN` (production error tracking)
- `VITE_SENTRY_ENABLE_DEV` (enable Sentry in dev)

## Testing Notes
- Unit tests sit alongside source as `__tests__/*.test.ts` within each module directory
- E2E tests in `e2e/` directory
- Test setup (`vitest.setup.ts`) mocks `window.matchMedia` and `IntersectionObserver`
- Vitest env defaults `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to empty strings; use `vi.stubEnv()` to override in tests
- Shared mock data in `__tests__/utils/mocks.ts`

## Tech Stack
React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4, Supabase (auth + DB + edge functions), Vitest, Playwright, chess.js, stockfish.js, recharts, Zod, Sentry.
