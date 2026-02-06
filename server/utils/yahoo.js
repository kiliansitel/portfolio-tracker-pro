/**
 * Yahoo Finance API utilities
 * Shared price fetching with caching
 */

const https = require('https');

// Shared price cache
const priceCache = new Map();
const CACHE_TTL = 120000; // 2 minutes

async function fetchYahooPrice(symbol) {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.chart?.result?.[0];
          if (result) {
            const meta = result.meta;
            const price = meta.regularMarketPrice;
            const prev = meta.previousClose || meta.chartPreviousClose || price;
            const priceData = {
              symbol: meta.symbol,
              price: price,
              previousClose: prev,
              change: price - prev,
              changePercent: prev ? ((price - prev) / prev) * 100 : 0,
              timestamp: Date.now()
            };
            priceCache.set(symbol, { data: priceData, timestamp: Date.now() });
            resolve(priceData);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function fetchYahooChart(symbol, range = '1mo', interval = '1d') {
  const cacheKey = `chart_${symbol}_${range}_${interval}`;
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          priceCache.set(cacheKey, { data: json, timestamp: Date.now() });
          resolve(json);
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function fetchHistoricalPrice(symbol, dateStr) {
  const cacheKey = `hist_${symbol}_${dateStr}`;
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
    return cached.data;
  }
  
  return new Promise((resolve) => {
    const targetDate = new Date(dateStr);
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - 5);
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + 1);
    
    const period1 = Math.floor(startDate.getTime() / 1000);
    const period2 = Math.floor(endDate.getTime() / 1000);
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
    
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.chart?.result?.[0];
          if (result && result.timestamp && result.indicators?.quote?.[0]?.close) {
            const timestamps = result.timestamp;
            const closes = result.indicators.quote[0].close;
            
            const targetTs = targetDate.getTime() / 1000;
            let bestIdx = 0;
            let bestDiff = Math.abs(timestamps[0] - targetTs);
            for (let i = 1; i < timestamps.length; i++) {
              const diff = Math.abs(timestamps[i] - targetTs);
              if (diff < bestDiff) {
                bestDiff = diff;
                bestIdx = i;
              }
            }
            
            const price = closes[bestIdx];
            if (price) {
              priceCache.set(cacheKey, { data: price, timestamp: Date.now() });
              resolve(price);
            } else {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Clear cache entries (for memory management)
function clearCache() {
  const now = Date.now();
  for (const [key, val] of priceCache) {
    if (now - val.timestamp > 3600000) { // 1 hour
      priceCache.delete(key);
    }
  }
}

// Periodically clean cache
setInterval(clearCache, 300000); // Every 5 minutes

module.exports = {
  fetchYahooPrice,
  fetchYahooChart,
  fetchHistoricalPrice,
  priceCache,
  CACHE_TTL,
};
