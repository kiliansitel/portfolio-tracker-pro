const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:8081';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
const LOGIN = { login: 'demo', password: 'DemoPass123!' };

async function shot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.jpg`), type: 'jpeg', quality: 92, fullPage: false });
  console.log(`✅ ${name}`);
}

async function clickNav(page, index) {
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('.modal-overlay[style*="display: flex"]').forEach(m => m.style.display = 'none');
  });
  await page.waitForTimeout(200);
  await page.evaluate((i) => {
    const items = document.querySelectorAll('nav .nav-item');
    if (items[i]) items[i].click();
  }, index);
  await page.waitForTimeout(2500);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();

  // Login
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  await page.fill('#loginForm input[name="login"]', LOGIN.login);
  await page.fill('#loginForm input[name="password"]', LOGIN.password);
  await page.click('#loginForm button[type="submit"]');
  await page.waitForTimeout(5000); // Extra time for prices to load

  // 1. Dashboard
  await shot(page, 'dashboard');

  // 2. Positions
  await clickNav(page, 0);
  await shot(page, 'positions');

  // 3. Add position modal
  await page.evaluate(() => { if (typeof showAddPositionModal === 'function') showAddPositionModal(); });
  await page.waitForTimeout(800);
  await shot(page, 'add-position');
  await page.evaluate(() => { document.querySelectorAll('.modal-overlay').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); });
  await page.waitForTimeout(300);

  // 4. Watchlist
  await clickNav(page, 1);
  await shot(page, 'watchlist');

  // 5. Add to watchlist
  await page.evaluate(() => { if (typeof showAddWatchlistModal === 'function') showAddWatchlistModal(); });
  await page.waitForTimeout(800);
  await shot(page, 'add-watchlist');
  await page.evaluate(() => { document.querySelectorAll('.modal-overlay').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); });
  await page.waitForTimeout(300);

  // 6. Chart detail — navigate into it, wait for chart to render
  await page.evaluate(() => { if (typeof selectTicker === 'function') selectTicker('NVDA'); });
  await page.waitForTimeout(5000); // Extra time for chart + prices
  await shot(page, 'chart-detail');

  // 7. Options chain
  await page.evaluate(() => { if (typeof loadOptionsChain === 'function') loadOptionsChain('NVDA'); });
  await page.waitForTimeout(4000);
  await shot(page, 'options-chain');

  // Close chart detail
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
    if (typeof showPage === 'function') showPage('watchlist');
  });
  await page.waitForTimeout(500);

  // 8. Alerts
  await clickNav(page, 2);
  await shot(page, 'alerts');

  // 9. Transactions
  await clickNav(page, 3);
  await shot(page, 'transactions');

  // 10. News
  await clickNav(page, 4);
  await page.waitForTimeout(3500);
  await shot(page, 'news');

  // 11. Wallets — make sure we're on the wallets page, not a popup
  await clickNav(page, 5);
  await page.evaluate(() => {
    // Close any transaction modals
    document.querySelectorAll('.modal-overlay').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
  });
  await page.waitForTimeout(1000);
  await shot(page, 'wallets');

  // 12. Wallet tokens expanded
  await page.evaluate(() => {
    const btn = document.querySelector('button[onclick*="toggleWalletTokens"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(500);
  await shot(page, 'wallet-tokens');

  // 13. Settings
  await clickNav(page, 6);
  await page.waitForTimeout(1000);
  await shot(page, 'settings');

  await browser.close();
  console.log('\n🎉 All screenshots done!');
}

main().catch(e => { console.error(e); process.exit(1); });
