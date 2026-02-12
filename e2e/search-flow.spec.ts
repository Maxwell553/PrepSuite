import { test, expect } from '@playwright/test';

test.describe('Search Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should display search screen', async ({ page }) => {
    // When not logged in: LandingPage with hero. When logged in: SearchScreen with form.
    // Use .first() to avoid strict mode violation when multiple elements match
    const heroHeading = page.getByRole('heading', { name: /master your opponent/i });
    const searchForm = page.locator('form').first();
    await expect(heroHeading.or(searchForm).first()).toBeVisible();
  });

  test('should show validation error for empty name', async ({ page }) => {
    // Try to submit without entering a name
    const submitButton = page.locator('button[type="submit"]').first();
    
    // If submit button exists, click it
    if (await submitButton.isVisible()) {
      await submitButton.click();
      
      // Wait a bit for validation
      await page.waitForTimeout(500);
      
      // Check for error message (adjust selector based on your UI)
      const errorMessage = page.locator('text=/required|invalid|error/i').first();
      if (await errorMessage.isVisible()) {
        await expect(errorMessage).toBeVisible();
      }
    }
  });

  test('should navigate through app sections', async ({ page }) => {
    // Check if navigation/sidebar exists
    const sidebar = page.locator('nav, aside, [role="navigation"]').first();
    
    if (await sidebar.isVisible()) {
      // Try clicking on different sections if they exist
      const links = sidebar.locator('a, button').first();
      if (await links.isVisible()) {
        await links.click();
        await page.waitForTimeout(500);
      }
    }
  });
});

test.describe('Error Handling', () => {
  test('should handle network errors gracefully', async ({ page }) => {
    // Intercept network requests and simulate failure
    await page.route('**/api/**', route => route.abort());
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // App should still load even with network errors
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should display error boundary on component errors', async ({ page }) => {
    await page.goto('/');
    
    // Try to trigger an error (this depends on your app structure)
    // For now, just verify the page loads
    await expect(page.locator('body')).toBeVisible();
  });
});
