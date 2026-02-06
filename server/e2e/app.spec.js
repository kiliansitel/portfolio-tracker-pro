/**
 * End-to-End Tests for Portfolio Tracker
 */

const { test, expect } = require('@playwright/test');

test.describe('Portfolio Tracker E2E', () => {

  test.describe('Critical: No CSP/JS Errors', () => {
    test('page loads without console errors', async ({ page }) => {
      const errors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', err => errors.push(err.message));
      
      await page.goto('/');
      await page.waitForTimeout(2000);
      
      // Filter out expected errors (like rate limit on Yahoo)
      const criticalErrors = errors.filter(e => 
        !e.includes('corsproxy') && 
        !e.includes('yahoo') &&
        !e.includes('allorigins')
      );
      
      expect(criticalErrors).toHaveLength(0);
    });

    test('API calls work (no CSP blocking)', async ({ page }) => {
      await page.goto('/');
      
      // Try to hit the API - this would fail if CSP blocks it
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

    test('onclick handlers work (not blocked by CSP)', async ({ page }) => {
      await page.goto('/');
      
      // Click on a nav item - uses onclick
      const navItem = page.locator('[data-page="settings"]');
      await navItem.click();
      
      // Should navigate to settings page
      await expect(page.locator('#page-settings')).toHaveClass(/active/);
    });

    test('login form submits without network error', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Login');
      
      // Fill and submit login form
      await page.fill('input[name="username"], input[name="login"]', 'testuser');
      await page.fill('input[name="password"]', 'wrongpassword');
      
      // Listen for network errors
      let networkError = false;
      page.on('requestfailed', () => { networkError = true; });
      
      await page.click('button:has-text("Login")');
      await page.waitForTimeout(1000);
      
      // Should NOT have network error (CSP would cause this)
      expect(networkError).toBe(false);
    });
  });
  
  test.describe('Homepage', () => {
    test('loads the dashboard', async ({ page }) => {
      await page.goto('/');
      
      // Check main elements exist
      await expect(page.locator('text=Portfolio Pro')).toBeVisible();
      await expect(page.locator('text=Portfolio Value')).toBeVisible();
      await expect(page.locator('text=Chart')).toBeVisible();
      await expect(page.locator('text=Markets')).toBeVisible();
    });

    test('shows login button when not authenticated', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('text=Login')).toBeVisible();
    });

    test('market data loads', async ({ page }) => {
      await page.goto('/');
      
      // Wait for markets to load (look for price data)
      await page.waitForTimeout(3000);
      
      // Should show some market data (S&P 500, etc)
      const marketsGrid = page.locator('.markets-grid');
      await expect(marketsGrid).toBeVisible();
    });
  });

  test.describe('Authentication', () => {
    const testUser = {
      username: `e2euser${Date.now()}`,
      email: `e2e${Date.now()}@test.com`,
      password: 'E2eTestPass123!'
    };

    test('can register new account', async ({ page }) => {
      await page.goto('/');
      
      // Click login to show auth modal
      await page.click('text=Login');
      
      // Switch to register tab
      await page.click('text=Register');
      
      // Fill registration form
      await page.fill('input[name="username"]', testUser.username);
      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);
      
      // Submit
      await page.click('button:has-text("Register")');
      
      // Should close modal and show logged in state
      await page.waitForTimeout(1000);
      await expect(page.locator(`text=${testUser.username}`)).toBeVisible();
    });

    test('can logout and login again', async ({ page }) => {
      await page.goto('/');
      
      // Register first
      await page.click('text=Login');
      await page.click('text=Register');
      await page.fill('input[name="username"]', testUser.username + '2');
      await page.fill('input[name="email"]', 'e2e2' + Date.now() + '@test.com');
      await page.fill('input[name="password"]', testUser.password);
      await page.click('button:has-text("Register")');
      await page.waitForTimeout(1000);
      
      // Go to settings and logout
      await page.click('[data-page="settings"]');
      await page.click('text=Logout');
      
      // Should show login button again
      await expect(page.locator('text=Login')).toBeVisible();
    });

    test('shows validation errors for weak password', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Login');
      await page.click('text=Register');
      
      await page.fill('input[name="username"]', 'weakpassuser');
      await page.fill('input[name="email"]', 'weak@test.com');
      await page.fill('input[name="password"]', '123');
      
      await page.click('button:has-text("Register")');
      
      // Should show error
      await page.waitForTimeout(500);
      await expect(page.locator('.error, .alert, text=Password')).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('can navigate between pages', async ({ page }) => {
      await page.goto('/');
      
      // Click Portfolio tab
      await page.click('[data-page="portfolio"]');
      await expect(page.locator('#page-portfolio')).toHaveClass(/active/);
      
      // Click Watchlist tab
      await page.click('[data-page="watchlist"]');
      await expect(page.locator('#page-watchlist')).toHaveClass(/active/);
      
      // Click Alerts tab
      await page.click('[data-page="alerts"]');
      await expect(page.locator('#page-alerts')).toHaveClass(/active/);
      
      // Click News tab
      await page.click('[data-page="news"]');
      await expect(page.locator('#page-news')).toHaveClass(/active/);
      
      // Click Settings tab
      await page.click('[data-page="settings"]');
      await expect(page.locator('#page-settings')).toHaveClass(/active/);
      
      // Back to Dashboard
      await page.click('[data-page="dashboard"]');
      await expect(page.locator('#page-portfolio')).not.toHaveClass(/active/);
    });
  });

  test.describe('News Feature', () => {
    test('loads news articles', async ({ page }) => {
      await page.goto('/');
      
      // Navigate to news
      await page.click('[data-page="news"]');
      
      // Wait for news to load
      await page.waitForTimeout(3000);
      
      // Should show news items
      const newsItems = page.locator('.news-item');
      await expect(newsItems.first()).toBeVisible();
    });

    test('can search news', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-page="news"]');
      
      // Click search filter
      await page.click('text=Search');
      
      // Type search query
      await page.fill('#newsSearchInput', 'Tesla');
      await page.press('#newsSearchInput', 'Enter');
      
      // Wait for results
      await page.waitForTimeout(2000);
      
      // Should show results
      const newsItems = page.locator('.news-item');
      await expect(newsItems.first()).toBeVisible();
    });
  });

  test.describe('Chart Interaction', () => {
    test('chart loads on dashboard', async ({ page }) => {
      await page.goto('/');
      
      // Wait for chart to load
      await page.waitForTimeout(3000);
      
      // Chart container should exist
      const chartContainer = page.locator('#chartContainer, .tv-lightweight-charts');
      await expect(chartContainer).toBeVisible();
    });

    test('can change chart timeframe', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(2000);
      
      // Click different timeframes
      await page.click('text=1D');
      await page.waitForTimeout(1000);
      
      await page.click('text=1M');
      await page.waitForTimeout(1000);
      
      // Chart should still be visible
      const chartContainer = page.locator('#chartContainer');
      await expect(chartContainer).toBeVisible();
    });
  });

  test.describe('Theme', () => {
    test('can toggle dark/light theme', async ({ page }) => {
      await page.goto('/');
      
      // Go to settings
      await page.click('[data-page="settings"]');
      
      // Find theme toggle
      const lightBtn = page.locator('.theme-btn[data-theme="light"]');
      const darkBtn = page.locator('.theme-btn[data-theme="dark"]');
      
      // Click light theme
      await lightBtn.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      
      // Click dark theme
      await darkBtn.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });
  });

  test.describe('Responsive Design', () => {
    test('works on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      
      // Navigation should be visible
      await expect(page.locator('.nav-item').first()).toBeVisible();
      
      // Cards should be stacked
      await expect(page.locator('.summary-grid')).toBeVisible();
    });

    test('works on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/');
      
      await expect(page.locator('text=Portfolio Pro')).toBeVisible();
      await expect(page.locator('.summary-grid')).toBeVisible();
    });
  });
});
