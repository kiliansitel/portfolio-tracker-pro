const { chromium } = require('playwright-core');
const path = require('path');
const BASE = 'http://localhost:8081';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
const CHROME_PATH = '/home/skynet/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const allConsoleErrors = {};

  const browser = await chromium.launch({
    executablePath: CHROME_PATH, headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    colorScheme: 'dark',
  });

  const page = await context.newPage();
  
  // Collect ALL console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const key = 'console';
      if (!allConsoleErrors[key]) allConsoleErrors[key] = [];
      allConsoleErrors[key].push(msg.text());
    }
  });
  page.on('pageerror', err => {
    if (!allConsoleErrors['pageerror']) allConsoleErrors['pageerror'] = [];
    allConsoleErrors['pageerror'].push(err.message);
  });
  page.on('dialog', async dialog => {
    console.log(`DIALOG: ${dialog.type()} "${dialog.message()}"`);
    await dialog.dismiss();
  });

  // Login
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-login.jpg'), type: 'jpeg', quality: 85 });
  await page.fill('input[type="text"]', 'demo');
  await page.fill('input[type="password"]', 'DemoPass123!');
  await page.click('button[type="submit"]');
  await sleep(3000);
  console.log('✅ Logged in');

  // Dashboard
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-dashboard.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ Dashboard screenshot');

  // Portfolio
  await page.click('.nav-item[data-page="portfolio"]');
  await sleep(2500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-portfolio.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ Portfolio screenshot');

  // Sort dropdown visible
  const sortSelect = await page.$('select');
  if (sortSelect) {
    // Focus it to show it clearly
    await sortSelect.focus();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-portfolio-sort.jpg'), type: 'jpeg', quality: 85 });
    console.log('✅ Portfolio sort screenshot');

    // Test all sort options
    const options = await sortSelect.$$eval('option', opts => opts.map(o => o.value));
    for (const val of options) {
      await sortSelect.selectOption(val);
      await sleep(300);
    }
    console.log(`✅ Sort: ${options.length} options tested`);
  }

  // Search
  const search = await page.$('input[placeholder*="earch"]');
  if (search) {
    await search.fill('BTC');
    await sleep(500);
    const body = await page.textContent('body');
    console.log(`✅ Search BTC: ${body.includes('BTC') ? 'found' : 'NOT FOUND'}`);
    await search.fill('');
    await sleep(300);
  }

  // Position detail: click position card, wait for chart
  console.log('\n--- Position Detail ---');
  const firstCard = await page.$('.position-card');
  if (firstCard) {
    const symbol = await firstCard.$eval('.position-symbol, .symbol', el => el.textContent).catch(() => 'unknown');
    console.log(`  Clicking position: ${symbol}`);
    await firstCard.click();
    await sleep(5000); // Wait for chart to load
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-position-detail.jpg'), type: 'jpeg', quality: 85 });
    console.log('✅ Position detail screenshot');
    
    // Look for edit/delete buttons in detail view
    const detailActions = await page.$$eval('button, .action-btn, [onclick]', els => 
      els.map(e => ({text: e.textContent?.trim().substring(0,30), onclick: e.getAttribute('onclick')?.substring(0,50)}))
      .filter(e => e.onclick?.includes('edit') || e.onclick?.includes('delete') || e.text?.includes('Edit') || e.text?.includes('Delete'))
    );
    console.log(`  Detail actions: ${JSON.stringify(detailActions)}`);
  }

  // Go back to portfolio
  await page.click('.nav-item[data-page="portfolio"]');
  await sleep(2000);

  // Edit: call editPosition directly via evaluate
  console.log('\n--- Edit Position ---');
  const posIds = await page.$$eval('.position-card', cards => {
    return cards.slice(0, 3).map(c => {
      const onclick = c.getAttribute('onclick') || '';
      const match = onclick.match(/\d+/);
      return match ? match[0] : null;
    }).filter(Boolean);
  });
  console.log(`  Position IDs from cards: ${posIds}`);
  
  // Try calling editPosition JS function
  try {
    await page.evaluate(() => {
      if (typeof editPosition === 'function') {
        // Get first position ID from DOM
        const cards = document.querySelectorAll('.position-card');
        if (cards.length > 0) {
          const onclick = cards[0].getAttribute('onclick');
          // Position cards may not have onclick for edit
        }
      }
    });
  } catch (e) {}

  // Check for swipe actions in DOM
  const swipeActions = await page.$$('.swipe-action');
  console.log(`  Swipe actions found: ${swipeActions.length}`);

  // Trigger edit via JavaScript (since it's a swipe action)
  const firstPosId = await page.evaluate(() => {
    const cards = document.querySelectorAll('.position-card');
    for (const card of cards) {
      const html = card.outerHTML;
      const match = html.match(/editPosition\((\d+)\)/);
      if (match) return match[1];
    }
    // Try getting from data attribute
    const firstCard = document.querySelector('.position-card[data-id]');
    return firstCard?.getAttribute('data-id') || null;
  });
  console.log(`  First position ID: ${firstPosId}`);

  if (firstPosId) {
    await page.evaluate((id) => { if (typeof editPosition === 'function') editPosition(id); }, parseInt(firstPosId));
    await sleep(1500);
    const modal = await page.$('.modal');
    if (modal) {
      console.log('✅ Edit position modal opened via JS');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-edit-position.jpg'), type: 'jpeg', quality: 85 });
      // Close it
      const closeBtn = await page.$('.modal .close-btn, .modal button:has-text("Cancel")');
      if (closeBtn) await closeBtn.click();
      else await page.evaluate(() => { document.querySelector('.modal').style.display = 'none'; });
      await sleep(500);
    } else {
      console.log('❌ Edit modal did not open');
    }

    // Delete confirm
    console.log('\n--- Delete Position ---');
    await page.evaluate((id) => { if (typeof deletePosition === 'function') deletePosition(id); }, parseInt(firstPosId));
    await sleep(1500);
    // Dialog handler already set up above - check log output
    console.log('  (Check DIALOG output above for confirm)');
  }

  // Watchlist
  console.log('\n--- Watchlist ---');
  await page.click('.nav-item[data-page="watchlist"]');
  await sleep(2500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-watchlist.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ Watchlist screenshot');

  // Watchlist sort
  const wlSort = await page.$('select');
  if (wlSort) {
    const opts = await wlSort.$$eval('option', os => os.map(o => o.value));
    for (const v of opts) {
      await wlSort.selectOption(v);
      await sleep(300);
    }
    console.log(`✅ Watchlist sort: ${opts.length} options`);
  }

  // Quick-add from watchlist
  const quickAddBtns = await page.$$('.add-to-portfolio-btn, [onclick*="quickAdd"], .quick-add');
  console.log(`  Quick-add buttons: ${quickAddBtns.length}`);
  // Try finding via evaluate
  const quickAddInfo = await page.evaluate(() => {
    const btns = document.querySelectorAll('[onclick*="quickAdd"], [onclick*="addToPortfolio"], .add-to-portfolio');
    return Array.from(btns).map(b => ({text: b.textContent.trim().substring(0,20), onclick: b.getAttribute('onclick')?.substring(0,60)}));
  });
  console.log(`  Quick-add from JS: ${JSON.stringify(quickAddInfo)}`);

  // Alerts
  console.log('\n--- Alerts ---');
  await page.click('.nav-item[data-page="alerts"]');
  await sleep(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-alerts.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ Alerts screenshot');

  // News
  console.log('\n--- News ---');
  await page.click('.nav-item[data-page="news"]');
  await sleep(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-news.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ News screenshot');

  // Transactions/History
  console.log('\n--- Transactions ---');
  await page.click('.nav-item[data-page="history"]');
  await sleep(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-transactions.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ Transactions screenshot');

  // Wallets
  console.log('\n--- Wallets ---');
  await page.click('.nav-item[data-page="wallets"]');
  await sleep(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-wallets.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ Wallets screenshot');

  // Settings
  console.log('\n--- Settings ---');
  await page.click('.nav-item[data-page="settings"]');
  await sleep(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-settings.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ Settings screenshot');

  // Remember last page
  console.log('\n--- Remember Last Page ---');
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await sleep(3000);
  const activePage = await page.$eval('.nav-item.active', el => el.getAttribute('data-page')).catch(() => 'unknown');
  console.log(`  Active after reload: ${activePage}`);
  if (activePage === 'settings') console.log('✅ Remember last page works');
  else console.log(`❌ Remember last page failed (got: ${activePage})`);

  // Empty state + skeleton check
  console.log('\n--- Empty State & Skeleton ---');
  const html = await page.content();
  console.log(`  empty-state in DOM: ${html.includes('empty-state')}`);
  console.log(`  skeleton in DOM: ${html.includes('skeleton')}`);
  console.log(`  shimmer in DOM: ${html.includes('shimmer')}`);

  // Session timeout check
  console.log('\n--- Session Timeout Logic ---');
  const hasSessionTimeout = html.includes('tokenExpiry') || html.includes('sessionTimeout') || 
    (html.includes('.exp') && html.includes('setTimeout'));
  const hasJWTDecode = html.includes('atob') && html.includes('exp');
  console.log(`  Session timeout logic: ${hasSessionTimeout}`);
  console.log(`  JWT decode + exp check: ${hasJWTDecode}`);

  // Add position modal screenshot
  console.log('\n--- Add Position Modal ---');
  await page.click('.nav-item[data-page="portfolio"]');
  await sleep(2000);
  const addBtn = await page.$('button:has-text("Add"), .fab, .add-btn, [onclick*="showAdd"]');
  if (addBtn) {
    await addBtn.click();
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-add-position.jpg'), type: 'jpeg', quality: 85 });
    console.log('✅ Add position modal screenshot');
    // Close
    const closeBtn = await page.$('.modal .close-btn, .modal button:has-text("Cancel"), button:has-text("×")');
    if (closeBtn) await closeBtn.click();
  } else {
    // Try floating action button or other selectors
    const fab = await page.$('.fab-btn, #addPositionBtn, [class*="add-position"]');
    if (fab) {
      await fab.click();
      await sleep(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-add-position.jpg'), type: 'jpeg', quality: 85 });
      console.log('✅ Add position modal screenshot (fab)');
    } else {
      console.log('❌ Add button not found');
    }
  }

  // Console errors summary
  console.log('\n\n=== ALL CONSOLE ERRORS ===');
  for (const [key, errors] of Object.entries(allConsoleErrors)) {
    console.log(`\n${key} (${errors.length}):`);
    // Deduplicate
    const unique = [...new Set(errors)];
    unique.forEach(e => console.log(`  ${e.substring(0, 250)}`));
  }

  await browser.close();
  console.log('\n✅ QA test complete');
})();
