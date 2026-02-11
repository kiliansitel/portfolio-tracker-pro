#!/usr/bin/env node
// README Screenshot automation for Portfolio Tracker Pro
// Takes high-quality screenshots for the GitHub README
// Usage: node screenshot-readme.js [username] [password] [base_url]

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const USERNAME = process.argv[2] || 'demo';
const PASSWORD = process.argv[3] || 'DemoPass123!';
const BASE_URL = process.argv[4] || 'http://192.168.20.6:8080';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Screenshot configs - wider for README readability
const MOBILE = { width: 430, height: 932, scale: 2 };
const DESKTOP = { width: 1280, height: 800, scale: 2 };

async function screenshot(page, name, opts = {}) {
    const fpath = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({ 
        path: fpath, 
        fullPage: false,
        ...(opts.clip ? { clip: opts.clip } : {})
    });
    const stats = fs.statSync(fpath);
    console.log(`  📸 ${name}.png (${(stats.size / 1024).toFixed(0)}KB)`);
    return fpath;
}

async function waitMs(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function login(page) {
    console.log(`\n🔑 Logging in as "${USERNAME}"...`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Clear SW cache
    await page.evaluate(async () => {
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) await r.unregister();
        }
        if (typeof caches !== 'undefined') {
            for (const n of await caches.keys()) await caches.delete(n);
        }
    });
    await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
    
    await page.waitForSelector('#loginForm input[name="login"]', { timeout: 10000 });
    await page.type('#loginForm input[name="login"]', USERNAME, { delay: 30 });
    await page.type('#loginForm input[name="password"]', PASSWORD, { delay: 30 });
    await page.click('#loginForm button[type="submit"]');
    
    await page.waitForFunction(() => {
        const overlay = document.querySelector('.auth-overlay');
        return overlay && overlay.classList.contains('hidden');
    }, { timeout: 15000 });
    
    console.log('  ✅ Logged in!');
    await waitMs(3000); // Let data load
}

async function navigateTo(page, pageName) {
    await page.click(`[data-page="${pageName}"]`);
    await waitMs(2000);
}

async function run() {
    console.log('🚀 Portfolio Tracker Pro — README Screenshot Generator');
    console.log(`   Target: ${BASE_URL}`);
    console.log(`   Output: ${SCREENSHOT_DIR}\n`);
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=430,932']
    });

    try {
        // ============================================
        // PHASE 1: ORACLE SCREENSHOTS (Mobile)
        // ============================================
        console.log('━━━ PHASE 1: Oracle AI Screenshots ━━━');
        
        const mobilePage = await browser.newPage();
        await mobilePage.setViewport({ width: MOBILE.width, height: MOBILE.height, deviceScaleFactor: MOBILE.scale });
        
        // Collect errors
        mobilePage.on('pageerror', err => console.log(`  ❌ ${err.message}`));
        mobilePage.on('requestfailed', req => {
            if (!req.url().includes('sw.js'))
                console.log(`  ⚠️ ${req.url().split('/').pop()} — ${req.failure()?.errorText}`);
        });
        
        await login(mobilePage);
        
        // 1a. Oracle welcome screen (with "Build My Portfolio" button)
        console.log('\n📸 Oracle welcome...');
        await navigateTo(mobilePage, 'ai');
        await waitMs(2000);
        
        // Make sure Build My Portfolio button is visible
        await mobilePage.evaluate(() => {
            const qa = document.getElementById('aiQuickActions');
            if (qa) qa.scrollLeft = 0;
        });
        await waitMs(500);
        await screenshot(mobilePage, 'oracle-welcome');
        
        // 1b. Oracle onboarding — Click "Build My Portfolio"
        console.log('\n📸 Oracle onboarding flow...');
        
        // Select OpenClaw as provider if not already
        await mobilePage.evaluate(() => {
            const cached = localStorage.getItem('aiProvider');
            if (cached !== 'openclaw') {
                localStorage.setItem('aiProvider', 'openclaw');
                localStorage.setItem('aiModel', '');
            }
        });
        
        // Click the Build My Portfolio button
        const buildBtn = await mobilePage.evaluateHandle(() => {
            const btns = document.querySelectorAll('.ai-quick-btn');
            for (const b of btns) {
                if (b.textContent.includes('Build My Portfolio')) return b;
            }
            return null;
        });
        
        if (buildBtn && buildBtn.asElement()) {
            await buildBtn.asElement().click();
            console.log('  Clicked "Build My Portfolio"...');
            
            // Wait for the user message to appear, then wait for streaming to start
            await waitMs(2000);
            await screenshot(mobilePage, 'oracle-onboarding-start');
            
            // Wait for AI to start streaming (typing dots → actual content)
            console.log('  Waiting for Oracle response...');
            try {
                await mobilePage.waitForFunction(() => {
                    const msgs = document.querySelectorAll('.ai-message.assistant .ai-message-bubble');
                    const lastMsg = msgs[msgs.length - 1];
                    if (!lastMsg) return false;
                    // Check if we have actual text content (not just typing dots)
                    return lastMsg.textContent.length > 50;
                }, { timeout: 30000 });
                
                // Take screenshot mid-stream (short delay for partial content)
                await waitMs(1500);
                await screenshot(mobilePage, 'oracle-streaming');
                
                // Wait for full response
                await mobilePage.waitForFunction(() => {
                    const msgs = document.querySelectorAll('.ai-message.assistant');
                    const lastMsg = msgs[msgs.length - 1];
                    return lastMsg && !lastMsg.dataset.streaming;
                }, { timeout: 60000 });
                
                await waitMs(1000);
                
                // Scroll to show the full response with action buttons
                await mobilePage.evaluate(() => {
                    const container = document.getElementById('aiMessages');
                    if (container) container.scrollTop = container.scrollHeight;
                });
                await waitMs(500);
                await screenshot(mobilePage, 'oracle-response-bottom');
                
                // Scroll up to show the beginning of the response
                await mobilePage.evaluate(() => {
                    const msgs = document.querySelectorAll('.ai-message.assistant');
                    if (msgs.length) msgs[msgs.length - 1].scrollIntoView({ block: 'start' });
                });
                await waitMs(500);
                await screenshot(mobilePage, 'oracle-response-top');
                
            } catch (e) {
                console.log(`  ⚠️ Oracle timeout: ${e.message}`);
                await screenshot(mobilePage, 'oracle-timeout');
            }
        } else {
            console.log('  ⚠️ Build My Portfolio button not found');
        }
        
        // ============================================
        // PHASE 2: OTHER MOBILE SCREENSHOTS 
        // ============================================
        console.log('\n━━━ PHASE 2: App Screenshots (Mobile) ━━━');
        
        // Dashboard
        console.log('\n📸 Dashboard...');
        await navigateTo(mobilePage, 'dashboard');
        await waitMs(3000);
        await screenshot(mobilePage, 'dashboard');
        
        // Scroll to allocation chart
        await mobilePage.evaluate(() => {
            const alloc = document.getElementById('allocationCard');
            if (alloc) alloc.scrollIntoView({ block: 'center' });
        });
        await waitMs(500);
        await screenshot(mobilePage, 'allocation');
        
        // Positions
        console.log('\n📸 Positions...');
        await navigateTo(mobilePage, 'portfolio');
        await waitMs(2000);
        await screenshot(mobilePage, 'positions');
        
        // Watchlist  
        console.log('\n📸 Watchlist...');
        await navigateTo(mobilePage, 'watchlist');
        await waitMs(2000);
        await screenshot(mobilePage, 'watchlist');
        
        // Watchlist dropdown
        console.log('\n📸 Watchlist dropdown...');
        const wlLabel = await mobilePage.$('#watchlistLabel');
        if (wlLabel) {
            await wlLabel.click();
            await waitMs(800);
            await screenshot(mobilePage, 'watchlist-dropdown');
            // Close it
            await mobilePage.click('body');
            await waitMs(300);
        }
        
        // Chart detail
        console.log('\n📸 Chart...');
        await navigateTo(mobilePage, 'dashboard');
        await waitMs(1000);
        // Click BTC in market grid
        await mobilePage.evaluate(() => {
            const items = document.querySelectorAll('.market-item');
            for (const item of items) {
                if (item.textContent.includes('Bitcoin') || item.textContent.includes('BTC')) {
                    item.click();
                    break;
                }
            }
        });
        await waitMs(3000);
        await screenshot(mobilePage, 'chart-detail');
        // Close modal
        await mobilePage.evaluate(() => {
            const btn = document.querySelector('#chartDetailModal .modal-close, [onclick*="closeChartDetail"]');
            if (btn) btn.click();
        });
        await waitMs(500);
        
        // Alerts
        console.log('\n📸 Alerts...');
        await navigateTo(mobilePage, 'alerts');
        await waitMs(2000);
        await screenshot(mobilePage, 'alerts');
        
        // News
        console.log('\n📸 News...');
        await navigateTo(mobilePage, 'news');
        await waitMs(3000);
        await screenshot(mobilePage, 'news');
        
        // Transactions (page name is "history")
        console.log('\n📸 Transactions...');
        await navigateTo(mobilePage, 'history');
        await waitMs(2000);
        await screenshot(mobilePage, 'transactions');
        
        // Settings
        console.log('\n📸 Settings...');
        await navigateTo(mobilePage, 'settings');
        await waitMs(1000);
        await screenshot(mobilePage, 'settings');
        
        // Login page (logout first)
        console.log('\n📸 Login page...');
        await mobilePage.evaluate(() => {
            localStorage.removeItem('token');
        });
        await mobilePage.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 15000 });
        await waitMs(1000);
        await screenshot(mobilePage, 'login');
        
        await mobilePage.close();
        
        // ============================================
        // PHASE 3: DESKTOP SCREENSHOTS
        // ============================================
        console.log('\n━━━ PHASE 3: Desktop Screenshots ━━━');
        
        const desktopPage = await browser.newPage();
        await desktopPage.setViewport({ width: DESKTOP.width, height: DESKTOP.height, deviceScaleFactor: DESKTOP.scale });
        desktopPage.on('pageerror', err => console.log(`  ❌ ${err.message}`));
        
        await login(desktopPage);
        
        // Dashboard wide
        console.log('\n📸 Dashboard (desktop)...');
        await navigateTo(desktopPage, 'dashboard');
        await waitMs(3000);
        await screenshot(desktopPage, 'dashboard-wide');
        
        // Oracle wide  
        console.log('\n📸 Oracle (desktop)...');
        await navigateTo(desktopPage, 'ai');
        await waitMs(2000);
        await screenshot(desktopPage, 'oracle-wide');
        
        await desktopPage.close();
        
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ All screenshots complete!');
        console.log(`📁 Output: ${SCREENSHOT_DIR}`);
        
    } catch (err) {
        console.error(`\n💥 Fatal error: ${err.message}`);
        console.error(err.stack);
    } finally {
        await browser.close();
    }
}

run().catch(console.error);
