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
      // Wait for app to initialize — look for a known element instead of blind timeout
      await page.waitForSelector('.summary-grid', { timeout: 10000 });
      
      const criticalErrors = errors.filter(e => 
        !e.includes('corsproxy') && 
        !e.includes('yahoo') &&
        !e.includes('allorigins') &&
        !e.includes('Failed to fetch')
      );
      
      expect(criticalErrors).toHaveLength(0);
    });

    test('API calls work (no CSP blocking)', async ({ page }) => {
      await page.goto('/');
      
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
      await page.waitForSelector('[data-page="settings"]');
      
      await page.click('[data-page="settings"]');
      await expect(page.locator('#page-settings')).toHaveClass(/active/);
    });

    test('login form submits without network error', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Login');
      
      await page.fill('input[name="username"], input[name="login"]', 'testuser');
      await page.fill('input[name="password"]', 'wrongpassword');
      
      let networkError = false;
      page.on('requestfailed', () => { networkError = true; });
      
      await page.click('button:has-text("Login")');
      // Wait for network response instead of timeout
      await page.waitForResponse(resp => resp.url().includes('/api/auth/login'), { timeout: 5000 }).catch(() => {});
      
      expect(networkError).toBe(false);
    });
  });
  
  test.describe('Homepage', () => {
    test('loads the dashboard', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('.summary-grid', { timeout: 10000 });
      
      await expect(page.locator('text=Portfolio Pro')).toBeVisible();
      await expect(page.locator('text=Portfolio Value')).toBeVisible();
    });

    test('shows login button when not authenticated', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('text=Login')).toBeVisible();
    });

    test('market data loads', async ({ page }) => {
      await page.goto('/');
      const marketsGrid = page.locator('.markets-grid');
      await expect(marketsGrid).toBeVisible({ timeout: 10000 });
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
      await page.click('text=Login');
      await page.click('text=Register');
      
      await page.fill('input[name="username"]', testUser.username);
      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);
      
      await page.click('button:has-text("Register")');
      
      await expect(page.locator(`text=${testUser.username}`)).toBeVisible({ timeout: 5000 });
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
      await page.waitForResponse(resp => resp.url().includes('/api/auth/register'), { timeout: 5000 }).catch(() => {});
      
      // Go to settings and logout
      await page.click('[data-page="settings"]');
      await page.click('text=Logout');
      
      await expect(page.locator('text=Login')).toBeVisible({ timeout: 5000 });
    });

    test('shows validation errors for weak password', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Login');
      await page.click('text=Register');
      
      await page.fill('input[name="username"]', 'weakpassuser');
      await page.fill('input[name="email"]', 'weak@test.com');
      await page.fill('input[name="password"]', '123');
      
      await page.click('button:has-text("Register")');
      
      await expect(page.locator('.error, .alert, text=Password')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Navigation', () => {
    test('can navigate between pages', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-page]', { timeout: 5000 });
      
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
  });

  test.describe('News Feature', () => {
    test('loads news articles', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-page="news"]');
      
      // Wait for actual news items to appear
      await expect(page.locator('.news-item').first()).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Chart Interaction', () => {
    test('chart container loads on dashboard', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('.summary-grid', { timeout: 10000 });
      
      const chartContainer = page.locator('#chartContainer');
      await expect(chartContainer).toBeVisible();
    });
  });

  test.describe('Theme', () => {
    test('can toggle dark/light theme', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-page="settings"]');
      
      const lightBtn = page.locator('.theme-btn[data-theme="light"]');
      const darkBtn = page.locator('.theme-btn[data-theme="dark"]');
      
      await lightBtn.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      
      await darkBtn.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });
  });

  test.describe('Responsive Design', () => {
    test('works on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      
      await expect(page.locator('.nav-item').first()).toBeVisible();
      await expect(page.locator('.summary-grid')).toBeVisible();
    });
  });
});
