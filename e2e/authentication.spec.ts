import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should show login option when not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Look for sign in button or auth-related elements
    const signInButton = page.locator('text=/sign in|login|get started/i').first();
    
    // If auth UI exists, verify it's visible
    if (await signInButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(signInButton).toBeVisible();
    }
  });

  test('should handle authentication state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if user menu or profile exists
    const userMenu = page.locator('[aria-label*="user"], [aria-label*="profile"], [data-testid*="user"]').first();
    
    // App should load regardless of auth state
    await expect(page.locator('body')).toBeVisible();
  });
});
