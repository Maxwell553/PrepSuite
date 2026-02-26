# PrepSuite

**Chess Opponent Analysis Platform**

PrepSuite is a comprehensive chess scouting platform that aggregates player data from multiple sources (Chess.com, Lichess, FIDE, USCF) and uses AI to generate detailed opponent analysis reports. Perfect for tournament preparation and strategic planning.

---

## Features

- 🔍 **Multi-Source Player Search**: Search players by name, FIDE ID, USCF ID, Chess.com username, or Lichess username
- 🤖 **AI-Powered Analysis**: Generate comprehensive scouting reports using Google Gemini AI
- 📊 **Opening Statistics**: Analyze opening preferences, win rates, and most-played lines
- 🎯 **Strategic Insights**: Get tactical recommendations and vulnerability analysis
- 📈 **Performance Tracking**: Track opponent performance across different time controls
- 💾 **Report History**: Save and manage your scouting reports
- 🔐 **Secure**: All API keys stored server-side (pipeline service + Supabase)

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4
- **Backend**: Pipeline service (Node/Hono on Cloud Run) + Supabase (Database, Auth)
- **AI**: Google Gemini (via pipeline service)
- **Chess Engine**: Native Stockfish (in pipeline service)
- **Testing**: Vitest (unit tests), Playwright (E2E tests)
- **Error Tracking**: Sentry
- **Deployment**: Vercel/Netlify (frontend), Cloud Run (pipeline)

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Google Gemini API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd prepsuite
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file:
   ```env
   VITE_SUPABASE_URL=your-supabase-project-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   VITE_SENTRY_DSN=your-sentry-dsn (optional, for error tracking)
   ```

4. **Set up Supabase**
   
   ```bash
   supabase link --project-ref your-project-ref
   supabase db push
   supabase functions deploy delete-user
   supabase functions deploy health
   ```

5. **Set up and run the Pipeline Service** (required for analysis)
   
   ```bash
   cd pipeline-service
   cp .env.example .env
   # Edit .env: set SUPABASE_JWT_SECRET, SUPABASE_URL, GEMINI_API_KEY
   npm install && npm run dev
   ```
   The pipeline runs on port 8080.

6. **Run the frontend**
   
   In another terminal, from the project root:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`. Vite proxies `/api/*` to the pipeline service.

---

## Project Structure

```
prepsuite/
├── src/                 # Frontend application
│   ├── App.tsx          # Main app component
│   ├── index.tsx        # Entry point
│   ├── types.ts         # TypeScript type definitions
│   ├── components/      # React components
│   │   ├── SearchScreen.tsx
│   │   ├── ReportDashboard.tsx
│   │   ├── RepertoireChat.tsx
│   │   └── ...
│   ├── services/        # Business logic
│   │   ├── pipelineClient.ts  # Pipeline service client
│   │   └── playerRepository.ts # Supabase CRUD
│   ├── lib/             # Utilities
│   └── hooks/           # Custom React hooks
├── pipeline-service/    # Backend analysis pipeline (Node/Hono)
│   ├── src/
│   │   ├── pipeline/    # Identity, games, parsing, engine, report
│   │   ├── routes/      # /api/analyze, /api/chat
│   │   └── lib/         # Shared utilities
│   └── __tests__/
├── supabase/
│   ├── functions/       # Edge functions (delete-user, health)
│   └── migrations/      # Database migrations
├── e2e/                 # E2E tests (Playwright)
└── docs/                # Documentation
```

---

## Available Scripts

### Development
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Testing
- `npm test` - Run unit tests in watch mode
- `npm run test:run` - Run unit tests once (for CI)
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:e2e` - E2E tests with Playwright
- `npm run test:e2e:headed` - E2E tests in headed browser
- `npm run test:all` - Run all tests (unit + E2E)

---

## Environment Variables

### Frontend (.env.local)
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key
- `VITE_PIPELINE_SERVICE_URL` - Optional; pipeline service URL (default: proxied in dev)
- `VITE_SENTRY_DSN` - Optional; Sentry DSN
- `VITE_SENTRY_ENABLE_DEV` - Optional; enable Sentry in dev ("true")

### Pipeline Service (pipeline-service/.env)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_JWT_SECRET` - JWT secret for verifying auth tokens
- `GEMINI_API_KEY` - Google Gemini API key

---

## Testing

- **Unit Tests**: Vitest tests for services, utilities, and components
- **E2E Tests**: Playwright tests for critical user flows
- **Coverage Target**: 70%+ code coverage

```bash
npm run test:all
```

---

## Security

- ✅ API keys stored server-side only (pipeline service, Supabase)
- ✅ JWT verification for pipeline service and edge functions
- ✅ Input validation with Zod schemas
- ✅ Row Level Security (RLS) policies enforced

See `docs/SECURITY_AUDIT.md` for detailed security analysis.

---

## Deployment

1. Deploy pipeline service to Cloud Run
2. Deploy frontend to Vercel/Netlify with `VITE_PIPELINE_SERVICE_URL` pointing to Cloud Run
3. Configure Supabase (auth, migrations, edge functions)
4. Set production secrets

See `docs/DEPLOYMENT_SETUP.md` for full deployment guide.

---

## Documentation

- `docs/DEPLOYMENT_SETUP.md` - Deployment and CI/CD setup
- `docs/SECURITY_AUDIT.md` - Security audit results
- `docs/ARCHITECTURE.md` - System architecture
- `docs/SETUP_CHECKLIST.md` - Initial setup checklist
- `docs/SUPABASE_MIGRATION.md` - Supabase changes (removed gemini-identity, gemini-report)
- `docs/OAUTH_SETUP.md` - OAuth configuration

---

**Built with ❤️ for the chess community**
