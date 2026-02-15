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
- 🔐 **Secure**: All API keys stored server-side via Supabase Edge Functions

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4
- **Backend**: Supabase (Database, Auth, Edge Functions)
- **AI**: Google Gemini 3 Flash Preview
- **Chess Engine**: Stockfish.js for position analysis
- **Testing**: Vitest (unit tests), Playwright (E2E tests)
- **Error Tracking**: Sentry
- **Deployment**: Vercel/Netlify compatible

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
   # Link to your Supabase project
   supabase link --project-ref your-project-ref
   
   # Set Gemini API key as a secret
   supabase secrets set GEMINI_API_KEY=your-gemini-api-key
   
   # Deploy edge functions
   supabase functions deploy gemini-identity
   supabase functions deploy gemini-report
   supabase functions deploy health
   
   # Apply database migrations
   supabase db push
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

---

## Project Structure

```
prepsuite/
├── src/                 # Application source code
│   ├── App.tsx          # Main app component
│   ├── index.tsx        # Entry point
│   ├── index.css        # Global styles
│   ├── types.ts         # TypeScript type definitions
│   ├── components/      # React components
│   │   ├── SearchScreen.tsx
│   │   ├── ReportDashboard.tsx
│   │   ├── ErrorBoundary.tsx
│   │   └── ...
│   ├── services/        # Business logic services
│   │   ├── chessCom.ts  # Chess.com API integration
│   │   ├── lichess.ts   # Lichess API integration
│   │   ├── fide.ts      # FIDE profile scraping
│   │   ├── uscf.ts      # USCF profile scraping
│   │   ├── geminiService.ts # AI report generation
│   │   ├── gameAnalysis.ts  # Game parsing and analysis
│   │   └── ...
│   ├── lib/             # Utilities and configuration
│   │   ├── supabase.ts  # Supabase client
│   │   ├── env.ts       # Environment validation
│   │   ├── validation.ts # Input validation schemas
│   │   ├── errorUtils.ts # Error handling utilities
│   │   └── sentry.ts    # Sentry error tracking
│   └── hooks/           # Custom React hooks
├── docs/                # Current documentation
│   └── bak/             # Historical/archived docs
├── supabase/
│   ├── functions/       # Edge functions
│   │   ├── gemini-identity/
│   │   ├── gemini-report/
│   │   └── health/
│   └── migrations/      # Database migrations
├── e2e/                 # E2E tests (Playwright)
└── __tests__/           # Shared test utilities
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
- `npm run test:e2e` - Run E2E tests with Playwright
- `npm run test:e2e:ui` - Run E2E tests with Playwright UI
- `npm run test:all` - Run all tests (unit + E2E)

---

## Environment Variables

### Required
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous key

### Optional
- `VITE_SENTRY_DSN` - Sentry DSN for error tracking (production)
- `VITE_SENTRY_ENABLE_DEV` - Enable Sentry in development (set to "true")

### Supabase Secrets (set via `supabase secrets set`)
- `GEMINI_API_KEY` - Google Gemini API key (required)
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins (optional)

---

## Testing

The project includes comprehensive test coverage:

- **Unit Tests**: 72+ tests covering services, utilities, and components
- **E2E Tests**: Playwright tests for critical user flows
- **Coverage Target**: 70%+ code coverage

Run tests:
```bash
npm run test:all
```

---

## Security

- ✅ API keys stored server-side only (Supabase Edge Functions)
- ✅ JWT verification enabled for edge functions
- ✅ Input validation with Zod schemas
- ✅ CORS restricted to allowed origins
- ✅ Row Level Security (RLS) policies enforced

See `SECURITY_AUDIT.md` for detailed security analysis.

---

## Deployment

### Production Checklist

1. ✅ Set up Supabase project and deploy edge functions
2. ✅ Configure environment variables
3. ✅ Set production secrets (`GEMINI_API_KEY`, `ALLOWED_ORIGINS`)
4. ✅ Build production bundle: `npm run build`
5. ✅ Deploy to hosting (Vercel, Netlify, etc.)
6. ✅ Verify health check endpoint: `/health`

### Health Check

The app includes a health check endpoint:
```
GET https://your-project.supabase.co/functions/v1/health
```

Returns:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-03T...",
  "checks": {
    "database": "ok",
    "edgeFunctions": "ok"
  }
}
```

---

## Documentation

Current documentation lives in `docs/`:

- `docs/DEPLOYMENT_SETUP.md` - Deployment and CI/CD setup guide
- `docs/SECURITY_AUDIT.md` - Security audit results
- `docs/EDGE_FUNCTIONS_SETUP.md` - Edge functions setup guide
- `docs/SETUP_CHECKLIST.md` - Initial setup checklist
- `docs/OAUTH_SETUP.md` - OAuth configuration
- `docs/ALTERNATIVE_DATABASES.md` - Alternative chess data sources

Historical analysis docs are archived in `docs/bak/`.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

[Your License Here]

---

## Support

For issues, questions, or contributions, please open an issue on GitHub.

---

**Built with ❤️ for the chess community**
