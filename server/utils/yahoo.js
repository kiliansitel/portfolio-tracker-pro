/**
 * Yahoo Finance API utilities
 * Shared price fetching with caching
 */

const https = require('https');

// Shared price cache
const priceCache = new Map();
const CACHE_TTL = 120000; // 2 minutes

// Yahoo crumb for authenticated endpoints (v7 quote)
let _yahooCrumb = null;
let _yahooCookies = null;
let _crumbTimestamp = 0;
const _CRUMB_TTL = 3600000; // 1 hour

async function _getYahooCrumb() {
  if (_yahooCrumb && Date.now() - _crumbTimestamp < _CRUMB_TTL) {
    return { crumb: _yahooCrumb, cookies: _yahooCookies };
  }
  return new Promise((resolve) => {
    https.get('https://fc.yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, (res) => {
      const cookies = res.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || '';
      https.get('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Cookie': cookies }
      }, (crumbRes) => {
        let crumb = '';
        crumbRes.on('data', chunk => crumb += chunk);
        crumbRes.on('end', () => {
          _yahooCrumb = crumb;
          _yahooCookies = cookies;
          _crumbTimestamp = Date.now();
          resolve({ crumb, cookies });
        });
      }).on('error', () => resolve({ crumb: null, cookies: null }));
    }).on('error', () => resolve({ crumb: null, cookies: null }));
  });
}

// Fetch extended hours data via v7/finance/quote (needs crumb)
async function _fetchExtendedHours(symbol) {
  const { crumb, cookies } = await _getYahooCrumb();
  if (!crumb) return null;
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&crumb=${encodeURIComponent(crumb)}`;
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Cookie': cookies },
      timeout: 8000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const q = json.quoteResponse?.result?.[0];
          if (!q) return resolve(null);
          const ext = {};
          if (q.marketState) ext.marketState = q.marketState;
          if (q.preMarketPrice) {
            ext.preMarketPrice = q.preMarketPrice;
            ext.preMarketChange = q.preMarketChange || 0;
            ext.preMarketChangePercent = q.preMarketChangePercent || 0;
            ext.preMarketTime = q.preMarketTime || null;
          }
          if (q.postMarketPrice) {
            ext.postMarketPrice = q.postMarketPrice;
            ext.postMarketChange = q.postMarketChange || 0;
            ext.postMarketChangePercent = q.postMarketChangePercent || 0;
            ext.postMarketTime = q.postMarketTime || null;
          }
          // Dividend data
          if (q.dividendRate) ext.dividendRate = q.dividendRate;
          if (q.dividendYield) ext.dividendYield = q.dividendYield; // percentage (e.g. 0.38 = 0.38%)
          if (q.exDividendDate) ext.exDividendDate = q.exDividendDate; // Unix timestamp
          if (q.dividendDate) ext.dividendDate = q.dividendDate; // Next dividend payment date (Unix)
          if (q.trailingAnnualDividendRate) ext.trailingAnnualDividendRate = q.trailingAnnualDividendRate;
          if (q.trailingAnnualDividendYield) ext.trailingAnnualDividendYield = q.trailingAnnualDividendYield;
          resolve(ext);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function fetchYahooPrice(symbol) {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  // Fetch chart data and extended hours in parallel
  const [chartResult, extResult] = await Promise.all([
    new Promise((resolve) => {
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
              resolve({
                symbol: meta.symbol,
                price: meta.regularMarketPrice,
                previousClose: meta.previousClose || meta.chartPreviousClose || meta.regularMarketPrice,
              });
            } else resolve(null);
          } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    }),
    _fetchExtendedHours(symbol)
  ]);

  if (!chartResult) return null;

  const { price, previousClose } = chartResult;
  const priceData = {
    symbol: chartResult.symbol,
    price,
    previousClose,
    change: price - previousClose,
    changePercent: previousClose ? ((price - previousClose) / previousClose) * 100 : 0,
    timestamp: Date.now(),
    // Extended hours data
    ...(extResult || {})
  };
  priceCache.set(symbol, { data: priceData, timestamp: Date.now() });
  return priceData;
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

async function fetchYahooNews(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/search?q=${encodeURIComponent(symbol)}&newsCount=5&quotesCount=0`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.news || []).map(n => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      date: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toLocaleDateString() : null
    }));
  } catch {
    return [];
  }
}

// Sector/industry/country cache (longer TTL - this data rarely changes)
const quoteInfoCache = new Map();
const QUOTE_INFO_TTL = 86400000; // 24 hours

async function fetchQuoteInfo(symbol) {
  const cached = quoteInfoCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < QUOTE_INFO_TTL) {
    return cached.data;
  }
  
  const { crumb, cookies } = await _getYahooCrumb();
  if (!crumb) return null;
  
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&crumb=${encodeURIComponent(crumb)}&fields=sector,industry,longName,shortName,quoteType,market,exchange`;
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Cookie': cookies },
      timeout: 8000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const q = json.quoteResponse?.result?.[0];
          if (!q) return resolve(null);
          const info = {
            sector: q.sector || null,
            industry: q.industry || null,
            quoteType: q.quoteType || null,
            exchange: q.exchange || null,
            market: q.market || null,
            longName: q.longName || q.shortName || null,
          };
          quoteInfoCache.set(symbol, { data: info, timestamp: Date.now() });
          resolve(info);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

module.exports = {
  fetchYahooPrice,
  fetchYahooChart,
  fetchHistoricalPrice,
  fetchYahooNews,
  fetchQuoteInfo,
  priceCache,
  CACHE_TTL,
};
