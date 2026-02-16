import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock auth middleware (bypass JWT)
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: vi.fn().mockImplementation(async (_c: any, next: any) => next()),
}));

// Mock the logger to avoid pino output during tests
vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { chatRoute } from '../../src/routes/chat.js';

function createApp() {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('user' as any, { sub: 'test-user', email: 'test@test.com' });
    await next();
  });
  app.route('/api', chatRoute);
  return app;
}

const validBody = {
  report: {
    player: { name: 'Test Player', platforms: {} },
    whiteOpenings: [
      {
        name: 'Sicilian',
        eco: 'B20',
        frequency: 0.3,
        winRate: 0.55,
        drawRate: 0.2,
        lossRate: 0.25,
        wins: 11,
        draws: 4,
        losses: 5,
        totalGames: 20,
        trend: 'stable',
      },
    ],
    blackDefenses: [],
    mostPlayedLines: { white: [], black: [] },
    preparationSummary: 'Test summary',
    blackStrategicSummary: 'Test black summary',
  },
  question: 'What does this player play as White?',
};

function makeGeminiChatResponse(text: string) {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text }] },
          finishReason: 'STOP',
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GEMINI_API_KEY = 'test-key';
  global.fetch = vi.fn();
});

describe('POST /api/chat', () => {
  it('returns 400 for missing question', async () => {
    const app = createApp();
    const body = { report: validBody.report };

    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 for missing report', async () => {
    const app = createApp();
    const body = { question: 'What does this player play?' };

    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns chat text on success', async () => {
    const responseText = 'Test Player primarily opens with 1.e4 leading to Sicilian structures.';
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeGeminiChatResponse(responseText),
    );

    const app = createApp();
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.text).toBe(responseText);
  });

  it('handles Gemini error gracefully', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const app = createApp();
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toContain('AI service error');
  });

  it('builds correct chat prompt (includes player name)', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      makeGeminiChatResponse('Some analysis text'),
    );
    global.fetch = mockFetch;

    const app = createApp();
    await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchCallBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const promptText = fetchCallBody.contents[0].parts[0].text;
    expect(promptText).toContain('Test Player');
  });
});
