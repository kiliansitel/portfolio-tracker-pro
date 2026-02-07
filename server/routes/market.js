const express = require('express');
const https = require('https');
const { fetchYahooPrice, fetchYahooChart } = require('../utils/yahoo');

const router = express.Router();

// Yahoo crumb for authenticated endpoints (options chain)
let yahooCrumb = null;
let yahooCookies = null;
let crumbTimestamp = 0;
const CRUMB_TTL = 3600000; // 1 hour

async function getYahooCrumb() {
  if (yahooCrumb && Date.now() - crumbTimestamp < CRUMB_TTL) {
    return { crumb: yahooCrumb, cookies: yahooCookies };
  }
  
  return new Promise((resolve) => {
    // First get cookies
    https.get('https://fc.yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, (res) => {
      const cookies = res.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || '';
      
      // Then get crumb
      https.get('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': cookies
        }
      }, (crumbRes) => {
        let crumb = '';
        crumbRes.on('data', chunk => crumb += chunk);
        crumbRes.on('end', () => {
          yahooCrumb = crumb;
          yahooCookies = cookies;
          crumbTimestamp = Date.now();
          resolve({ crumb, cookies });
        });
      }).on('error', () => resolve({ crumb: null, cookies: null }));
    }).on('error', () => resolve({ crumb: null, cookies: null }));
  });
}

async function fetchOptionsChain(symbol) {
  const cacheKey = `options_${symbol}`;
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const { crumb, cookies } = await getYahooCrumb();
  if (!crumb) return null;
  
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(crumb)}`;
    
    https.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': cookies
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.optionChain?.result?.[0];
          if (result) {
            const optionsData = {
              symbol: result.underlyingSymbol,
              quote: result.quote,
              expirationDates: result.expirationDates?.map(ts => new Date(ts * 1000).toISOString().split('T')[0]) || [],
              strikes: result.strikes || [],
              calls: result.options?.[0]?.calls || [],
              puts: result.options?.[0]?.puts || [],
              timestamp: Date.now()
            };
            priceCache.set(cacheKey, { data: optionsData, timestamp: Date.now() });
            resolve(optionsData);
          } else {
            resolve(null);
          }
        } catch (e) {
          console.error('Options fetch error:', e);
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function fetchOptionsForExpiry(symbol, expiryTimestamp) {
  const { crumb, cookies } = await getYahooCrumb();
  if (!crumb) return null;
  
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?date=${expiryTimestamp}&crumb=${encodeURIComponent(crumb)}`;
    
    https.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': cookies
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.optionChain?.result?.[0];
          if (result) {
            resolve({
              calls: result.options?.[0]?.calls || [],
              puts: result.options?.[0]?.puts || []
            });
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Allowed chart ranges and intervals (whitelist for Yahoo API params)
const VALID_RANGES = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max', 'ytd'];
const VALID_INTERVALS = ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo'];

// Popular tickers for suggestions
const POPULAR_TICKERS = [
  // US Tech Giants
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices' },
  
  // AI & Semiconductors
  { symbol: 'ASML', name: 'ASML Holding N.V.' },
  { symbol: 'TSM', name: 'Taiwan Semiconductor' },
  { symbol: 'AVGO', name: 'Broadcom Inc.' },
  { symbol: 'ARM', name: 'Arm Holdings' },
  { symbol: 'MU', name: 'Micron Technology' },
  { symbol: 'MRVL', name: 'Marvell Technology' },
  
  // ETFs & Indices
  { symbol: 'QQQ', name: 'Invesco QQQ Trust' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury' },
  { symbol: 'ROBO', name: 'Robo Global Robotics ETF' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF' },
  { symbol: 'ARKK', name: 'ARK Innovation ETF' },
  
  // Robotics & Automation
  { symbol: 'ISRG', name: 'Intuitive Surgical Inc.' },
  { symbol: 'SYM', name: 'Symbotic Inc.' },
  { symbol: 'TER', name: 'Teradyne Inc.' },
  { symbol: 'ROK', name: 'Rockwell Automation' },
  
  // Crypto
  { symbol: 'BTC-USD', name: 'Bitcoin USD' },
  { symbol: 'ETH-USD', name: 'Ethereum USD' },
  { symbol: 'SOL-USD', name: 'Solana USD' },
  { symbol: 'BNB-USD', name: 'BNB USD' },
  { symbol: 'XRP-USD', name: 'XRP USD' },
  { symbol: 'ADA-USD', name: 'Cardano USD' },
  { symbol: 'DOGE-USD', name: 'Dogecoin USD' },
  { symbol: 'DOT-USD', name: 'Polkadot USD' },
  { symbol: 'AVAX-USD', name: 'Avalanche USD' },
  { symbol: 'MATIC-USD', name: 'Polygon USD' },
  { symbol: 'LTC-USD', name: 'Litecoin USD' },
  { symbol: 'LINK-USD', name: 'Chainlink USD' },
  { symbol: 'ATOM-USD', name: 'Cosmos USD' },
  { symbol: 'UNI-USD', name: 'Uniswap USD' },
  { symbol: 'AAVE-USD', name: 'Aave USD' },
  { symbol: 'SHIB-USD', name: 'Shiba Inu USD' },
  { symbol: 'WBTC-USD', name: 'Wrapped Bitcoin USD' },
  { symbol: 'PEPE-USD', name: 'Pepe USD' },
  { symbol: 'LDO-USD', name: 'Lido DAO USD' },
  { symbol: 'STETH-USD', name: 'Lido Staked ETH USD' },
  { symbol: 'APE-USD', name: 'ApeCoin USD' },
  { symbol: 'SAND-USD', name: 'The Sandbox USD' },
  { symbol: 'MANA-USD', name: 'Decentraland USD' },
  { symbol: 'FTM-USD', name: 'Fantom USD' },
  { symbol: 'CRO-USD', name: 'Cronos USD' },
  { symbol: 'ALGO-USD', name: 'Algorand USD' },
  { symbol: 'QRL-USD', name: 'Quantum Resistant Ledger USD' },
  { symbol: 'COIN', name: 'Coinbase Global' },
  { symbol: 'MSTR', name: 'MicroStrategy Inc.' },
  
  // Precious Metals & Commodities
  { symbol: 'GC=F', name: 'Gold Futures' },
  { symbol: 'SI=F', name: 'Silver Futures' },
  { symbol: 'SLV', name: 'iShares Silver Trust' },
  { symbol: 'GLD', name: 'SPDR Gold Trust' },
  { symbol: 'PSLV', name: 'Sprott Physical Silver Trust' },
  { symbol: 'SIVR', name: 'Aberdeen Silver ETF' },
  { symbol: 'CL=F', name: 'Crude Oil Futures' },
  { symbol: 'NG=F', name: 'Natural Gas Futures' },
  
  // Nuclear & Energy
  { symbol: 'CCJ', name: 'Cameco Corporation' },
  { symbol: 'OKLO', name: 'Oklo Inc.' },
  { symbol: 'URA', name: 'Global X Uranium ETF' },
  { symbol: 'URNM', name: 'North Shore Global Uranium ETF' },
  
  // European Stocks (Belgium & Netherlands)
  { symbol: 'KBC.BR', name: 'KBC Group (Brussels)' },
  { symbol: 'UCB.BR', name: 'UCB SA (Brussels)' },
  { symbol: 'SOLB.BR', name: 'Solvay SA (Brussels)' },
  { symbol: 'ASML.AS', name: 'ASML Holding (Amsterdam)' },
  { symbol: 'RDSA.AS', name: 'Royal Dutch Shell (Amsterdam)' },
  { symbol: 'UNA.AS', name: 'Unilever NV (Amsterdam)' },
  
  // Space & Defense
  { symbol: 'RKLB', name: 'Rocket Lab USA' },
  { symbol: 'ASTS', name: 'AST SpaceMobile' },
  { symbol: 'LMT', name: 'Lockheed Martin' },
  { symbol: 'NOC', name: 'Northrop Grumman' },
  { symbol: 'LHX', name: 'L3Harris Technologies' },
  { symbol: 'BA', name: 'Boeing Company' },
  
  // Market Indices
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'NASDAQ Composite' },
  { symbol: '^DJI', name: 'Dow Jones Industrial' },
  { symbol: '^VIX', name: 'CBOE Volatility Index' },
  { symbol: '^RUT', name: 'Russell 2000' },
  { symbol: '^AEX', name: 'Amsterdam Exchange Index' },
  { symbol: '^BFX', name: 'BEL 20 Index (Belgium)' },
  
  // Other Popular Stocks
  { symbol: 'PLTR', name: 'Palantir Technologies' },
  { symbol: 'IONQ', name: 'IonQ Inc.' },
  { symbol: 'PATH', name: 'UiPath Inc.' },
  { symbol: 'SNOW', name: 'Snowflake Inc.' },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings' },
  { symbol: 'NET', name: 'Cloudflare Inc.' },
  { symbol: 'DDOG', name: 'Datadog Inc.' },
  { symbol: 'SHOP', name: 'Shopify Inc.' },
];

// Get single price
router.get('/price/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const data = await fetchYahooPrice(symbol);
  if (data) {
    res.json(data);
  } else {
    res.status(404).json({ error: 'Price not found' });
  }
});

// Get multiple prices
router.get('/prices', async (req, res) => {
  const { symbols } = req.query;
  if (!symbols) {
    return res.json({});
  }
  
  const symbolList = symbols.split(',').slice(0, 50); // Max 50 symbols
  const results = {};
  
  // Fetch in parallel with small batches to avoid overwhelming
  const batchSize = 10;
  for (let i = 0; i < symbolList.length; i += batchSize) {
    const batch = symbolList.slice(i, i + batchSize);
    const promises = batch.map(s => fetchYahooPrice(s.trim()));
    const batchResults = await Promise.all(promises);
    batch.forEach((symbol, idx) => {
      if (batchResults[idx]) {
        results[symbol.trim()] = batchResults[idx];
      }
    });
  }
  
  res.json(results);
});

// Get chart data
router.get('/chart/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { range = '1mo', interval = '1d' } = req.query;
  
  // Whitelist validation for Yahoo API parameters
  if (!VALID_RANGES.includes(range)) {
    return res.status(400).json({ error: 'Invalid range. Allowed: ' + VALID_RANGES.join(', ') });
  }
  if (!VALID_INTERVALS.includes(interval)) {
    return res.status(400).json({ error: 'Invalid interval. Allowed: ' + VALID_INTERVALS.join(', ') });
  }
  
  const data = await fetchYahooChart(symbol, range, interval);
  if (data) {
    res.json(data);
  } else {
    res.status(404).json({ error: 'Chart data not found' });
  }
});

// Get options chain for a symbol
router.get('/options/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const data = await fetchOptionsChain(symbol);
  if (data) {
    res.json(data);
  } else {
    res.status(404).json({ error: 'Options data not found' });
  }
});

// Get options for a specific expiry date
router.get('/options/:symbol/:expiry', async (req, res) => {
  const { symbol, expiry } = req.params;
  // Convert date string (YYYY-MM-DD) to Unix timestamp
  const expiryTs = Math.floor(new Date(expiry).getTime() / 1000);
  const data = await fetchOptionsForExpiry(symbol, expiryTs);
  if (data) {
    res.json(data);
  } else {
    res.status(404).json({ error: 'Options data not found for this expiry' });
  }
});

// News feed
router.get('/news', async (req, res) => {
  const { symbol, query, limit = 10 } = req.query;
  
  // Build search query
  let searchQuery = 'stock market';
  if (symbol) {
    // Get company name from symbol if possible
    const symbolMap = {
      'AAPL': 'Apple stock',
      'MSFT': 'Microsoft stock',
      'GOOGL': 'Alphabet Google stock',
      'AMZN': 'Amazon stock',
      'NVDA': 'NVIDIA stock',
      'TSLA': 'Tesla stock',
      'META': 'Meta Facebook stock',
      'AMD': 'AMD stock',
      'QQQ': 'QQQ Nasdaq ETF',
      'SPY': 'SPY S&P 500 ETF',
      'BTC-USD': 'Bitcoin cryptocurrency',
      'ETH-USD': 'Ethereum cryptocurrency',
    };
    searchQuery = symbolMap[symbol.toUpperCase()] || `${symbol} stock`;
  } else if (query) {
    searchQuery = query;
  }
  
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=en-US&gl=US&ceid=US:en`;
  
  try {
    const fetchRSS = () => new Promise((resolve, reject) => {
      https.get(url, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
        response.on('error', reject);
      }).on('error', reject);
    });
    
    const xml = await fetchRSS();
    
    // Parse RSS XML manually (simple extraction)
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null && items.length < parseInt(limit)) {
      const item = match[1];
      
      const getTag = (tag) => {
        const tagMatch = item.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[(.+?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]+)<\\/${tag}>`));
        return tagMatch ? (tagMatch[1] || tagMatch[2] || '').trim() : '';
      };
      
      const title = getTag('title');
      const link = getTag('link');
      const pubDate = getTag('pubDate');
      const source = getTag('source');
      
      if (title && link) {
        items.push({
          title,
          link,
          source,
          pubDate,
          timeAgo: getTimeAgo(new Date(pubDate))
        });
      }
    }
    
    res.json({ 
      query: searchQuery,
      items 
    });
  } catch (error) {
    console.error('News fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch news', details: error.message });
  }
});

// Helper: Get relative time string
function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Ticker search
router.get('/tickers/search', (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.json(POPULAR_TICKERS.slice(0, 20));
  }
  
  const query = q.toUpperCase();
  const matches = POPULAR_TICKERS.filter(t => 
    t.symbol.includes(query) || t.name.toUpperCase().includes(query)
  );
  
  res.json(matches.slice(0, 20));
});

router.get('/tickers/popular', (req, res) => {
  res.json(POPULAR_TICKERS);
});

module.exports = router;