const pw = require('playwright-core');
const SS = '/home/skynet/.openclaw/workspace/portfolio-tracker-beta/qa-screenshots';

(async () => {
  const b = await pw.chromium.launch({
    executablePath: '/home/skynet/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  // Mobile
  let ctx = await b.newContext({ viewport: { width: 375, height: 812 } });
  let p = await ctx.newPage();
  await p.goto('http://192.168.20.6:8081', { timeout: 10000, waitUntil: 'networkidle' });
  await p.fill('#loginForm input[name="login"]', 'demo');
  await p.fill('#loginForm input[name="password"]', 'DemoPass123!');
  await p.click('#loginForm button[type="submit"]');
  await p.waitForTimeout(2500);

  await p.click('[data-page="ai"]');
  await p.waitForTimeout(1000);
  
  // Check input bar position
  const inputInfo = await p.evaluate(() => {
    const bar = document.querySelector('.ai-input-bar');
    const btn = document.querySelector('.ai-send-btn');
    return {
      bar: bar ? bar.getBoundingClientRect() : null,
      btn: btn ? btn.getBoundingClientRect() : null,
      vh: window.innerHeight
    };
  });
  console.log('Input bar bottom:', inputInfo.bar?.bottom, 'Viewport:', inputInfo.vh, 
    inputInfo.bar?.bottom <= inputInfo.vh ? '✅ FITS' : '❌ CLIPPED');

  await p.screenshot({ path: `${SS}/v3-mobile-oracle.jpg`, type: 'jpeg', quality: 85 });
  console.log('✅ mobile oracle');

  // Desktop
  await ctx.close();
  ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  p = await ctx.newPage();
  await p.goto('http://192.168.20.6:8081', { timeout: 10000, waitUntil: 'networkidle' });
  await p.fill('#loginForm input[name="login"]', 'demo');
  await p.fill('#loginForm input[name="password"]', 'DemoPass123!');
  await p.click('#loginForm button[type="submit"]');
  await p.waitForTimeout(2500);
  
  // Desktop dashboard
  await p.screenshot({ path: `${SS}/v3-desktop-dashboard.jpg`, type: 'jpeg', quality: 85 });
  console.log('✅ desktop dashboard');
  
  // Desktop Oracle
  await p.click('[data-page="ai"]');
  await p.waitForTimeout(1000);
  await p.screenshot({ path: `${SS}/v3-desktop-oracle.jpg`, type: 'jpeg', quality: 85 });
  console.log('✅ desktop oracle');

  // Desktop positions
  await p.click('[data-page="portfolio"]');
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${SS}/v3-desktop-portfolio.jpg`, type: 'jpeg', quality: 85 });
  console.log('✅ desktop portfolio');

  await b.close();
  console.log('Done!');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
