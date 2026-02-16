import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock pipeline modules
vi.mock('../../src/pipeline/identity.js', () => ({
  resolveIdentity: vi.fn(),
}));

vi.mock('../../src/pipeline/gameFetcher.js', () => ({
  fetchGames: vi.fn(),
}));

vi.mock('../../src/pipeline/gameParser.js', () => ({
  parseChessComGames: vi.fn().mockReturnValue([]),
  parseLichessGames: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/pipeline/openingClassifier.js', () => ({
  identifyOpeningsBatch: vi.fn().mockResolvedValue(new Map()),
  aggregateECO: vi.fn().mockReturnValue('Unknown'),
}));

vi.mock('../../src/pipeline/statsAggregator.js', () => ({
  generateStats: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/pipeline/moveSequenceExtractor.js', () => ({
  extractMostPlayedLines: vi.fn().mockReturnValue({ white: [], black: [] }),
  parsePGNMoves: vi.fn().mockReturnValue([]),
  formatMoveSequence: vi.fn().mockReturnValue(''),
}));

vi.mock('../../src/pipeline/enginePool.js', () => ({
  StockfishPool: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    analyzeGames: vi.fn().mockResolvedValue([]),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../src/pipeline/engineSampler.js', () => ({
  sampleGamesForAnalysis: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/pipeline/geminiReport.js', () => ({
  generateReport: vi.fn().mockResolvedValue({
    id: 'test-report-1',
    player: { name: 'Test Player', platforms: {} },
    whiteOpenings: [],
    blackDefenses: [],
    strategicSummary: 'test summary',
    blackStrategicSummary: 'test black summary',
    tacticalProfile: 'test profile',
    endgameReliability: 'test endgame',
    timeControlInsights: 'test insights',
    strengths: ['strength1'],
    weaknesses: ['weakness1'],
    specificVulnerability: 'test vuln',
    tacticalRecommendation: 'test rec',
    preparationSummary: 'test prep',
    suggestedLines: ['1. e4 e5'],
    repertoireReliability: 80,
    mostPlayedLines: { white: [], black: [] },
    lastUpdated: '2025-01-01',
  }),
}));

vi.mock('../../src/pipeline/promptBuilder.js', () => ({
  buildReportPrompt: vi.fn().mockReturnValue('mock prompt'),
  reportResponseSchema: { type: 'OBJECT', properties: {} },
}));

vi.mock('../../src/pipeline/reportPostProcessor.js', () => ({
  postProcessReport: vi.fn().mockImplementation((report: any) => ({
    ...report,
    lastUpdated: new Date().toISOString(),
  })),
}));

// Mock auth middleware (bypass JWT)
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: vi.fn().mockImplementation(async (_c: any, next: any) => {
    return next();
  }),
}));

import { analyzeRoute } from '../../src/routes/analyze.js';
import { resolveIdentity } from '../../src/pipeline/identity.js';
import { fetchGames } from '../../src/pipeline/gameFetcher.js';

const mockedResolve = vi.mocked(resolveIdentity);
const mockedFetchGames = vi.mocked(fetchGames);

function createApp() {
  const app = new Hono();
  // Set user var directly for testing (bypass real auth)
  app.use('*', async (c, next) => {
    c.set('user' as any, { sub: 'test-user', email: 'test@test.com' });
    await next();
  });
  app.route('/api', analyzeRoute);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GEMINI_API_KEY = 'test-key';
});

describe('POST /api/analyze', () => {
  it('returns 400 for invalid input (missing name)', async () => {
    const app = createApp();
    const res = await app.request('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 for empty name', async () => {
    const app = createApp();
    const res = await app.request('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns SSE stream for valid input', async () => {
    mockedResolve.mockResolvedValue({
      verifiedName: 'Test Player',
      fideProfile: null,
      uscfProfile: null,
      chessComUsername: 'testplayer',
      lichessUsername: '',
      confidence: 1.0,
    });

    mockedFetchGames.mockImplementation(async (_cc, _lc, _limit, sse) => {
      sse.sendPhase({ phase: 'games', status: 'started' });
      sse.sendPhase({ phase: 'games', status: 'complete', durationMs: 100, gameCount: 5 });
      return {
        chessComGames: [],
        lichessGamesNdjson: '',
        totalGames: 0,
        durationMs: 100,
      };
    });

    const app = createApp();
    const res = await app.request('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Player' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');

    // Read the full SSE stream
    const text = await res.text();
    expect(text).toContain('event: phase');
    expect(text).toContain('event: complete');
    expect(text).toContain('Test Player');
  });

  it('includes parsing and engine phases in SSE stream', async () => {
    mockedResolve.mockResolvedValue({
      verifiedName: 'Test Player',
      fideProfile: null,
      uscfProfile: null,
      chessComUsername: 'testplayer',
      lichessUsername: '',
      confidence: 1.0,
    });

    mockedFetchGames.mockImplementation(async (_cc, _lc, _limit, sse) => {
      sse.sendPhase({ phase: 'games', status: 'started' });
      sse.sendPhase({ phase: 'games', status: 'complete', durationMs: 50, gameCount: 0 });
      return {
        chessComGames: [],
        lichessGamesNdjson: '',
        totalGames: 0,
        durationMs: 50,
      };
    });

    const app = createApp();
    const res = await app.request('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Player' }),
    });

    const text = await res.text();
    // Should contain all 5 phases
    expect(text).toContain('"phase":"identity"');
    expect(text).toContain('"phase":"games"');
    expect(text).toContain('"phase":"parsing"');
    expect(text).toContain('"phase":"engine"');
    expect(text).toContain('"phase":"report"');
    // Complete event should have report field
    expect(text).toContain('event: complete');
    expect(text).toContain('"report"');
  });
});
