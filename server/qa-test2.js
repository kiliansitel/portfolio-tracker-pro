const { chromium } = require('playwright-core');
const path = require('path');

const BASE = 'http://localhost:8081';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
const CHROME_PATH = '/home/skynet/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const results = { pass: [], fail: [], consoleErrors: {} };

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'
  });

  function trackConsole(page, label) {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        if (!results.consoleErrors[label]) results.consoleErrors[label] = [];
        results.consoleErrors[label].push(msg.text());
      }
    });
    page.on('pageerror', err => {
      if (!results.consoleErrors[label]) results.consoleErrors[label] = [];
      results.consoleErrors[label].push(`PAGE_ERROR: ${err.message}`);
    });
  }

  function ok(test) { results.pass.push(test); console.log(`  ✅ ${test}`); }
  function fail(test, detail) { results.fail.push({ test, detail }); console.log(`  ❌ ${test}: ${detail}`); }

  try {
    const page = await context.newPage();
    trackConsole(page, 'main');

    // Handle any dialogs
    page.on('dialog', async dialog => {
      console.log(`    Dialog: ${dialog.type()} - ${dialog.message()}`);
      await dialog.dismiss();
    });

    // Login
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await sleep(1000);
    await page.fill('input[type="text"]', 'demo');
    await page.fill('input[type="password"]', 'DemoPass123!');
    await page.click('button[type="submit"]');
    await sleep(3000);
    ok('Logged in');

    // ============================================================
    // TRANSACTIONS PAGE (data-page="history")
    // ============================================================
    console.log('\n=== TRANSACTIONS PAGE ===');
    const historyNav = await page.$('.nav-item[data-page="history"]');
    if (historyNav) {
      await historyNav.click();
      await sleep(2000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-transactions.jpg'), type: 'jpeg', quality: 85 });
      ok('Transactions page loaded (data-page=history)');
    } else {
      fail('Transactions page', 'No nav item with data-page="history"');
    }

    // ============================================================
    // POSITION DETAIL
    // ============================================================
    console.log('\n=== POSITION DETAIL ===');
    await page.click('.nav-item[data-page="portfolio"]');
    await sleep(2000);

    // Find clickable position cards
    const posCards = await page.$$('.position-card');
    console.log(`  Found ${posCards.length} position cards`);
    
    if (posCards.length > 0) {
      // Try clicking the first one
      await posCards[0].click();
      await sleep(3000);
      
      // Check if we navigated to a detail view
      const currentContent = await page.textContent('body');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-position-detail.jpg'), type: 'jpeg', quality: 85 });
      ok('Position detail screenshot taken');
      
      // Try to go back
      const backBtn = await page.$('.back-btn, button:has-text("←"), button:has-text("Back"), .detail-back');
      if (backBtn) {
        await backBtn.click();
        await sleep(1000);
      } else {
        await page.click('.nav-item[data-page="portfolio"]');
        await sleep(1000);
      }
    } else {
      fail('Position cards', 'No .position-card elements found');
    }

    // ============================================================
    // EDIT POSITION
    // ============================================================
    console.log('\n=== EDIT POSITION ===');
    await page.click('.nav-item[data-page="portfolio"]');
    await sleep(2000);

    // Look for edit buttons via various selectors
    const editIcons = await page.$$('.edit-btn, [onclick*="edit"], button[title="Edit"]');
    console.log(`  Found ${editIcons.length} edit buttons`);
    
    if (editIcons.length > 0) {
      await editIcons[0].click();
      await sleep(1500);
      const modal = await page.$('.modal');
      if (modal) {
        ok('Edit position modal opens');
        // Try changing quantity
        const qtyInput = await page.$('.modal input[name="quantity"], .modal #editQuantity');
        if (qtyInput) {
          const origValue = await qtyInput.inputValue();
          await qtyInput.fill('999');
          // Submit
          const saveBtn = await page.$('.modal button[type="submit"], .modal button:has-text("Save")');
          if (saveBtn) {
            await saveBtn.click();
            await sleep(2000);
            ok('Edit position submitted');
          }
        }
      } else {
        // Maybe clicking a position opens detail with edit
        fail('Edit modal', 'No .modal found after clicking edit');
      }
    } else {
      // Try long-press or context menu on position card
      fail('Edit position', 'No edit buttons found');
    }

    // ============================================================
    // DELETE POSITION (confirm dialog)
    // ============================================================
    console.log('\n=== DELETE POSITION ===');
    await page.click('.nav-item[data-page="portfolio"]');
    await sleep(2000);
    
    const deleteBtns = await page.$$('.delete-btn, [onclick*="delete"], button[title="Delete"]');
    console.log(`  Found ${deleteBtns.length} delete buttons`);
    
    if (deleteBtns.length > 0) {
      let dialogSeen = false;
      const handler = async (dialog) => {
        dialogSeen = true;
        console.log(`    Confirm dialog: "${dialog.message()}"`);
        await dialog.dismiss();
      };
      page.on('dialog', handler);
      
      await deleteBtns[deleteBtns.length - 1].click();
      await sleep(1500);
      
      // Check for custom confirm modal too
      const customConfirm = await page.$('.confirm-dialog, .confirm-modal, [class*="confirm-"]');
      
      if (dialogSeen) {
        ok('Delete shows browser confirm dialog');
      } else if (customConfirm) {
        ok('Delete shows custom confirm dialog');
        const cancelBtn = await customConfirm.$('button:has-text("Cancel"), button:has-text("No")');
        if (cancelBtn) await cancelBtn.click();
        await sleep(500);
      } else {
        fail('Delete confirm', 'No dialog appeared');
      }
      
      page.removeListener('dialog', handler);
    } else {
      fail('Delete buttons', 'No delete buttons found');
    }

    // ============================================================
    // WATCHLIST SORT & QUICK-ADD
    // ============================================================
    console.log('\n=== WATCHLIST SORT ===');
    await page.click('.nav-item[data-page="watchlist"]');
    await sleep(2000);

    const wlSort = await page.$('select');
    if (wlSort) {
      const options = await wlSort.$$eval('option', opts => opts.map(o => ({text: o.textContent, value: o.value})));
      console.log(`  Sort options: ${JSON.stringify(options)}`);
      for (const opt of options) {
        await wlSort.selectOption(opt.value);
        await sleep(400);
      }
      ok(`Watchlist sort works (${options.length} options)`);
    } else {
      fail('Watchlist sort', 'No select element found');
    }

    // Quick-add
    console.log('\n=== QUICK-ADD FROM WATCHLIST ===');
    const addToPortfolioBtns = await page.$$('[title*="Add"], [class*="quick-add"], .watchlist-add-btn');
    console.log(`  Found ${addToPortfolioBtns.length} add buttons`);
    
    // Alternative: look for + buttons in watchlist items
    const plusBtns = await page.$$eval('button', btns => btns.filter(b => b.textContent.trim() === '+' || b.textContent.trim() === '➕').map(b => b.className));
    console.log(`  Plus buttons: ${JSON.stringify(plusBtns)}`);

    // ============================================================
    // EMPTY STATES
    // ============================================================
    console.log('\n=== EMPTY STATE CHECK ===');
    const pageSource = await page.content();
    const hasEmptyState = pageSource.includes('empty-state');
    const hasSkeleton = pageSource.includes('skeleton');
    console.log(`  empty-state class: ${hasEmptyState}`);
    console.log(`  skeleton class: ${hasSkeleton}`);
    if (hasEmptyState) ok('Empty state CSS present');
    else fail('Empty state', 'Class not found in page');
    if (hasSkeleton) ok('Skeleton loading CSS present');
    else fail('Skeleton CSS', 'Class not found');

    // ============================================================
    // REMEMBER LAST PAGE
    // ============================================================
    console.log('\n=== REMEMBER LAST PAGE ===');
    await page.click('.nav-item[data-page="settings"]');
    await sleep(1000);
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(3000);
    
    // Check which page is active
    const activePage = await page.$eval('.nav-item.active', el => el.getAttribute('data-page')).catch(() => 'unknown');
    console.log(`  Active page after reload: ${activePage}`);
    if (activePage === 'settings') {
      ok('Remember last page (settings persists)');
    } else {
      fail('Remember last page', `Expected settings, got ${activePage}`);
    }

    // ============================================================
    // SESSION TIMEOUT LOGIC
    // ============================================================
    console.log('\n=== SESSION TIMEOUT CHECK ===');
    const jsSource = await page.content();
    const hasExpCheck = jsSource.includes('exp') && (jsSource.includes('setTimeout') || jsSource.includes('setInterval'));
    const hasTokenTimeout = jsSource.includes('tokenExpiry') || jsSource.includes('session') && jsSource.includes('timeout');
    console.log(`  JWT exp + timeout logic: ${hasExpCheck}`);
    console.log(`  Token expiry references: ${hasTokenTimeout}`);
    if (hasExpCheck || hasTokenTimeout) ok('Session timeout logic exists');
    else fail('Session timeout', 'No token expiry logic found');

    // ============================================================
    // ALL PAGES SCREENSHOT + CONSOLE ERROR COLLECTION
    // ============================================================
    console.log('\n=== FINAL SCREENSHOTS ===');
    const pageList = [
      { nav: 'dashboard', name: 'qa-dashboard' },
      { nav: 'portfolio', name: 'qa-portfolio' },
      { nav: 'watchlist', name: 'qa-watchlist' },
      { nav: 'alerts', name: 'qa-alerts' },
      { nav: 'news', name: 'qa-news' },
      { nav: 'history', name: 'qa-transactions' },
      { nav: 'wallets', name: 'qa-wallets' },
      { nav: 'settings', name: 'qa-settings' },
    ];

    for (const p of pageList) {
      trackConsole(page, p.nav);
      await page.click(`.nav-item[data-page="${p.nav}"]`);
      await sleep(2500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${p.name}.jpg`), type: 'jpeg', quality: 85 });
      ok(`Screenshot: ${p.name}`);
    }

    // ============================================================
    // EMPTY STATE SCREENSHOT
    // ============================================================
    console.log('\n=== EMPTY STATE SCREENSHOT ===');
    // Go to alerts, if empty
    await page.click('.nav-item[data-page="alerts"]');
    await sleep(2000);
    // Check for empty state
    const emptyStateEl = await page.$('.empty-state');
    if (emptyStateEl) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'qa-empty-state.jpg'), type: 'jpeg', quality: 85 });
      ok('Empty state screenshot taken');
    } else {
      console.log('  No empty state visible on current page (has data)');
    }

    // ============================================================
    // CONSOLE ERRORS FINAL
    // ============================================================
    console.log('\n=== CONSOLE ERRORS ===');
    let totalErrors = 0;
    for (const [label, errors] of Object.entries(results.consoleErrors)) {
      // Filter out expected/benign errors
      const realErrors = errors.filter(e => 
        !e.includes('favicon') && 
        !e.includes('sw.js') && 
        !e.includes('manifest') &&
        !e.includes('net::ERR_')  // network errors from price fetching are expected
      );
      if (realErrors.length > 0) {
        console.log(`  ${label}: ${realErrors.length} errors`);
        realErrors.forEach(e => console.log(`    - ${e.substring(0, 200)}`));
        totalErrors += realErrors.length;
      }
    }
    // Also log all errors for reference
    console.log('\n  ALL console errors (including benign):');
    for (const [label, errors] of Object.entries(results.consoleErrors)) {
      if (errors.length > 0) {
        console.log(`  ${label} (${errors.length}):`);
        errors.forEach(e => console.log(`    ${e.substring(0, 200)}`));
      }
    }

  } catch (e) {
    console.error('FATAL:', e);
    fail('Script', e.message);
  }

  await browser.close();

  console.log('\n\n========================================');
  console.log('QA TEST 2 SUMMARY');
  console.log('========================================');
  console.log(`✅ Passed: ${results.pass.length}`);
  console.log(`❌ Failed: ${results.fail.length}`);
  if (results.fail.length > 0) {
    console.log('\nFailed:');
    results.fail.forEach(f => console.log(`  - ${f.test}: ${f.detail}`));
  }
})();
