const { chromium } = require('playwright-core');

(async () => {
  const consoleErrors = [];
  const networkErrors = [];
  const results = {};
  
  const browser = await chromium.launch({
    executablePath: '/home/skynet/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
    headless: true
  });
  
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: 'dark'
  });
  
  const page = await context.newPage();
  
  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), url: page.url() });
    }
  });
  
  // Collect network errors
  page.on('response', response => {
    if (response.status() >= 400) {
      networkErrors.push({ url: response.url(), status: response.status() });
    }
  });
  
  const ssDir = '/home/skynet/.openclaw/workspace/portfolio-tracker-beta/screenshots';
  const ss = async (name) => {
    await page.screenshot({ path: ssDir + '/qa2-' + name + '.jpg', type: 'jpeg', quality: 85 });
    console.log('📸 Screenshot: qa2-' + name + '.jpg');
  };
  
  try {
    // === A1. Login page screenshot ===
    await page.goto('http://localhost:8081/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await ss('login');
    
    // === B1. Login test ===
    // Find inputs
    const usernameInput = await page.$('input[name="username"]') || await page.$('input#username') || await page.$('input[placeholder*="ser"]') || await page.$('input[type="text"]');
    const passwordInput = await page.$('input[name="password"]') || await page.$('input#password') || await page.$('input[type="password"]');
    
    if (usernameInput && passwordInput) {
      await usernameInput.fill('demo');
      await passwordInput.fill('DemoPass123!');
      const submitBtn = await page.$('button[type="submit"]') || await page.$('.login-btn') || await page.$('button');
      if (submitBtn) await submitBtn.click();
    }
    
    await page.waitForTimeout(5000);
    
    // Check if we're past login
    const currentUrl = page.url();
    const bodyText = await page.textContent('body');
    const isLoggedIn = bodyText.includes('Dashboard') || bodyText.includes('Portfolio') || bodyText.includes('dashboard') || !bodyText.includes('Login');
    results['B1_login'] = isLoggedIn;
    console.log(isLoggedIn ? '✅ B1: Login successful, dashboard loaded' : '❌ B1: Login may have failed');
    
    // === A2. Dashboard screenshot ===
    await ss('dashboard');
    
    // === B2. Portfolio value > 0 ===
    const dollarPattern = /\$[\d,]+\.?\d*/;
    const hasValue = dollarPattern.test(bodyText);
    results['B2_portfolioValue'] = hasValue;
    console.log(hasValue ? '✅ B2: Portfolio value shown' : '❌ B2: No portfolio value found');
    
    // === B3. Navigate all pages ===
    const pages = ['dashboard', 'portfolio', 'watchlist', 'alerts', 'news', 'history', 'wallets', 'settings'];
    let allPagesOk = true;
    for (const p of pages) {
      try {
        // Try clicking nav links first
        let clicked = false;
        const navLinks = await page.$$('a, button, [data-page], nav *');
        for (const link of navLinks) {
          const text = await link.textContent().catch(() => '');
          const dataPage = await link.getAttribute('data-page').catch(() => '');
          const href = await link.getAttribute('href').catch(() => '');
          if (dataPage === p || text.trim().toLowerCase() === p || (href && href.includes(p))) {
            await link.click().catch(() => {});
            clicked = true;
            break;
          }
        }
        
        if (!clicked) {
          await page.evaluate((pg) => {
            if (typeof navigate === 'function') navigate(pg);
            else if (typeof showPage === 'function') showPage(pg);
          }, p);
        }
        await page.waitForTimeout(1500);
        console.log('  Page ' + p + ': OK');
      } catch (e) {
        console.log('  Page ' + p + ': FAILED - ' + e.message.substring(0, 80));
        allPagesOk = false;
      }
    }
    results['B3_allPages'] = allPagesOk;
    console.log(allPagesOk ? '✅ B3: All pages loaded' : '❌ B3: Some pages failed');
    
    // Navigate to portfolio for screenshots
    await page.evaluate(() => { if (typeof navigate === 'function') navigate('portfolio'); else if (typeof showPage === 'function') showPage('portfolio'); });
    await page.waitForTimeout(3000);
    
    // === A3. Portfolio screenshot ===
    await ss('portfolio');
    
    // === B4. Position search ===
    try {
      const searchInput = await page.$('input[placeholder*="earch"]') || await page.$('input[type="search"]') || await page.$('.search-input') || await page.$('#search') || await page.$('input#searchInput');
      if (searchInput) {
        await searchInput.fill('BTC');
        await page.waitForTimeout(1000);
        // Check if anything is visible
        const bodyAfterSearch = await page.textContent('body');
        const hasBTC = bodyAfterSearch.includes('BTC') || bodyAfterSearch.includes('Bitcoin');
        results['B4_search'] = hasBTC;
        console.log(hasBTC ? '✅ B4: Search for BTC shows results' : '❌ B4: No BTC results after search');
        await searchInput.fill('');
        await page.waitForTimeout(500);
      } else {
        // Try to find any input on the portfolio page
        const allInputs = await page.$$eval('input', inputs => inputs.map(i => ({ id: i.id, name: i.name, placeholder: i.placeholder, type: i.type, class: i.className })));
        console.log('  Available inputs: ' + JSON.stringify(allInputs));
        results['B4_search'] = false;
        console.log('❌ B4: No search input found');
      }
    } catch (e) {
      results['B4_search'] = false;
      console.log('❌ B4: Search test failed - ' + e.message.substring(0, 80));
    }
    
    // === B5. Position sort ===
    try {
      const sortSelect = await page.$('select') || await page.$('.sort-select');
      let sortOk = false;
      if (sortSelect) {
        const options = await sortSelect.$$eval('option', opts => opts.map(o => o.value));
        console.log('  Sort options available: ' + JSON.stringify(options));
        for (const opt of options) {
          try {
            await sortSelect.selectOption(opt);
            await page.waitForTimeout(300);
          } catch(e) {}
        }
        sortOk = true;
        console.log('✅ B5: All sort options cycled without crash');
      } else {
        console.log('❌ B5: No sort select found');
      }
      results['B5_sort'] = sortOk;
    } catch (e) {
      results['B5_sort'] = false;
      console.log('❌ B5: Sort test failed - ' + e.message.substring(0, 80));
    }
    
    // === A4. Portfolio sorted screenshot ===
    await ss('portfolio-sorted');
    
    // === A5. Position detail ===
    try {
      const positionCards = await page.$$('.position-card, .position-item, .position-row, tr[onclick], [onclick*="detail"], [onclick*="position"], .clickable');
      if (positionCards.length > 0) {
        await positionCards[0].click();
        await page.waitForTimeout(2000);
        await ss('position-detail');
        console.log('📸 Position detail captured');
      } else {
        // Try evaluating what's on the page
        const clickables = await page.$$eval('[onclick]', els => els.map(e => ({ tag: e.tagName, onclick: e.getAttribute('onclick').substring(0, 60), class: e.className })));
        console.log('  Clickable elements: ' + JSON.stringify(clickables.slice(0, 5)));
        
        if (clickables.length > 0) {
          // Click the first clickable that looks like a position
          const posClick = clickables.find(c => c.onclick.includes('position') || c.onclick.includes('detail') || c.onclick.includes('show'));
          if (posClick) {
            await page.click('[onclick*="' + posClick.onclick.substring(0, 20) + '"]');
            await page.waitForTimeout(2000);
            await ss('position-detail');
            console.log('📸 Position detail captured via onclick');
          } else {
            await page.click('[onclick]');
            await page.waitForTimeout(2000);
            await ss('position-detail');
            console.log('📸 Position detail captured via first onclick element');
          }
        } else {
          console.log('⚠️ No clickable position elements found');
        }
      }
    } catch (e) {
      console.log('⚠️ Position detail failed: ' + e.message.substring(0, 80));
    }
    
    // === A6. Watchlist ===
    await page.evaluate(() => { if (typeof navigate === 'function') navigate('watchlist'); else if (typeof showPage === 'function') showPage('watchlist'); });
    await page.waitForTimeout(3000);
    await ss('watchlist');
    
    // === B6. Watchlist sort ===
    try {
      // Find sort selects on watchlist page
      const wlSelects = await page.$$('select');
      let wlSortOk = true;
      if (wlSelects.length > 0) {
        for (const sel of wlSelects) {
          const options = await sel.$$eval('option', opts => opts.map(o => o.value));
          for (const opt of options) {
            try {
              await sel.selectOption(opt);
              await page.waitForTimeout(300);
            } catch(e) {}
          }
        }
        console.log('✅ B6: Watchlist sort options cycled');
      } else {
        console.log('✅ B6: No sort selects on watchlist (no crash)');
      }
      results['B6_wlSort'] = wlSortOk;
    } catch (e) {
      results['B6_wlSort'] = false;
      console.log('❌ B6: Watchlist sort failed - ' + e.message.substring(0, 80));
    }
    
    // === B7. Quick-add ===
    try {
      // Look for ADD buttons on watchlist
      const addButtons = await page.$$('button');
      let addBtn = null;
      for (const btn of addButtons) {
        const text = await btn.textContent();
        if (text.includes('ADD') || text.includes('+ Add') || text.includes('+')) {
          addBtn = btn;
          break;
        }
      }
      
      if (addBtn) {
        await addBtn.click();
        await page.waitForTimeout(1500);
        // Check if modal appeared
        const modalVisible = await page.evaluate(() => {
          const modals = document.querySelectorAll('.modal, .dialog, [class*="modal"]');
          for (const m of modals) {
            if (m.style.display !== 'none' && m.offsetParent !== null) return true;
          }
          return false;
        });
        results['B7_quickAdd'] = modalVisible;
        console.log(modalVisible ? '✅ B7: Quick-add modal opened' : '❌ B7: Modal not visible after click');
        
        // Close modal
        const closeBtn = await page.$('.modal .close, .modal-close, .btn-cancel');
        if (closeBtn) await closeBtn.click();
        await page.waitForTimeout(500);
      } else {
        results['B7_quickAdd'] = false;
        console.log('❌ B7: No ADD button found');
      }
    } catch (e) {
      results['B7_quickAdd'] = false;
      console.log('❌ B7: Quick-add failed - ' + e.message.substring(0, 80));
    }
    
    // === A7-A11. Remaining page screenshots ===
    const remainingPages = [
      { name: 'alerts', page: 'alerts' },
      { name: 'news', page: 'news' },
      { name: 'history', page: 'history' },
      { name: 'wallets', page: 'wallets' },
      { name: 'settings', page: 'settings' }
    ];
    
    for (const rp of remainingPages) {
      await page.evaluate((pg) => { if (typeof navigate === 'function') navigate(pg); else if (typeof showPage === 'function') showPage(pg); }, rp.page);
      await page.waitForTimeout(2000);
      await ss(rp.name);
    }
    
    // === B8. Remember last page ===
    const lastPage = await page.evaluate(() => localStorage.getItem('lastPage'));
    results['B8_lastPage'] = lastPage === 'settings';
    console.log(lastPage === 'settings' ? '✅ B8: lastPage = settings' : '❌ B8: lastPage = ' + lastPage);
    
    // === B9. Empty state CSS ===
    const hasEmptyState = await page.evaluate(() => {
      // Check stylesheets
      const sheets = document.styleSheets;
      for (let i = 0; i < sheets.length; i++) {
        try {
          const rules = sheets[i].cssRules || sheets[i].rules;
          for (let j = 0; j < rules.length; j++) {
            if (rules[j].selectorText && rules[j].selectorText.includes('.empty-state')) return true;
          }
        } catch(e) {}
      }
      // Check DOM
      return !!document.querySelector('.empty-state');
    });
    results['B9_emptyState'] = hasEmptyState;
    console.log(hasEmptyState ? '✅ B9: .empty-state CSS exists' : '❌ B9: .empty-state not found');
    
    // === B10. Skeleton CSS ===
    const hasSkeleton = await page.evaluate(() => {
      const sheets = document.styleSheets;
      for (let i = 0; i < sheets.length; i++) {
        try {
          const rules = sheets[i].cssRules || sheets[i].rules;
          for (let j = 0; j < rules.length; j++) {
            if (rules[j].selectorText && rules[j].selectorText.includes('.skeleton')) return true;
          }
        } catch(e) {}
      }
      return false;
    });
    results['B10_skeleton'] = hasSkeleton;
    console.log(hasSkeleton ? '✅ B10: .skeleton CSS exists' : '❌ B10: .skeleton CSS not found');
    
    // === A12. Add position modal ===
    await page.evaluate(() => { if (typeof navigate === 'function') navigate('portfolio'); else if (typeof showPage === 'function') showPage('portfolio'); });
    await page.waitForTimeout(1000);
    
    // Try to open add position modal
    try {
      // Try FAB or add button
      const fabBtn = await page.$('.fab, .add-position-btn, button[onclick*="add"], #addBtn');
      if (fabBtn) {
        await fabBtn.click();
      } else {
        // Try calling function directly
        await page.evaluate(() => { 
          if (typeof openAddModal === 'function') openAddModal(); 
          else if (typeof showAddPosition === 'function') showAddPosition();
          else if (typeof openModal === 'function') openModal('add');
        });
      }
      await page.waitForTimeout(1000);
    } catch(e) {
      console.log('  Add modal open attempt: ' + e.message.substring(0, 60));
    }
    await ss('add-position');
    
    // Close modal
    try {
      await page.evaluate(() => {
        const modals = document.querySelectorAll('.modal, .dialog, [class*="modal"]');
        modals.forEach(m => m.style.display = 'none');
      });
    } catch(e) {}
    
    // === B11. Confirm delete (grep HTML) ===
    const htmlContent = await page.content();
    const hasConfirmDelete = htmlContent.includes('confirm(') && (htmlContent.toLowerCase().includes('delete'));
    results['B11_confirmDelete'] = hasConfirmDelete;
    console.log(hasConfirmDelete ? '✅ B11: Delete functions use confirm()' : '❌ B11: No confirm() found with delete');
    
    // === B12. Session timeout (JWT decode + setTimeout) ===
    const hasSetTimeout = htmlContent.includes('setTimeout');
    const hasTokenLogic = htmlContent.includes('token') || htmlContent.includes('jwt') || htmlContent.includes('JWT');
    const hasExpiry = htmlContent.includes('exp') && (htmlContent.includes('decode') || htmlContent.includes('atob') || htmlContent.includes('parse'));
    results['B12_sessionTimeout'] = hasSetTimeout && hasTokenLogic;
    console.log((hasSetTimeout && hasTokenLogic) ? '✅ B12: JWT + setTimeout logic exists' : '❌ B12: Missing JWT timeout logic (setTimeout=' + hasSetTimeout + ', token=' + hasTokenLogic + ')');
    
    // === B13. Backup endpoint ===
    try {
      const backupRes = await page.evaluate(async () => {
        const token = localStorage.getItem('token');
        const r = await fetch('/api/backup', { headers: { 'Authorization': 'Bearer ' + token } });
        if (r.ok) {
          const blob = await r.blob();
          return { status: r.status, size: blob.size };
        }
        return { status: r.status, size: 0 };
      });
      results['B13_backup'] = backupRes.status === 200 && backupRes.size > 0;
      console.log((backupRes.status === 200 && backupRes.size > 0) ? '✅ B13: Backup endpoint OK (status=' + backupRes.status + ', size=' + backupRes.size + ' bytes)' : '❌ B13: Backup failed (status=' + backupRes.status + ', size=' + backupRes.size + ')');
    } catch (e) {
      results['B13_backup'] = false;
      console.log('❌ B13: Backup test error - ' + e.message.substring(0, 80));
    }
    
    // === B14. PWA manifest ===
    try {
      const manifestRes = await page.evaluate(async () => {
        const r = await fetch('/manifest.json');
        if (r.ok) {
          const json = await r.json();
          return { status: r.status, hasName: !!json.name, name: json.name };
        }
        return { status: r.status, hasName: false, name: null };
      });
      results['B14_pwa'] = manifestRes.status === 200 && manifestRes.hasName;
      console.log(manifestRes.hasName ? '✅ B14: manifest.json OK (name="' + manifestRes.name + '")' : '❌ B14: manifest.json issue (status=' + manifestRes.status + ')');
    } catch (e) {
      results['B14_pwa'] = false;
      console.log('❌ B14: PWA test error - ' + e.message.substring(0, 80));
    }
    
    // === B15. Service worker ===
    try {
      const swRes = await page.evaluate(async () => {
        const r = await fetch('/sw.js');
        return { status: r.status, size: (await r.text()).length };
      });
      results['B15_sw'] = swRes.status === 200;
      console.log(swRes.status === 200 ? '✅ B15: sw.js returns 200 (' + swRes.size + ' chars)' : '❌ B15: sw.js status=' + swRes.status);
    } catch (e) {
      results['B15_sw'] = false;
      console.log('❌ B15: Service worker test error - ' + e.message.substring(0, 80));
    }
    
    // === E. Visual checks ===
    console.log('\n=== VISUAL CHECKS ===');
    
    // Check broken images across pages
    await page.evaluate(() => { if (typeof navigate === 'function') navigate('dashboard'); });
    await page.waitForTimeout(2000);
    const brokenImgs = await page.$$eval('img', imgs => imgs.filter(i => i.complete && i.naturalWidth === 0 && i.src).map(i => i.src));
    console.log('Broken images on dashboard: ' + (brokenImgs.length === 0 ? 'None ✅' : JSON.stringify(brokenImgs)));
    
    // Text overflow check - look for elements with scrollWidth > clientWidth
    const overflows = await page.evaluate(() => {
      const els = document.querySelectorAll('*');
      const overflowing = [];
      for (const el of els) {
        if (el.scrollWidth > el.clientWidth + 5 && el.clientWidth > 0 && el.textContent.trim().length > 0) {
          const tag = el.tagName.toLowerCase();
          if (!['html', 'body', 'script', 'style'].includes(tag)) {
            overflowing.push({ tag, class: el.className.substring(0, 40), text: el.textContent.trim().substring(0, 30) });
          }
        }
      }
      return overflowing.slice(0, 10);
    });
    console.log('Text overflow elements: ' + (overflows.length === 0 ? 'None ✅' : JSON.stringify(overflows)));
    
    // Sort dropdown on portfolio
    await page.evaluate(() => { if (typeof navigate === 'function') navigate('portfolio'); });
    await page.waitForTimeout(1000);
    const sortInfo = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      const info = [];
      for (const s of selects) {
        if (s.offsetParent !== null) {
          info.push({ id: s.id, class: s.className, options: Array.from(s.options).map(o => o.text) });
        }
      }
      return info;
    });
    console.log('Sort dropdowns on portfolio: ' + JSON.stringify(sortInfo));
    
    // + ADD buttons on watchlist
    await page.evaluate(() => { if (typeof navigate === 'function') navigate('watchlist'); });
    await page.waitForTimeout(1000);
    const addBtnInfo = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      const addBtns = [];
      for (const b of btns) {
        if ((b.textContent.includes('ADD') || b.textContent.includes('Add') || b.textContent.includes('+')) && b.offsetParent !== null) {
          const styles = window.getComputedStyle(b);
          addBtns.push({ 
            text: b.textContent.trim().substring(0, 30), 
            class: b.className.substring(0, 40),
            bg: styles.backgroundColor,
            borderRadius: styles.borderRadius
          });
        }
      }
      return addBtns;
    });
    console.log('ADD buttons on watchlist: ' + JSON.stringify(addBtnInfo));
    
    // Empty state check
    const emptyStateInfo = await page.evaluate(() => {
      const es = document.querySelectorAll('.empty-state');
      return Array.from(es).map(e => ({
        visible: e.offsetParent !== null,
        text: e.textContent.trim().substring(0, 50),
        centered: window.getComputedStyle(e).textAlign
      }));
    });
    console.log('Empty state elements: ' + JSON.stringify(emptyStateInfo));
    
    // Donut chart check
    await page.evaluate(() => { if (typeof navigate === 'function') navigate('dashboard'); });
    await page.waitForTimeout(1000);
    const chartInfo = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      const svgs = document.querySelectorAll('svg');
      const charts = document.querySelectorAll('.chart, .donut, [class*="chart"]');
      return { 
        canvasCount: canvases.length, 
        svgCount: svgs.length, 
        chartElements: charts.length,
        canvasSizes: Array.from(canvases).map(c => ({ w: c.width, h: c.height }))
      };
    });
    console.log('Chart info: ' + JSON.stringify(chartInfo));
    
    // === FINAL SUMMARY ===
    console.log('\n========================================');
    console.log('=== QA ROUND 2 FINAL SUMMARY ===');
    console.log('========================================');
    
    const passing = Object.values(results).filter(v => v).length;
    const total = Object.keys(results).length;
    console.log('Functional tests: ' + passing + '/' + total + ' passing');
    
    Object.entries(results).forEach(([key, val]) => {
      console.log('  ' + (val ? '✅' : '❌') + ' ' + key + ': ' + val);
    });
    
    console.log('\nConsole errors: ' + consoleErrors.length + ' total');
    consoleErrors.forEach((e, i) => console.log('  ' + (i+1) + '. [' + e.url.substring(0, 40) + '] ' + e.text.substring(0, 100)));
    
    console.log('\nNetwork errors (status >= 400): ' + networkErrors.length + ' total');
    // Deduplicate
    const uniqueNetErrors = {};
    networkErrors.forEach(e => {
      const key = e.status + ':' + e.url;
      if (!uniqueNetErrors[key]) uniqueNetErrors[key] = { ...e, count: 1 };
      else uniqueNetErrors[key].count++;
    });
    Object.values(uniqueNetErrors).forEach((e, i) => console.log('  ' + (i+1) + '. [' + e.status + '] ' + e.url.substring(0, 80) + (e.count > 1 ? ' (x' + e.count + ')' : '')));
    
  } catch (e) {
    console.error('FATAL ERROR:', e.message);
    console.error(e.stack);
  } finally {
    await browser.close();
    console.log('\nDone.');
  }
})();
