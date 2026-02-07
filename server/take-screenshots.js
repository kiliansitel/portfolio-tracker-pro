const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:8081';
const DIR = path.join(__dirname, '..', 'screenshots');

async function shot(page, name) {
  await page.screenshot({ path: path.join(DIR, `${name}.jpg`), type: 'jpeg', quality: 92 });
  console.log(`✅ ${name}`);
}

function closeModals() {
  return `document.querySelectorAll('.modal-overlay').forEach(m => { m.classList.remove('show'); m.style.removeProperty('display'); });`;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })).newPage();
  
  // Login
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  await page.fill('#loginForm input[name="login"]', 'demo');
  await page.fill('#loginForm input[name="password"]', 'DemoPass123!');
  await page.click('#loginForm button[type="submit"]');
  await page.waitForTimeout(6000);

  // 1. Dashboard
  await shot(page, 'dashboard');

  // 2. Positions
  await page.evaluate(() => showPage('portfolio'));
  await page.waitForTimeout(3000);
  await shot(page, 'positions');

  // 3. Add Position modal
  await page.evaluate(() => showAddPositionModal());
  await page.waitForTimeout(1000);
  await shot(page, 'add-position');
  await page.evaluate(closeModals());
  await page.waitForTimeout(500);

  // 4. Watchlist
  await page.evaluate(() => showPage('watchlist'));
  await page.waitForTimeout(3000);
  await shot(page, 'watchlist');

  // 5. Add Watchlist modal
  await page.evaluate(() => showAddWatchlistModal());
  await page.waitForTimeout(1000);
  await shot(page, 'add-watchlist');
  await page.evaluate(closeModals());
  await page.waitForTimeout(500);

  // 6. Chart Detail - open it and DON'T close before screenshot
  await page.evaluate(() => openChartDetail('NVDA'));
  await page.waitForTimeout(6000);
  await shot(page, 'chart-detail');
  // NOW close it
  await page.evaluate(closeModals());
  await page.waitForTimeout(500);

  // 7. Options Chain - toggle it open inside chart detail
  await page.evaluate(() => openChartDetail('AAPL'));
  await page.waitForTimeout(3000);
  await page.evaluate(() => toggleOptionsChain());
  await page.waitForTimeout(5000);
  // Scroll down to show options chain
  await page.evaluate(() => {
    const section = document.getElementById('optionsChainSection');
    if (section) section.scrollIntoView({ behavior: 'instant' });
  });
  await page.waitForTimeout(500);
  await shot(page, 'options-chain');
  await page.evaluate(closeModals());
  await page.waitForTimeout(500);

  // 8. Alerts
  await page.evaluate(() => showPage('alerts'));
  await page.waitForTimeout(2500);
  await shot(page, 'alerts');

  // 9. Transactions
  await page.evaluate(() => showPage('history'));
  await page.waitForTimeout(2500);
  await shot(page, 'transactions');

  // 10. News
  await page.evaluate(() => showPage('news'));
  await page.waitForTimeout(4000);
  await shot(page, 'news');

  // 11. Wallets
  await page.evaluate(() => showPage('wallets'));
  await page.waitForTimeout(3000);
  await shot(page, 'wallets');

  // 12. Wallet Tokens - go to wallets page, wait for load, expand tokens
  await page.evaluate(() => showPage('wallets'));
  await page.waitForTimeout(2000);
  // Reload wallets to make sure data is fresh
  await page.evaluate(async () => {
    if (typeof loadWallets === 'function') await loadWallets();
  });
  await page.waitForTimeout(3000);
  // Try to find and click token toggle
  const hasTokenBtn = await page.evaluate(() => {
    const btn = document.querySelector('button[onclick*="toggleWalletTokens"]');
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log('Token toggle found:', hasTokenBtn);
  await page.waitForTimeout(1000);
  await shot(page, 'wallet-tokens');

  // 13. Settings
  await page.evaluate(() => showPage('settings'));
  await page.waitForTimeout(1500);
  await shot(page, 'settings');

  await browser.close();
  console.log('\n🎉 All done!');
}

main().catch(e => { console.error(e); process.exit(1); });
