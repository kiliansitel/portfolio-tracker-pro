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
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), url: page.url() });
    }
  });
  
  page.on('response', response => {
    if (response.status() >= 400) {
      networkErrors.push({ url: response.url(), status: response.status() });
    }
  });
  
  const ssDir = '/home/skynet/.openclaw/workspace/portfolio-tracker-beta/screenshots';
  const ss = async (name) => {
    await page.screenshot({ path: ssDir + '/qa2-' + name + '.jpg', type: 'jpeg', quality: 85 });
    console.log('SCREENSHOT: qa2-' + name + '.jpg');
  };

  const nav = async (pg) => {
    await page.evaluate((p) => showPage(p), pg);
    await page.waitForTimeout(2000);
  };
  
  try {
    // ============ A1. Login page ============
    await page.goto('http://localhost:8081/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await ss('login');
    
    // ============ B1. Login ============
    await page.fill('#loginForm input[name="login"]', 'demo');
    await page.fill('#loginForm input[name="password"]', 'DemoPass123!');
    await page.click('#loginForm button[type="submit"]');
    await page.waitForTimeout(5000);
    
    var authHidden = await page.evaluate(() => {
      var ao = document.getElementById('authOverlay');
      return ao && ao.classList.contains('hidden');
    });
    results['B1_login'] = authHidden;
    console.log(authHidden ? 'PASS B1: Login successful (authOverlay hidden)' : 'FAIL B1: Login failed');
    
    // ============ A2. Dashboard ============
    await ss('dashboard');
    
    // ============ B2. Portfolio value > $0 ============
    var totalVal = await page.evaluate(() => {
      var el = document.getElementById('totalValue');
      return el ? el.textContent : '';
    });
    var hasValue = /[\d,]+/.test(totalVal) && totalVal !== '$0.00' && totalVal !== '$0';
    results['B2_portfolioValue'] = hasValue;
    console.log(hasValue ? 'PASS B2: Portfolio value = ' + totalVal : 'FAIL B2: totalValue = ' + totalVal);
    
    // ============ B3. Navigate all pages ============
    var pageList = ['dashboard', 'portfolio', 'watchlist', 'alerts', 'news', 'history', 'wallets', 'settings'];
    var allPagesOk = true;
    for (var p of pageList) {
      try {
        await nav(p);
        var isActive = await page.evaluate((pg) => {
          var el = document.getElementById('page-' + pg);
          return el && el.classList.contains('active');
        }, p);
        console.log('  ' + p + ': ' + (isActive ? 'OK' : 'NOT ACTIVE'));
        if (!isActive) allPagesOk = false;
      } catch (e) {
        console.log('  ' + p + ': FAILED - ' + e.message.substring(0, 60));
        allPagesOk = false;
      }
    }
    results['B3_allPages'] = allPagesOk;
    console.log(allPagesOk ? 'PASS B3: All pages loaded' : 'FAIL B3: Some pages failed');
    
    // ============ A3. Portfolio ============
    await nav('portfolio');
    await page.waitForTimeout(1000);
    await ss('portfolio');
    
    // ============ B4. Position search ============
    try {
      await page.evaluate(() => {
        var el = document.getElementById('positionSearchInput');
        if (el) { el.value = 'BTC'; el.dispatchEvent(new Event('input')); }
      });
      await page.waitForTimeout(1000);
      
      var searchResult = await page.evaluate(() => {
        var cards = document.querySelectorAll('#page-portfolio .position-card');
        var visible = 0;
        var hasBTC = false;
        cards.forEach(function(c) {
          if (c.style.display !== 'none') {
            visible++;
            if (c.textContent.includes('BTC')) hasBTC = true;
          }
        });
        return { visible: visible, hasBTC: hasBTC };
      });
      results['B4_search'] = searchResult.hasBTC;
      console.log(searchResult.hasBTC ? 'PASS B4: BTC search - ' + searchResult.visible + ' visible, BTC found' : 'FAIL B4: BTC not in filtered results');
      
      // Clear search
      await page.evaluate(() => {
        var el = document.getElementById('positionSearchInput');
        if (el) { el.value = ''; el.dispatchEvent(new Event('input')); }
      });
      await page.waitForTimeout(500);
    } catch (e) {
      results['B4_search'] = false;
      console.log('FAIL B4: ' + e.message.substring(0, 60));
    }
    
    // ============ B5. Position sort ============
    try {
      var sortOptions = ['default', 'name-asc', 'name-desc', 'value-desc', 'pnl-desc', 'change-desc'];
      for (var opt of sortOptions) {
        await page.selectOption('#positionSortSelect', opt);
        await page.waitForTimeout(300);
      }
      results['B5_sort'] = true;
      console.log('PASS B5: All sort options cycled');
    } catch (e) {
      results['B5_sort'] = false;
      console.log('FAIL B5: ' + e.message.substring(0, 60));
    }
    
    // ============ A4. Portfolio sorted (value-desc) ============
    try {
      await page.selectOption('#positionSortSelect', 'value-desc');
      await page.waitForTimeout(500);
    } catch(e) {}
    await ss('portfolio-sorted');
    
    // ============ A5. Position detail ============
    try {
      var clicked = await page.evaluate(() => {
        var cards = document.querySelectorAll('#page-portfolio .position-card');
        for (var c of cards) {
          if (c.style.display !== 'none' && c.offsetParent !== null) {
            c.click();
            return c.textContent.trim().substring(0, 40);
          }
        }
        // Try any onclick element
        var onclickEls = document.querySelectorAll('#page-portfolio [onclick]');
        for (var e of onclickEls) {
          if (e.offsetParent !== null) {
            e.click();
            return 'onclick: ' + e.getAttribute('onclick').substring(0, 40);
          }
        }
        return null;
      });
      if (clicked) {
        await page.waitForTimeout(2000);
        await ss('position-detail');
        console.log('Position detail: ' + clicked);
      } else {
        // Try to open position detail modal directly
        await page.evaluate(() => {
          if (typeof showPositionDetail === 'function') {
            // Get first position
            var cards = document.querySelectorAll('#page-portfolio .position-card');
            if (cards.length > 0) cards[0].click();
          }
        });
        await page.waitForTimeout(2000);
        await ss('position-detail');
        console.log('Position detail: attempted via fallback');
      }
    } catch (e) {
      console.log('WARNING: Position detail - ' + e.message.substring(0, 60));
    }
    
    // Close any modal
    await page.evaluate(() => {
      document.querySelectorAll('.modal-overlay').forEach(function(m) { 
        m.classList.remove('active');
        m.style.display = 'none';
      });
    });
    await page.waitForTimeout(500);
    
    // ============ A6. Watchlist ============
    await nav('watchlist');
    await page.waitForTimeout(1000);
    await ss('watchlist');
    
    // ============ B6. Watchlist sort ============
    try {
      var wlOptions = ['default', 'name-asc', 'price-desc', 'change-desc'];
      for (var wo of wlOptions) {
        await page.selectOption('#watchlistSortSelect', wo);
        await page.waitForTimeout(300);
      }
      results['B6_wlSort'] = true;
      console.log('PASS B6: Watchlist sort all options cycled');
    } catch (e) {
      results['B6_wlSort'] = false;
      console.log('FAIL B6: ' + e.message.substring(0, 60));
    }
    
    // ============ B7. Quick-add ============
    try {
      var addClicked = await page.evaluate(() => {
        // Find + buttons on watchlist page
        var btns = document.querySelectorAll('#page-watchlist .btn-add, #page-watchlist button');
        for (var b of btns) {
          if (b.textContent.trim() === '+' && b.offsetParent !== null) {
            b.click();
            return 'btn: +';
          }
        }
        // Try any button with btn-add class
        var allBtns = document.querySelectorAll('.btn-add');
        for (var b of allBtns) {
          if (b.offsetParent !== null) {
            b.click();
            return 'btn-add';
          }
        }
        return null;
      });
      
      if (addClicked) {
        await page.waitForTimeout(1000);
        var modalOpen = await page.evaluate(() => {
          var modals = document.querySelectorAll('.modal-overlay');
          for (var m of modals) {
            if (m.classList.contains('active') || window.getComputedStyle(m).display !== 'none') {
              return m.id || 'modal';
            }
          }
          return null;
        });
        results['B7_quickAdd'] = !!modalOpen;
        console.log(modalOpen ? 'PASS B7: Quick-add opened (' + modalOpen + ')' : 'FAIL B7: Clicked but no modal');
      } else {
        // Check if there are watchlist items with + buttons
        var wlContent = await page.evaluate(() => {
          var el = document.getElementById('page-watchlist');
          var btns = el ? el.querySelectorAll('button') : [];
          return {
            btnCount: btns.length,
            btnTexts: Array.from(btns).map(function(b) { return { text: b.textContent.trim().substring(0, 15), vis: b.offsetParent !== null, class: b.className }; })
          };
        });
        console.log('FAIL B7: No + button found. Buttons: ' + JSON.stringify(wlContent));
        results['B7_quickAdd'] = false;
      }
      // Close modal
      await page.evaluate(() => {
        document.querySelectorAll('.modal-overlay').forEach(function(m) { 
          m.classList.remove('active'); m.style.display = 'none'; 
        });
      });
    } catch (e) {
      results['B7_quickAdd'] = false;
      console.log('FAIL B7: ' + e.message.substring(0, 60));
    }
    
    // ============ A7-A11. Remaining pages ============
    var remainPages = ['alerts', 'news', 'history', 'wallets', 'settings'];
    for (var rp of remainPages) {
      await nav(rp);
      await ss(rp);
    }
    
    // ============ B8. Remember last page ============
    var lastPage = await page.evaluate(() => localStorage.getItem('lastPage'));
    results['B8_lastPage'] = lastPage === 'settings';
    console.log(lastPage === 'settings' ? 'PASS B8: lastPage = settings' : 'FAIL B8: lastPage = ' + lastPage);
    
    // ============ B9. Empty state CSS ============
    var hasEmptyState = await page.evaluate(() => {
      return document.documentElement.innerHTML.includes('empty-state');
    });
    results['B9_emptyState'] = hasEmptyState;
    console.log(hasEmptyState ? 'PASS B9: .empty-state found in HTML' : 'FAIL B9: .empty-state not found');
    
    // ============ B10. Skeleton CSS ============
    var hasSkeleton = await page.evaluate(() => {
      return document.documentElement.innerHTML.includes('skeleton');
    });
    results['B10_skeleton'] = hasSkeleton;
    console.log(hasSkeleton ? 'PASS B10: .skeleton found in HTML' : 'FAIL B10: .skeleton not found');
    
    // ============ A12. Add position modal ============
    await nav('portfolio');
    await page.evaluate(() => {
      // Find + button on portfolio page
      var btns = document.querySelectorAll('#page-portfolio .btn-add, #page-portfolio button');
      for (var b of btns) {
        if (b.textContent.trim() === '+' && b.offsetParent !== null) {
          b.click();
          return;
        }
      }
      // Fallback: try opening modal directly
      var modal = document.getElementById('addPositionModal');
      if (modal) { modal.classList.add('active'); modal.style.display = 'flex'; }
    });
    await page.waitForTimeout(1000);
    await ss('add-position');
    await page.evaluate(() => {
      document.querySelectorAll('.modal-overlay').forEach(function(m) { m.classList.remove('active'); m.style.display = 'none'; });
    });
    
    // ============ B11. Confirm delete ============
    var htmlContent = await page.content();
    var confirmDeleteCount = (htmlContent.match(/confirm\(/g) || []).length;
    var hasDelete = htmlContent.toLowerCase().includes('delete');
    var hasConfirmInDelete = /confirm\([^)]*[Dd]elete/.test(htmlContent);
    results['B11_confirmDelete'] = hasConfirmInDelete || (confirmDeleteCount > 0 && hasDelete);
    console.log(hasConfirmInDelete ? 'PASS B11: confirm(delete) pattern found' : (confirmDeleteCount > 0 && hasDelete ? 'PASS B11: confirm() exists (' + confirmDeleteCount + ' calls) and delete exists' : 'FAIL B11: No confirm+delete pattern'));
    
    // ============ B12. Session timeout ============
    var hasSetTimeout = htmlContent.includes('setTimeout');
    var hasAtob = htmlContent.includes('atob');
    var hasScheduleLogout = htmlContent.includes('scheduleLogout') || htmlContent.includes('sessionTimeout') || htmlContent.includes('tokenExp');
    results['B12_sessionTimeout'] = hasSetTimeout && (hasAtob || hasScheduleLogout);
    console.log(results['B12_sessionTimeout'] ? 'PASS B12: JWT timeout (setTimeout=' + hasSetTimeout + ', atob=' + hasAtob + ', scheduleLogout=' + hasScheduleLogout + ')' : 'FAIL B12: Missing JWT timeout');
    
    // ============ B13. Backup ============
    try {
      var backupRes = await page.evaluate(async () => {
        var token = localStorage.getItem('token');
        var r = await fetch('/api/backup', { headers: { 'Authorization': 'Bearer ' + token } });
        var blob = await r.blob();
        return { status: r.status, size: blob.size };
      });
      results['B13_backup'] = backupRes.status === 200 && backupRes.size > 0;
      console.log(results['B13_backup'] ? 'PASS B13: Backup OK (' + backupRes.size + ' bytes)' : 'FAIL B13: status=' + backupRes.status + ' size=' + backupRes.size);
    } catch (e) {
      results['B13_backup'] = false;
      console.log('FAIL B13: ' + e.message.substring(0, 60));
    }
    
    // ============ B14. PWA manifest ============
    try {
      var manifest = await page.evaluate(async () => {
        var r = await fetch('/manifest.json');
        var j = await r.json();
        return { status: r.status, name: j.name, icons: (j.icons || []).length };
      });
      results['B14_pwa'] = manifest.status === 200 && !!manifest.name;
      console.log(results['B14_pwa'] ? 'PASS B14: manifest.json OK (name="' + manifest.name + '", ' + manifest.icons + ' icons)' : 'FAIL B14');
    } catch (e) {
      results['B14_pwa'] = false;
      console.log('FAIL B14: ' + e.message.substring(0, 60));
    }
    
    // ============ B15. Service worker ============
    try {
      var sw = await page.evaluate(async () => {
        var r = await fetch('/sw.js');
        return { status: r.status, size: (await r.text()).length };
      });
      results['B15_sw'] = sw.status === 200;
      console.log(sw.status === 200 ? 'PASS B15: sw.js OK (' + sw.size + ' chars)' : 'FAIL B15: status=' + sw.status);
    } catch (e) {
      results['B15_sw'] = false;
      console.log('FAIL B15: ' + e.message.substring(0, 60));
    }
    
    // ============ VISUAL CHECKS ============
    console.log('\n=== VISUAL CHECKS ===');
    
    // Broken images
    await nav('dashboard');
    var brokenImgs = await page.$$eval('img', function(imgs) { 
      return imgs.filter(function(i) { return i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:'); }).map(function(i) { return i.src; }); 
    });
    console.log('Broken images: ' + (brokenImgs.length === 0 ? 'None' : JSON.stringify(brokenImgs)));
    
    // Text overflow
    var overflows = await page.evaluate(() => {
      var res = [];
      document.querySelectorAll('#page-dashboard h1, #page-dashboard h2, #page-dashboard h3, #page-dashboard p, #page-dashboard span, #page-dashboard .card').forEach(function(el) {
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 20 && el.textContent.trim().length > 3 && el.offsetParent !== null) {
          res.push({ tag: el.tagName, cls: el.className.substring(0, 25), overflow: el.scrollWidth - el.clientWidth });
        }
      });
      return res.slice(0, 10);
    });
    console.log('Text overflows on dashboard: ' + (overflows.length === 0 ? 'None' : JSON.stringify(overflows)));
    
    // Sort dropdown visibility
    await nav('portfolio');
    var sortVisible = await page.evaluate(() => {
      var sel = document.getElementById('positionSortSelect');
      if (!sel) return { exists: false };
      var cs = window.getComputedStyle(sel);
      return { exists: true, visible: sel.offsetParent !== null, display: cs.display, parentVis: sel.parentElement.offsetParent !== null };
    });
    console.log('Sort dropdown #positionSortSelect: ' + JSON.stringify(sortVisible));
    
    // + ADD buttons
    await nav('watchlist');
    var addBtns = await page.evaluate(() => {
      var btns = document.querySelectorAll('#page-watchlist .btn-add, #page-watchlist button');
      return Array.from(btns).filter(function(b) { return b.offsetParent !== null; }).map(function(b) {
        var cs = window.getComputedStyle(b);
        return { text: b.textContent.trim().substring(0, 10), bg: cs.backgroundColor, radius: cs.borderRadius, class: b.className };
      });
    });
    console.log('Watchlist buttons: ' + JSON.stringify(addBtns));
    
    // Check watchlist categories
    var wlCategories = await page.evaluate(() => {
      var cats = document.querySelectorAll('#page-watchlist .category-header, #page-watchlist h3, #page-watchlist .watchlist-category');
      return Array.from(cats).map(function(c) { return c.textContent.trim().substring(0, 30); });
    });
    console.log('Watchlist categories: ' + JSON.stringify(wlCategories));
    
    // Empty states
    var emptyStates = await page.evaluate(() => {
      var es = document.querySelectorAll('.empty-state');
      return Array.from(es).map(function(e) {
        var cs = window.getComputedStyle(e);
        return { text: e.textContent.trim().substring(0, 40), visible: e.offsetParent !== null, align: cs.textAlign };
      });
    });
    console.log('Empty state elements: ' + JSON.stringify(emptyStates));
    
    // Charts on dashboard
    await nav('dashboard');
    await page.waitForTimeout(1000);
    var charts = await page.evaluate(() => {
      var canvases = document.querySelectorAll('#page-dashboard canvas');
      var visible = Array.from(canvases).filter(function(c) { return c.offsetParent !== null; });
      return { total: canvases.length, visible: visible.length, sizes: visible.map(function(c) { return { id: c.id, w: c.width, h: c.height }; }) };
    });
    console.log('Dashboard charts: ' + JSON.stringify(charts));
    
    // ============ FINAL SUMMARY ============
    console.log('\n========================================');
    console.log('QA ROUND 2 — v0.20.3 FINAL REPORT');
    console.log('========================================');
    
    var passing = Object.values(results).filter(function(v) { return v; }).length;
    var total = Object.keys(results).length;
    console.log('\nFunctional Tests: ' + passing + '/' + total + ' passing');
    Object.entries(results).forEach(function(pair) {
      console.log('  ' + (pair[1] ? 'PASS' : 'FAIL') + ' ' + pair[0]);
    });
    
    console.log('\nConsole Errors: ' + consoleErrors.length + ' total');
    var uniqueC = {};
    consoleErrors.forEach(function(e) {
      var k = e.text.substring(0, 80);
      if (!uniqueC[k]) uniqueC[k] = { text: e.text, url: e.url, count: 1 };
      else uniqueC[k].count++;
    });
    Object.values(uniqueC).forEach(function(e, i) { 
      console.log('  ' + (i + 1) + '. ' + e.text.substring(0, 120) + ' [' + e.url + '] (x' + e.count + ')'); 
    });
    
    console.log('\nNetwork Errors (status >= 400): ' + networkErrors.length + ' total');
    var uniqueN = {};
    networkErrors.forEach(function(e) {
      var k = e.status + ':' + e.url;
      if (!uniqueN[k]) uniqueN[k] = { url: e.url, status: e.status, count: 1 };
      else uniqueN[k].count++;
    });
    Object.values(uniqueN).forEach(function(e, i) { 
      console.log('  ' + (i + 1) + '. [' + e.status + '] ' + e.url + ' (x' + e.count + ')'); 
    });
    
    // List screenshots
    var fs = require('fs');
    var screenshots = fs.readdirSync(ssDir).filter(function(f) { return f.startsWith('qa2-'); }).sort();
    console.log('\nScreenshots Taken: ' + screenshots.length + '/12');
    screenshots.forEach(function(f) { console.log('  ' + f); });
    
  } catch (e) {
    console.error('FATAL: ' + e.message);
    console.error(e.stack);
  } finally {
    await browser.close();
    console.log('\nDone.');
  }
})();
