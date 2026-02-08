const { chromium } = require('playwright-core');
const path = require('path');
const BASE = 'http://localhost:8081';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
const CHROME_PATH = '/home/skynet/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const allConsoleErrors = [];
  const allPageErrors = [];

  const browser = await chromium.launch({
    executablePath: CHROME_PATH, headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    colorScheme: 'dark',
  });

  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  
  page.on('console', msg => {
    if (msg.type() === 'error') allConsoleErrors.push(msg.text());
  });
  page.on('pageerror', err => allPageErrors.push(err.message));
  
  let dialogLog = [];
  page.on('dialog', async dialog => {
    dialogLog.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss();
  });

  async function closeModals() {
    // Close any open modals
    await page.evaluate(() => {
      document.querySelectorAll('.modal-overlay.show, .modal.show').forEach(m => {
        m.classList.remove('show');
        m.style.display = 'none';
      });
    });
    await sleep(300);
  }

  async function nav(pageName) {
    await closeModals();
    await page.click(`.nav-item[data-page="${pageName}"]`, { timeout: 5000 });
    await sleep(2500);
  }

  // Login
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-login.jpg'), type: 'jpeg', quality: 85 });
  await page.fill('input[type="text"]', 'demo');
  await page.fill('input[type="password"]', 'DemoPass123!');
  await page.click('button[type="submit"]');
  await sleep(3000);
  console.log('✅ Logged in');

  // DASHBOARD
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-dashboard.jpg'), type: 'jpeg', quality: 85 });
  const dashBody = await page.textContent('body');
  console.log(`✅ Dashboard — has portfolio value: ${dashBody.includes('$') || dashBody.includes('€')}`);

  // PORTFOLIO
  await nav('portfolio');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-portfolio.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ Portfolio page');

  // Sort
  const sortSel = await page.$('select');
  if (sortSel) {
    const opts = await sortSel.$$eval('option', os => os.map(o => ({t: o.textContent, v: o.value})));
    console.log(`  Sort options: ${opts.map(o => o.t).join(', ')}`);
    for (const o of opts) { await sortSel.selectOption(o.v); await sleep(300); }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-portfolio-sort.jpg'), type: 'jpeg', quality: 85 });
    console.log('✅ Sort tested');
  }

  // Search
  const searchInp = await page.$('input[placeholder*="earch"]');
  if (searchInp) {
    await searchInp.fill('BTC');
    await sleep(800);
    const filtered = await page.$$('.position-card');
    console.log(`✅ Search "BTC" → ${filtered.length} cards visible`);
    await searchInp.fill('');
    await sleep(300);
  }

  // Position detail
  const cards = await page.$$('.position-card');
  console.log(`  ${cards.length} position cards`);
  if (cards.length > 0) {
    await cards[0].click();
    await sleep(5000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-position-detail.jpg'), type: 'jpeg', quality: 85 });
    console.log('✅ Position detail screenshot');
    await closeModals();
  }

  // Edit position via JS
  await nav('portfolio');
  const posId = await page.evaluate(() => {
    const el = document.querySelector('[onclick*="editPosition"]');
    if (!el) return null;
    const m = el.getAttribute('onclick').match(/editPosition\((\d+)\)/);
    return m ? parseInt(m[1]) : null;
  });
  console.log(`  Edit position ID: ${posId}`);
  if (posId) {
    await page.evaluate(id => editPosition(id), posId);
    await sleep(1500);
    const modal = await page.$('.modal-overlay.show, .modal.show');
    if (modal) {
      console.log('✅ Edit position modal opens');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-edit-position.jpg'), type: 'jpeg', quality: 85 });
      await closeModals();
    } else {
      console.log('❌ Edit modal not found');
    }
  }

  // Delete position (confirm dialog test)
  dialogLog = [];
  if (posId) {
    await page.evaluate(id => deletePosition(id), posId);
    await sleep(1500);
    if (dialogLog.length > 0) {
      console.log(`✅ Delete confirm dialog: ${dialogLog[dialogLog.length - 1]}`);
    } else {
      // Check for custom confirm
      const customConfirm = await page.$('.confirm-dialog, .confirm-modal');
      if (customConfirm) {
        console.log('✅ Delete custom confirm dialog shown');
        const cancelBtn = await customConfirm.$('button:has-text("Cancel")');
        if (cancelBtn) await cancelBtn.click();
      } else {
        console.log('❌ No delete confirm dialog');
      }
    }
  }
  await closeModals();

  // Add position
  await nav('portfolio');
  const addBtn = await page.$('[onclick*="showAdd"], .add-btn, button:has-text("Add Position"), #addPositionBtn');
  if (!addBtn) {
    // Try evaluate
    const hasShowAdd = await page.evaluate(() => typeof showAddPositionModal === 'function' || typeof showAddModal === 'function');
    console.log(`  showAddPositionModal exists: ${hasShowAdd}`);
    await page.evaluate(() => {
      if (typeof showAddPositionModal === 'function') showAddPositionModal();
      else if (typeof showAddModal === 'function') showAddModal();
    }).catch(() => {});
  } else {
    await addBtn.click();
  }
  await sleep(1000);
  const addModal = await page.$('.modal-overlay.show, .modal.show');
  if (addModal) {
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-add-position.jpg'), type: 'jpeg', quality: 85 });
    console.log('✅ Add position modal');
    await closeModals();
  } else {
    console.log('❌ Add position modal not found');
  }

  // WATCHLIST
  await nav('watchlist');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-watchlist.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ Watchlist page');

  // Watchlist sort
  const wlSort = await page.$('select');
  if (wlSort) {
    const wlOpts = await wlSort.$$eval('option', os => os.map(o => ({t: o.textContent, v: o.value})));
    console.log(`  Watchlist sort options: ${wlOpts.map(o => o.t).join(', ')}`);
    for (const o of wlOpts) { await wlSort.selectOption(o.v); await sleep(300); }
    console.log('✅ Watchlist sort tested');
  }

  // Quick-add from watchlist
  const quickAddBtns = await page.$$('[onclick*="quickAdd"], [onclick*="addToPortfolio"]');
  console.log(`  Quick-add buttons: ${quickAddBtns.length}`);
  if (quickAddBtns.length > 0) {
    await quickAddBtns[0].click();
    await sleep(1000);
    const modal = await page.$('.modal-overlay.show, .modal.show');
    if (modal) {
      const symbolVal = await page.evaluate(() => {
        const inp = document.querySelector('.modal input[name="symbol"], .modal #symbol, .modal input[type="text"]');
        return inp ? inp.value : null;
      });
      console.log(`✅ Quick-add modal — symbol pre-filled: "${symbolVal}"`);
      await closeModals();
    } else {
      console.log('❌ Quick-add modal not opened');
    }
  } else {
    console.log('⚠️ No quick-add buttons found in watchlist');
  }

  // ALERTS
  await nav('alerts');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-alerts.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ Alerts page');

  // NEWS
  await nav('news');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-news.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ News page');

  // TRANSACTIONS/HISTORY
  await nav('history');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-transactions.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ Transactions page');

  // WALLETS
  await nav('wallets');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-wallets.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ Wallets page');

  // SETTINGS
  await nav('settings');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-settings.jpg'), type: 'jpeg', quality: 85 });
  console.log('✅ Settings page');

  // REMEMBER LAST PAGE
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await sleep(3000);
  const activeAfter = await page.$eval('.nav-item.active', el => el.getAttribute('data-page')).catch(() => 'unknown');
  console.log(`  Active after reload: ${activeAfter}`);
  console.log(activeAfter === 'settings' ? '✅ Remember last page works' : `❌ Remember last page — got: ${activeAfter}`);

  // EMPTY STATE + SKELETON + SESSION TIMEOUT
  const html = await page.content();
  console.log(`\n--- CSS/Logic Checks ---`);
  console.log(`  empty-state class: ${html.includes('empty-state') ? '✅' : '❌'}`);
  console.log(`  skeleton class: ${html.includes('skeleton') ? '✅' : '❌'}`);
  console.log(`  shimmer class: ${html.includes('shimmer') ? '✅' : '❌'}`);
  
  // Session timeout
  const hasTokenExpiryLogic = html.includes('tokenExpiry') || html.includes('checkTokenExpiry') || 
    (html.includes('exp') && html.includes('atob') && html.includes('setTimeout'));
  console.log(`  Session timeout logic: ${hasTokenExpiryLogic ? '✅' : '❌'}`);

  // CONSOLE ERRORS
  console.log(`\n=== CONSOLE ERRORS (${allConsoleErrors.length}) ===`);
  const unique = [...new Set(allConsoleErrors)];
  unique.forEach(e => console.log(`  ${e.substring(0, 250)}`));
  
  console.log(`\n=== PAGE ERRORS (${allPageErrors.length}) ===`);
  const uniqueP = [...new Set(allPageErrors)];
  uniqueP.forEach(e => console.log(`  ${e.substring(0, 250)}`));

  await browser.close();
  console.log('\n✅ QA complete');
})();
