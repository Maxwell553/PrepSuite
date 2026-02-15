import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the logger to avoid pino output during tests
vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { generateReport } from '../../src/pipeline/geminiReport.js';
import type { ScoutingReport } from '../../src/lib/types.js';

const schema = { type: 'OBJECT', properties: {} };

const mockReport: ScoutingReport = {
  id: 'test-1',
  player: { name: 'Test', platforms: {} },
  whiteOpenings: [],
  blackDefenses: [],
  strategicSummary: 'test',
  blackStrategicSummary: 'test',
  tacticalProfile: 'test',
  endgameReliability: 'test',
  timeControlInsights: 'test',
  strengths: ['s1'],
  weaknesses: ['w1'],
  specificVulnerability: 'v',
  tacticalRecommendation: 'r',
  preparationSummary: 'p',
  suggestedLines: ['l1'],
  repertoireReliability: 80,
  mostPlayedLines: { white: [], black: [] },
  lastUpdated: '2025-01-01',
};

function makeGeminiResponse(report: ScoutingReport | string) {
  const text = typeof report === 'string' ? report : JSON.stringify(report);
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
  vi.restoreAllMocks();
});

describe('generateReport', () => {
  it('generates report successfully', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeGeminiResponse(mockReport));

    const result = await generateReport('test prompt', schema, 'fake-key');
    expect(result.id).toBe('test-1');
    expect(result.player.name).toBe('Test');
    expect(result.strengths).toEqual(['s1']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 503 then succeeds', async () => {
    vi.useFakeTimers();

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('overloaded', { status: 503 }))
      .mockResolvedValueOnce(makeGeminiResponse(mockReport));
    global.fetch = mockFetch;

    const promise = generateReport('test prompt', schema, 'fake-key');
    await vi.advanceTimersByTimeAsync(15000);
    const result = await promise;

    expect(result.id).toBe('test-1');
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('repairs truncated JSON', async () => {
    const truncatedText = JSON.stringify(mockReport).slice(0, -1); // Remove final }
    const truncatedResponse = new Response(
      JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text: truncatedText }] },
            finishReason: 'MAX_TOKENS',
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    global.fetch = vi.fn().mockResolvedValueOnce(truncatedResponse);

    const result = await generateReport('test prompt', schema, 'fake-key');
    expect(result.id).toBe('test-1');
    expect(result.player.name).toBe('Test');
  });

  it('throws after max retries exhausted on 503', async () => {
    vi.useFakeTimers();

    // MAX_RETRIES is 2, so attempts are 0, 1, 2 = 3 total calls
    // 503 on attempts 0, 1 triggers continue; attempt 2 (last) also 503 but attempt < MAX_RETRIES is false
    // so it falls through to !res.ok and throws
    // Must return a fresh Response each call (body can only be read once)
    const mockFetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('overloaded', { status: 503 })));
    global.fetch = mockFetch;

    const promise = generateReport('test prompt', schema, 'fake-key');
    // Attach catch handler immediately to prevent unhandled rejection warning
    let caughtError: Error | undefined;
    promise.catch((e: Error) => { caughtError = e; });

    // Advance enough time for all retries
    await vi.advanceTimersByTimeAsync(30000);

    await expect(promise).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('handles 429 rate limit then succeeds', async () => {
    vi.useFakeTimers();

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(makeGeminiResponse(mockReport));
    global.fetch = mockFetch;

    const promise = generateReport('test prompt', schema, 'fake-key');
    // Advance past the 10s rate-limit delay + backoff
    await vi.advanceTimersByTimeAsync(20000);
    const result = await promise;

    expect(result.id).toBe('test-1');
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('handles empty response text and retries', async () => {
    vi.useFakeTimers();

    // Must return a fresh Response each call (body can only be read once)
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: '' }] },
                finishReason: 'STOP',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    global.fetch = mockFetch;

    const promise = generateReport('test prompt', schema, 'fake-key');
    // Attach catch handler immediately to prevent unhandled rejection warning
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(30000);

    await expect(promise).rejects.toThrow('Gemini returned empty response');
    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });
});
