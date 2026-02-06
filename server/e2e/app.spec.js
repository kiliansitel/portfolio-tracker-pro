/**
 * End-to-End Tests for Portfolio Tracker
 * 
 * App structure: Auth overlay shows on load (not logged in).
 * Must register/login first to access dashboard features.
 */

const { test, expect } = require('@playwright/test');

// Shared test user
const testUser = {
  username: `e2e_${Date.now()}`,
  email: `e2e_${Date.now()}@test.com`,
  password: 'E2eTestPass123!'
};

test.describe('Portfolio Tracker E2E', () => {

  test.describe('Auth Overlay', () => {
    test('shows auth overlay on load', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('#authOverlay')).toBeVisible();
      await expect(page.locator('#loginForm')).toBeVisible();
    });

    test('can switch between login and register tabs', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('#loginForm')).toBeVisible();
      
      // Switch to register
      await page.click('[data-form="register"]');
      await expect(page.locator('#registerForm')).toBeVisible();
      
      // Switch back to login
      await page.click('[data-form="login"]');
      await expect(page.locator('#loginForm')).toBeVisible();
    });

    test.skip('prevents weak password on register', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-form="register"]');
      
      await page.fill('#registerForm input[name="username"]', 'weakuser');
      await page.fill('#registerForm input[name="email"]', 'weak@test.com');
      await page.fill('#registerForm input[name="password"]', '123');
      await page.click('#registerForm button[type="submit"]');
      
      // HTML5 minlength validation prevents submission — auth overlay should still be visible
      await expect(page.locator('#authOverlay')).toBeVisible();
      // And we should NOT be logged in (no dashboard)
      await expect(page.locator('.summary-grid')).not.toBeVisible();
    });

    test('can register and access dashboard', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-form="register"]');
      
      await page.fill('#registerForm input[name="username"]', testUser.username);
      await page.fill('#registerForm input[name="email"]', testUser.email);
      await page.fill('#registerForm input[name="password"]', testUser.password);
      await page.click('#registerForm button[type="submit"]');
      
      // Auth overlay should disappear, dashboard visible
      await expect(page.locator('#authOverlay')).not.toBeVisible({ timeout: 10000 });
      await expect(page.locator('.summary-grid')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Dashboard (logged in)', () => {
    // Login before each test
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      // Register a fresh user each time (simpler than sharing state)
      const u = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await page.click('[data-form="register"]');
      await page.fill('#registerForm input[name="username"]', u);
      await page.fill('#registerForm input[name="email"]', `${u}@test.com`);
      await page.fill('#registerForm input[name="password"]', 'E2eTestPass123!');
      await page.click('#registerForm button[type="submit"]');
      await expect(page.locator('#authOverlay')).not.toBeVisible({ timeout: 10000 });
    });

    test('shows portfolio value and chart', async ({ page }) => {
      await expect(page.locator('.summary-grid')).toBeVisible();
      await expect(page.locator('#chartContainer')).toBeVisible();
    });

    test('API calls work (no CSP blocking)', async ({ page }) => {
      const response = await page.evaluate(async () => {
        try {
          const res = await fetch('/api/tickers/popular');
          return { ok: res.ok, status: res.status };
        } catch (e) {
          return { error: e.message };
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.ok).toBe(true);
    });

    test('can navigate between pages', async ({ page }) => {
      await page.click('[data-page="portfolio"]');
      await expect(page.locator('#page-portfolio')).toHaveClass(/active/);
      
      await page.click('[data-page="watchlist"]');
      await expect(page.locator('#page-watchlist')).toHaveClass(/active/);
      
      await page.click('[data-page="alerts"]');
      await expect(page.locator('#page-alerts')).toHaveClass(/active/);
      
      await page.click('[data-page="news"]');
      await expect(page.locator('#page-news')).toHaveClass(/active/);
      
      await page.click('[data-page="settings"]');
      await expect(page.locator('#page-settings')).toHaveClass(/active/);
      
      await page.click('[data-page="dashboard"]');
      await expect(page.locator('#page-portfolio')).not.toHaveClass(/active/);
    });

    test('settings page has theme toggle', async ({ page }) => {
      await page.click('[data-page="settings"]');
      
      const lightBtn = page.locator('.theme-btn[data-theme="light"]');
      const darkBtn = page.locator('.theme-btn[data-theme="dark"]');
      
      await lightBtn.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      
      await darkBtn.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });

    test('works on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await expect(page.locator('.nav-item').first()).toBeVisible();
      await expect(page.locator('.summary-grid')).toBeVisible();
    });
  });

  test.describe('No JS Errors', () => {
    test('page loads without critical console errors', async ({ page }) => {
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      
      await page.goto('/');
      await page.waitForSelector('#authOverlay', { timeout: 10000 });
      
      // Filter expected errors (network/CORS from Yahoo etc)
      const critical = errors.filter(e =>
        !e.includes('fetch') && !e.includes('yahoo') &&
        !e.includes('cors') && !e.includes('allorigins') &&
        !e.includes('NetworkError')
      );
      
      expect(critical).toHaveLength(0);
    });
  });
});
