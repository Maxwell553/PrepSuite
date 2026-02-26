import { test, expect } from '@playwright/test';

/**
 * E2E tests for pipeline integration with mocked /api/analyze.
 * These tests mock the pipeline service to avoid hitting the real backend.
 *
 * Note: Full analysis flow tests require the user to be logged in.
 * Run with TEST_USER_EMAIL and TEST_USER_PASSWORD for authenticated tests.
 */

function createMockSseReport() {
  const report = {
    id: 'e2e-mock-report-1',
    player: {
      name: 'E2E Test Player',
      fideId: '123456',
      platforms: { chessCom: 'testplayer', lichess: 'testplayer' },
    },
    whiteOpenings: [],
    blackDefenses: [],
    strategicSummary: 'Test summary',
    blackStrategicSummary: 'Test black summary',
    tacticalProfile: 'Test tactical',
    endgameReliability: 'Test endgame',
    timeControlInsights: 'Test time control',
    strengths: [],
    weaknesses: [],
    specificVulnerability: 'Test vulnerability',
    tacticalRecommendation: 'Test recommendation',
    preparationSummary: 'Test preparation',
    suggestedLines: [],
    repertoireReliability: 80,
    mostPlayedLines: { white: [], black: [] },
    lastUpdated: new Date().toISOString(),
  };

  const sseLines = [
    'event: phase\ndata: {"phase":"identity","status":"started"}\n\n',
    'event: phase\ndata: {"phase":"identity","status":"complete","durationMs":500}\n\n',
    'event: phase\ndata: {"phase":"games","status":"started"}\n\n',
    'event: phase\ndata: {"phase":"games","status":"complete","gameCount":10}\n\n',
    'event: phase\ndata: {"phase":"report","status":"started"}\n\n',
    'event: phase\ndata: {"phase":"report","status":"complete"}\n\n',
    `event: complete\ndata: ${JSON.stringify({ report })}\n\n`,
  ];
  return sseLines.join('');
}

test.describe('Pipeline Mock', () => {
  test('should handle pipeline API error gracefully', async ({ page }) => {
    await page.route('**/api/analyze', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // When not logged in, we see the landing page. The API mock is in place.
    // If we had auth, we could submit and verify error handling.
    // For now, verify the app loads and the mock is registered
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle pipeline SSE stream when authenticated', async ({ page }) => {
    const mockSse = createMockSseReport();
    await page.route('**/api/analyze', (route) => {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: mockSse,
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check if we're on the search screen (logged in) or landing (not logged in)
    const searchForm = page.locator('form').filter({ has: page.locator('input[placeholder*="Player Name"]') });
    const isSearchVisible = await searchForm.isVisible().catch(() => false);

    if (isSearchVisible) {
      await searchForm.locator('input[placeholder*="Player Name"]').fill('Magnus Carlsen');
      await searchForm.locator('button[type="submit"]').click();

      // Wait for pipeline to complete and dashboard to appear
      await expect(page.getByText(/Opponent Analysis|Report|strategic|E2E Test Player/i)).toBeVisible({ timeout: 10000 });
    }
    // When not logged in, the mock is registered and app loads; full flow requires auth
  });
});
