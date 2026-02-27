// ============ STATE ============
let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user') || 'null');
let portfolioId = null;
let currentPortfolio = null;
let watchlistId = null;
let allWatchlists = [];
let positions = [];
let watchlist = [];
let alerts = [];
let priceCache = {};
let chart = null;
let mainSeries = null;
let ma100Series = null;
let ma200Series = null;
let mainChartType = 'candle';
let mainMA100On = false, mainMA200On = false;
let mainRSIChart = null, mainRSISeries = null;
let lastChartRawData = null;
let selectedSymbol = '^GSPC';
let currentTimeframe = '1mo';
let liveStream = null; // SSE EventSource

// Detail chart state
let detailChart = null;
let detailMainSeries = null;
let detailCandleSeries = null;
let detailMA100 = null;
let detailMA200 = null;
let detailSymbol = '';
let detailTimeframe = '1mo';
let detailChartType = 'candle';
let pinnedMarkets = JSON.parse(localStorage.getItem('pinnedMarkets') || '[]');

const API_BASE = '/api';

// ============ API ============
async function api(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    
    // Feature 10: Handle 401 session expired (but not on login attempts or background fetches)
    if (res.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/ai/models/ollama') && !endpoint.includes('/ai/providers')) {
        // Only auto-logout if we actually had a token (prevents logout during page init race)
        if (token && !window._initialLoadInProgress) {
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => { logout(); }, 2000);
        }
        throw new Error('Session expired');
    }
    
    // Handle non-JSON responses (e.g. reverse proxy error pages)
    const contentType = res.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
        data = await res.json();
    } else {
        const text = await res.text();
        if (!res.ok) throw new Error(`Server error (${res.status}): ${text.substring(0, 100)}`);
        try { data = JSON.parse(text); } catch { throw new Error(`Unexpected response (${res.status})`); }
    }
    
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

// ============ TICKER LOGOS ============
// Professional SVG icons for tickers without standard logos
function makeSvgIcon(bg, fg, text, fontSize) {
    const fs = fontSize || (text.length > 2 ? 10 : 12);
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="${bg}"/><text x="16" y="16" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="700" font-size="${fs}" fill="${fg}">${text}</text></svg>`)}`;
}
// Bitcoin SVG with proper ₿ path
function makeBtcIcon() {
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#F7931A"/><path d="M22.5 14.2c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.6-.4-.7 2.7c-.4-.1-.9-.2-1.3-.3l.7-2.7-1.7-.4-.6 2.7c-.3-.1-.7-.2-1-.3l-2.3-.6-.5 1.8s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.2c0 .1.1.1.1.1l-.1 0-1.1 4.5c-.1.2-.3.5-.7.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.2.5c.4.1.8.2 1.2.3l-.7 2.8 1.6.4.7-2.7c.4.1.9.2 1.3.3l-.7 2.7 1.7.4.7-2.8c2.8.5 4.8.3 5.7-2.2.7-2-.1-3.2-1.5-3.9 1.1-.2 1.9-1.1 2.1-2.7zm-3.8 5.3c-.5 2-3.9.9-5 .6l.9-3.6c1.1.3 4.7.8 4.1 3zm.5-5.3c-.5 1.8-3.3.9-4.2.7l.8-3.2c.9.2 3.9.7 3.4 2.5z" fill="#fff"/></svg>`)}`;
}
// Ethereum SVG
function makeEthIcon() {
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#627EEA"/><path d="M16 4v8.9l7.5 3.3L16 4z" fill="#fff" opacity=".6"/><path d="M16 4L8.5 16.2l7.5-3.3V4z" fill="#fff"/><path d="M16 22v6l7.5-10.4L16 22z" fill="#fff" opacity=".6"/><path d="M16 28v-6l-7.5-4.4L16 28z" fill="#fff"/><path d="M16 20.6l7.5-4.4L16 12.9v7.7z" fill="#fff" opacity=".2"/><path d="M8.5 16.2l7.5 4.4v-7.7l-7.5 3.3z" fill="#fff" opacity=".6"/></svg>`)}`;
}

const TICKER_ICONS = {
    // Crypto
    'BTC-USD':  makeBtcIcon(),
    'ETH-USD':  makeEthIcon(),
    'SOL-USD':  makeSvgIcon('#9945FF', '#fff', 'S'),
    'DOGE-USD': makeSvgIcon('#C2A633', '#fff', 'Ð'),
    'XRP-USD':  makeSvgIcon('#23292F', '#fff', 'X'),
    'ADA-USD':  makeSvgIcon('#0033AD', '#fff', 'A'),
    // Commodities
    'GC=F':     makeSvgIcon('#D4AF37', '#fff', 'Au'),
    'SI=F':     makeSvgIcon('#C0C0C0', '#333', 'Ag'),
    'CL=F':     makeSvgIcon('#333', '#fff', 'Oil', 9),
    'BZ=F':     makeSvgIcon('#5C4033', '#fff', 'Oil', 9),
    'NG=F':     makeSvgIcon('#4A90D9', '#fff', 'NG'),
    'PL=F':     makeSvgIcon('#E5E4E2', '#333', 'Pt'),
    'HG=F':     makeSvgIcon('#B87333', '#fff', 'Cu'),
    // Indices
    '^GSPC':    makeSvgIcon('#E74C3C', '#fff', 'SP', 10),
    '^IXIC':    makeSvgIcon('#0096D6', '#fff', 'NQ', 10),
    '^DJI':     makeSvgIcon('#1A3C6D', '#fff', 'DJ', 10),
    '^VIX':     makeSvgIcon('#FF6600', '#fff', 'V'),
    '^RUT':     makeSvgIcon('#8E44AD', '#fff', 'R'),
    '^FTSE':    makeSvgIcon('#1B365D', '#fff', 'FT', 10),
    '^N225':    makeSvgIcon('#BC002D', '#fff', 'NK', 10),
    '^GDAXI':   makeSvgIcon('#FFCC00', '#333', 'DX', 10),
    // Currency / Bond / Metal ETFs
    'DX-Y.NYB': makeSvgIcon('#2E8B57', '#fff', '$'),
    'EUR=X':    makeSvgIcon('#003399', '#FFD700', '€'),
    'EURUSD=X': makeSvgIcon('#003399', '#FFD700', '€/$', 8),
    'JPY=X':    makeSvgIcon('#BC002D', '#fff', '¥'),
    'GBP=X':    makeSvgIcon('#1B365D', '#fff', '£'),
    // BTC pairs
    'BTC-EUR':  makeBtcIcon(),
};

// Fallback: auto-generate icon for unknown tickers
function getFallbackIcon(symbol) {
    const colors = ['#3498DB','#E74C3C','#2ECC71','#9B59B6','#E67E22','#1ABC9C','#34495E','#F39C12'];
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
    const bg = colors[Math.abs(hash) % colors.length];
    const label = symbol.replace(/[-=^.]/g, '').substring(0, 4).toUpperCase();
    const fs = label.length > 3 ? 7 : label.length > 2 ? 8 : 10;
    return makeSvgIcon(bg, '#fff', label, fs);
}

function getTickerLogo(symbol) {
    if (TICKER_ICONS[symbol]) return TICKER_ICONS[symbol];
    // Clean symbol for logo lookup
    const clean = symbol.replace(/[-=^.]/g, '').toUpperCase();
    // Symbols with special chars (futures, forex, indices) won't have external logos
    if (/[=^]/.test(symbol) || symbol.endsWith('-USD') || symbol.endsWith('-EUR')) {
        return getFallbackIcon(symbol);
    }
    return `https://assets.parqet.com/logos/symbol/${clean}`;
}

const _failedLogos = new Set([...JSON.parse(localStorage.getItem('failedLogos') || '[]'), 'TEST']);

function logoHtml(symbol, size = 24) {
    // If we know this logo fails, skip the network request
    if (_failedLogos.has(symbol)) {
        const fb = getFallbackIcon(symbol);
        return `<img src="${fb}" alt="" class="ticker-logo" style="width:${size}px;height:${size}px;">`;
    }
    const logo = getTickerLogo(symbol);
    const isSvg = logo.startsWith('data:');
    const errorHandler = isSvg ? '' : `onerror="this.onerror=null;_failedLogos.add('${symbol}');try{localStorage.setItem('failedLogos',JSON.stringify([..._failedLogos]))}catch(e){};this.src='${getFallbackIcon(symbol)}'"`;
    return `<img src="${logo}" alt="" class="ticker-logo" style="width:${size}px;height:${size}px;" ${errorHandler}>`;
}

// ============ FUTURES MAPPING ============
const futuresMap = {
    '^GSPC': 'ES=F', '^IXIC': 'NQ=F', '^DJI': 'YM=F',
    'SPY': 'ES=F', 'QQQ': 'NQ=F', 'DIA': 'YM=F',
    'VOO': 'ES=F', 'IVV': 'ES=F'  // S&P 500 ETFs
};

function futuresHtml(symbol) {
    const futSym = futuresMap[symbol];
    if (!futSym) return '';
    const quote = priceCache[symbol];
    if (!quote) return '';
    // Only show when cash market is NOT in regular session
    if (quote.marketState === 'REGULAR') return '';
    const fq = priceCache[futSym];
    if (!fq || !fq.price) return '';
    const fChange = fq.changePercent || 0;
    const fColor = fChange >= 0 ? '#26a69a' : '#ef5350';
    return `<span class="ext-hours" style="font-size:0.7rem;">
        <span style="background:#ff9800;color:#000;padding:1px 4px;border-radius:3px;font-size:0.6rem;font-weight:600;">FUT</span>
        <span style="color:${fColor};" data-price-symbol="${futSym}">${fp(fq.price)}</span>
        <span style="color:${fColor};" data-change-symbol="${futSym}">${fChange >= 0 ? '+' : ''}${fChange.toFixed(2)}%</span>
    </span>`;
}

// ============ EXTENDED HOURS HELPERS ============
function extendedHoursHtml(quote) {
    if (!quote || !quote.marketState) return '';
    const state = quote.marketState;
    // Only show extended hours when NOT in regular session
    if (state === 'REGULAR') return '';
    
    let label, price, changePct, badgeClass;
    if ((state === 'PRE' || state === 'PREPRE') && quote.preMarketPrice) {
        label = 'PM';
        price = quote.preMarketPrice;
        changePct = quote.preMarketChangePercent;
        badgeClass = 'ext-badge-pm';
    } else if ((state === 'POST' || state === 'POSTPOST' || state === 'CLOSED') && quote.postMarketPrice) {
        label = 'AH';
        price = quote.postMarketPrice;
        changePct = quote.postMarketChangePercent;
        badgeClass = 'ext-badge-ah';
    } else {
        return '';
    }
    
    const sign = changePct >= 0 ? '+' : '';
    const colorClass = changePct >= 0 ? 'positive' : 'negative';
    const sym = quote.symbol || '';
    return `<span class="ext-hours"><span class="${badgeClass}">${label}</span> <span class="ext-price" data-price-symbol="${sym}-ah">${fp(price)}</span> <span class="${colorClass}">${sign}${changePct.toFixed(2)}%</span></span>`;
}

// ============ CONFIRM DIALOG ============
function confirmDialog(message, { title = 'Confirm', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
    return new Promise((resolve) => {
        // Remove existing confirm dialog if any
        document.getElementById('confirmDialogOverlay')?.remove();
        
        const overlay = document.createElement('div');
        overlay.id = 'confirmDialogOverlay';
        overlay.className = 'modal-overlay show';
        overlay.style.zIndex = '10000';
        overlay.innerHTML = `
            <div class="modal" style="max-width:380px;animation:modalSlideIn 0.2s ease;">
                <div class="modal-header">
                    <h3>${title}</h3>
                </div>
                <div class="modal-body" style="padding:16px 20px;">
                    <p style="margin:0;color:var(--text-secondary);font-size:0.95rem;line-height:1.5;">${message}</p>
                </div>
                <div class="modal-footer" style="display:flex;gap:10px;justify-content:flex-end;">
                    <button class="btn btn-secondary" id="confirmDialogCancel">${cancelText}</button>
                    <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirmDialogOk">${confirmText}</button>
                </div>
            </div>`;
        
        document.body.appendChild(overlay);
        
        const cleanup = (result) => {
            overlay.remove();
            resolve(result);
        };
        
        overlay.querySelector('#confirmDialogCancel').onclick = () => cleanup(false);
        overlay.querySelector('#confirmDialogOk').onclick = () => cleanup(true);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
        
        // Focus confirm button
        overlay.querySelector('#confirmDialogOk').focus();
    });
}

// ============ PRICE SOURCES ============
const CACHE_KEY = 'portfolio_price_cache';
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 min for stale data display
const FRESH_AGE = 30 * 1000; // 30s for "fresh" data

// Load cache from localStorage on startup
function loadPriceCache() {
    try {
        const saved = localStorage.getItem(CACHE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(priceCache, parsed);
        }
    } catch (e) {
        console.warn('[utils] Failed to load price cache from localStorage:', e.message);
    }
}

function savePriceCache() {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(priceCache));
    } catch (e) {
        console.warn('[utils] Failed to save price cache to localStorage:', e.message);
    }
}

// Data sources with fallback - Server API is primary (cached, no rate limits)
const dataSources = [
    {
        name: 'Server API',
        fetch: async (symbol) => {
            const res = await fetch(`/api/price/${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error('API error');
            const data = await res.json();
            if (!data.price) throw new Error('No data');
            const result = { price: data.price, prev: data.previousClose || data.price };
            // Pass through extended hours data
            if (data.marketState) result.marketState = data.marketState;
            if (data.preMarketPrice) {
                result.preMarketPrice = data.preMarketPrice;
                result.preMarketChange = data.preMarketChange;
                result.preMarketChangePercent = data.preMarketChangePercent;
            }
            if (data.postMarketPrice) {
                result.postMarketPrice = data.postMarketPrice;
                result.postMarketChange = data.postMarketChange;
                result.postMarketChangePercent = data.postMarketChangePercent;
            }
            // Dividend data
            if (data.dividendRate) result.dividendRate = data.dividendRate;
            if (data.dividendYield) result.dividendYield = data.dividendYield;
            if (data.exDividendDate) result.exDividendDate = data.exDividendDate;
            if (data.dividendDate) result.dividendDate = data.dividendDate;
            if (data.trailingAnnualDividendRate) result.trailingAnnualDividendRate = data.trailingAnnualDividendRate;
            if (data.trailingAnnualDividendYield) result.trailingAnnualDividendYield = data.trailingAnnualDividendYield;
            return result;
        }
    },
    {
        name: 'Yahoo (corsproxy)',
        fetch: async (symbol) => {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
            const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            const meta = data.chart?.result?.[0]?.meta;
            if (!meta?.regularMarketPrice) throw new Error('No data');
            return { price: meta.regularMarketPrice, prev: meta.previousClose || meta.chartPreviousClose };
        }
    },
    {
        name: 'Yahoo (allorigins)',
        fetch: async (symbol) => {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
            const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            const meta = data.chart?.result?.[0]?.meta;
            if (!meta?.regularMarketPrice) throw new Error('No data');
            return { price: meta.regularMarketPrice, prev: meta.previousClose || meta.chartPreviousClose };
        }
    }
];

let activeSource = 0;
let sourceStats = { success: 0, fail: 0 };

// DeFi/wrapper tokens that don't have Yahoo price feeds
const _skipPriceSymbols = new Set(['AWETH-USD', 'RLBB-USD', 'CETH-USD', 'RETH-USD', 'STETH-USD', 'CBETH-USD', 'AAVE-WETH', 'TEST']);

async function fetchQuote(symbol) {
    // Skip symbols we know don't have price feeds
    if (_skipPriceSymbols.has(symbol)) {
        return priceCache[symbol] || { symbol, price: 0, change: 0, changePercent: 0, _fetchedAt: Date.now() };
    }
    // Return cached if fresh
    const cached = priceCache[symbol];
    if (cached && cached._fetchedAt && Date.now() - cached._fetchedAt < FRESH_AGE) {
        return cached;
    }
    
    // Try each source
    for (let i = 0; i < dataSources.length; i++) {
        const srcIdx = (activeSource + i) % dataSources.length;
        const source = dataSources[srcIdx];
        try {
            const result = await source.fetch(symbol);
            const price = result.price;
            const prev = result.prev || price;
            const quote = { 
                symbol, 
                price, 
                change: price - prev, 
                changePercent: prev ? ((price - prev) / prev) * 100 : 0, 
                _fetchedAt: Date.now(),
                _source: source.name
            };
            // Extended hours data
            if (result.marketState) quote.marketState = result.marketState;
            if (result.preMarketPrice) {
                quote.preMarketPrice = result.preMarketPrice;
                quote.preMarketChange = result.preMarketChange;
                quote.preMarketChangePercent = result.preMarketChangePercent;
            }
            if (result.postMarketPrice) {
                quote.postMarketPrice = result.postMarketPrice;
                quote.postMarketChange = result.postMarketChange;
                quote.postMarketChangePercent = result.postMarketChangePercent;
            }
            // Dividend data
            if (result.dividendRate) quote.dividendRate = result.dividendRate;
            if (result.dividendYield) quote.dividendYield = result.dividendYield;
            if (result.exDividendDate) quote.exDividendDate = result.exDividendDate;
            if (result.dividendDate) quote.dividendDate = result.dividendDate;
            if (result.trailingAnnualDividendRate) quote.trailingAnnualDividendRate = result.trailingAnnualDividendRate;
            if (result.trailingAnnualDividendYield) quote.trailingAnnualDividendYield = result.trailingAnnualDividendYield;
            priceCache[symbol] = quote;
            activeSource = srcIdx; // Stick with working source
            sourceStats.success++;
            return quote;
        } catch (e) {
            sourceStats.fail++;
            continue;
        }
    }
    
    // All sources failed - return stale cache if available
    if (cached && Date.now() - cached._fetchedAt < CACHE_MAX_AGE) {
        cached._stale = true;
        return cached;
    }
    return null;
}

// Batch fetch for speed
async function fetchQuotes(symbols) {
    const results = await Promise.allSettled(symbols.map(s => fetchQuote(s)));
    savePriceCache();
    return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
}

function updateCacheStatus() {
    const count = Object.keys(priceCache).length;
    const fresh = Object.values(priceCache).filter(p => p._fetchedAt && Date.now() - p._fetchedAt < FRESH_AGE).length;
    const cacheEl = document.getElementById('cacheStatus');
    // Add live dot if not already present
    if (cacheEl && !cacheEl.querySelector('.live-dot')) {
        cacheEl.insertAdjacentHTML('afterbegin', '<span class="live-dot"></span>');
    }
    if (cacheEl) {
        const dotHtml = cacheEl.querySelector('.live-dot')?.outerHTML || '<span class="live-dot"></span>';
        cacheEl.innerHTML = `${dotHtml}${count} symbols (${fresh} fresh)`;
    }
    document.getElementById('dataSourceStatus').textContent = dataSources[activeSource]?.name || 'Unknown';
}

// Apply flash animations to elements whose prices changed
function applyPriceFlash(prevPrices) {
    for (const sym of Object.keys(priceCache)) {
        const prev = prevPrices[sym];
        const curr = priceCache[sym]?.price;
        if (prev == null || curr == null || prev === curr) continue;
        const flashClass = curr > prev ? 'price-flash-up' : 'price-flash-down';
        
        // Flash position cards
        document.querySelectorAll(`.swipe-container[data-id]`).forEach(el => {
            if (el.textContent.includes(sym)) {
                el.classList.remove('price-flash-up', 'price-flash-down');
                void el.offsetWidth; // force reflow
                el.classList.add(flashClass);
            }
        });
        
        // Flash market cards
        document.querySelectorAll('.market-item').forEach(el => {
            if (el.textContent.includes(sym.replace('-USD', '').replace('^', ''))) {
                el.classList.remove('price-flash-up', 'price-flash-down');
                void el.offsetWidth;
                el.classList.add(flashClass);
            }
        });
    }
    
    // Auto-remove flash classes after animation
    setTimeout(() => {
        document.querySelectorAll('.price-flash-up, .price-flash-down').forEach(el => {
            el.classList.remove('price-flash-up', 'price-flash-down');
        });
    }, 900);
}

// ============ PRICE TICKER SIMULATION ============
let tickerInterval = null;
let liveDisplayPrices = {}; // { symbol: { real: number, display: number, spread: number } }

let cryptoTickerInterval = null;

function startPriceTicker() {
    if (tickerInterval) clearInterval(tickerInterval);
    if (cryptoTickerInterval) clearInterval(cryptoTickerInterval);
    
    const tickSymbols = (filter) => {
        for (const [sym, state] of Object.entries(liveDisplayPrices)) {
            if (!state.real || state.real === 0 || !state.canTick) continue;
            const isCrypto = sym.endsWith('-USD');
            if (filter === 'crypto' && !isCrypto) continue;
            if (filter === 'stock' && isCrypto) continue;
            
            // Random walk: small movement within ~0.02% of price
            const spread = state.spread || state.real * 0.0002;
            const jitter = (Math.random() - 0.5) * 2 * spread;
            const newDisplay = +(state.real + jitter).toFixed(state.real > 100 ? 2 : state.real > 1 ? 4 : 6);
            
            if (newDisplay === state.display) continue;
            const direction = newDisplay > state.display ? 'up' : 'down';
            state.display = newDisplay;
            
            // Update DOM price elements
            // If market closed/post/pre, tick the AH elements, not the regular price
            const cleanSym = sym.replace('-USD', '').replace('^', '');
            const isExtended = state.marketState === 'POST' || state.marketState === 'POSTPOST' || state.marketState === 'PRE' || state.marketState === 'PREPRE' || state.marketState === 'CLOSED';
            
            if (isExtended && !sym.endsWith('-USD')) {
                // Tick AH/PM price elements only
                document.querySelectorAll(`[data-price-symbol="${sym}-ah"], [data-price-symbol="${cleanSym}-ah"]`).forEach(el => {
                    el.textContent = fp(newDisplay);
                    el.classList.remove('price-tick-up', 'price-tick-down');
                    void el.offsetWidth;
                    el.classList.add(direction === 'up' ? 'price-tick-up' : 'price-tick-down');
                });
                // Also tick ext-hours spans in watchlist/positions
                document.querySelectorAll(`[data-symbol="${sym}"] .ext-hours .ext-price, [data-symbol="${cleanSym}"] .ext-hours .ext-price`).forEach(el => {
                    el.textContent = fp(newDisplay);
                    el.classList.remove('price-tick-up', 'price-tick-down');
                    void el.offsetWidth;
                    el.classList.add(direction === 'up' ? 'price-tick-up' : 'price-tick-down');
                });
            } else {
                // Regular market hours — tick the main price
                document.querySelectorAll(`[data-price-symbol="${sym}"], [data-price-symbol="${cleanSym}"]`).forEach(el => {
                    if (el.dataset.priceSymbol?.endsWith('-ah')) return; // skip AH elements
                    el.textContent = fp(newDisplay);
                    el.classList.remove('price-tick-up', 'price-tick-down');
                    void el.offsetWidth;
                    el.classList.add(direction === 'up' ? 'price-tick-up' : 'price-tick-down');
                });
            }
            
            // Update chart with simulated tick (AH line for extended, candle for regular)
            if (typeof updateLastCandle === 'function') {
                updateLastCandle(sym, newDisplay);
            }
        }
    };
    
    // Crypto ticks every 800ms (fast!) | Stocks every 2s
    cryptoTickerInterval = setInterval(() => tickSymbols('crypto'), 800);
    tickerInterval = setInterval(() => tickSymbols('stock'), 2000);
}

function stopPriceTicker() {
    if (tickerInterval) { clearInterval(tickerInterval); tickerInterval = null; }
    if (cryptoTickerInterval) { clearInterval(cryptoTickerInterval); cryptoTickerInterval = null; }
}

function updateRealPrice(symbol, price, marketState, postMarketPrice) {
    const isCrypto = symbol.endsWith('-USD');
    // Determine if we should simulate ticks
    // REGULAR = market open, PRE/POST = extended hours, CLOSED = no trading
    let canTick = false;
    let tickPrice = price;
    
    if (isCrypto) {
        canTick = true; // crypto is always live
    } else if (marketState === 'REGULAR') {
        canTick = true;
    } else if ((marketState === 'POST' || marketState === 'PRE' || marketState === 'POSTPOST' || marketState === 'PREPRE') && postMarketPrice) {
        canTick = true;
        tickPrice = postMarketPrice; // use extended hours price
    }
    // CLOSED = no simulation
    
    if (!liveDisplayPrices[symbol]) {
        liveDisplayPrices[symbol] = { real: tickPrice, display: tickPrice, spread: tickPrice * 0.0002, canTick, marketState };
    } else {
        const prev = liveDisplayPrices[symbol].real;
        if (prev !== tickPrice && prev > 0) {
            liveDisplayPrices[symbol].spread = Math.max(Math.abs(tickPrice - prev) * 0.3, tickPrice * 0.0001);
        }
        liveDisplayPrices[symbol].real = tickPrice;
        liveDisplayPrices[symbol].display = tickPrice;
        liveDisplayPrices[symbol].canTick = canTick;
        liveDisplayPrices[symbol].marketState = marketState;
    }
}

// ============ LIVE PRICE STREAM (SSE) ============
function startLiveStream() {
    stopLiveStream();
    
    // Collect all symbols we care about
    const syms = new Set();
    positions.forEach(p => syms.add(p.symbol));
    watchlist.slice(0, 15).forEach(w => syms.add(w.symbol));
    if (selectedSymbol) syms.add(selectedSymbol);
    if (detailSymbol) syms.add(detailSymbol);
    // Add pinned markets
    if (typeof pinnedMarkets !== 'undefined') pinnedMarkets.forEach(s => syms.add(s));
    // Add index futures for after-hours tracking
    ['ES=F', 'NQ=F', 'YM=F'].forEach(s => syms.add(s));
    
    if (syms.size === 0) return;
    
    const url = `${API_BASE}/prices/stream?symbols=${[...syms].join(',')}`;
    liveStream = new EventSource(url);
    
    liveStream.onmessage = (event) => {
        try {
            const prices = JSON.parse(event.data);
            if (prices.error) return;
            
            // Track what changed
            const prevPrices = {};
            for (const sym of Object.keys(prices)) {
                prevPrices[sym] = priceCache[sym]?.price;
            }
            
            // Update price cache + ticker simulation
            for (const [sym, data] of Object.entries(prices)) {
                priceCache[sym] = { ...data, _fetchedAt: Date.now() };
                if (data.price) updateRealPrice(sym, data.price, data.marketState, data.postMarketPrice);
            }
            
            // Flash changed prices
            for (const sym of Object.keys(prices)) {
                const prev = prevPrices[sym];
                const curr = prices[sym]?.price;
                if (prev != null && curr != null && prev !== curr) {
                    flashSymbol(sym, curr > prev ? 'up' : 'down');
                }
            }
            
            // Update UI without full re-render (just prices)
            updateLivePrices(prices);
            
            // Update last candle on charts
            if (typeof updateLastCandle === 'function') {
                for (const [sym, data] of Object.entries(prices)) {
                    if (data.price) updateLastCandle(sym, data.price);
                }
            }
            
            // Update summary values
            updateSummary();
            savePriceCache();
            updateCacheStatus();
        } catch (e) { console.warn('SSE parse error:', e); }
    };
    
    liveStream.onerror = () => {
        // Reconnect after 10s on error
        stopLiveStream();
        setTimeout(startLiveStream, 10000);
    };
    
    // Start simulated micro-ticks between real updates
    startPriceTicker();
}

function stopLiveStream() {
    stopPriceTicker();
    if (liveStream) {
        liveStream.close();
        liveStream = null;
    }
}

function flashSymbol(symbol, direction) {
    const cleanSym = symbol.replace('-USD', '').replace('^', '');
    const flashClass = direction === 'up' ? 'price-flash-up' : 'price-flash-down';
    const tickClass = direction === 'up' ? 'price-tick-up' : 'price-tick-down';
    
    // Flash cards containing this symbol
    document.querySelectorAll(`[data-symbol="${symbol}"], [data-symbol="${cleanSym}"]`).forEach(el => {
        el.classList.remove('price-flash-up', 'price-flash-down');
        void el.offsetWidth;
        el.classList.add(flashClass);
        setTimeout(() => el.classList.remove(flashClass), 1100);
    });
    
    // Flash price text elements
    document.querySelectorAll(`[data-price-symbol="${symbol}"], [data-price-symbol="${cleanSym}"]`).forEach(el => {
        el.classList.remove('price-tick-up', 'price-tick-down');
        void el.offsetWidth;
        el.classList.add(tickClass);
        setTimeout(() => el.classList.remove(tickClass), 1600);
    });
    
    // Also try matching by text content for market cards
    document.querySelectorAll('.market-item, .market-card').forEach(el => {
        const nameEl = el.querySelector('.market-name, .ticker');
        if (nameEl && (nameEl.textContent.includes(cleanSym) || nameEl.textContent.includes(symbol))) {
            el.classList.remove('price-flash-up', 'price-flash-down');
            void el.offsetWidth;
            el.classList.add(flashClass);
            setTimeout(() => el.classList.remove(flashClass), 1100);
        }
    });
}

function updateLivePrices(prices) {
    // Update price elements in-place without full re-render
    for (const [sym, data] of Object.entries(prices)) {
        if (!data.price) continue;
        const cleanSym = sym.replace('-USD', '').replace('^', '');
        
        // Update all elements with data-price-symbol
        document.querySelectorAll(`[data-price-symbol="${sym}"], [data-price-symbol="${cleanSym}"]`).forEach(el => {
            el.textContent = fp(data.price);
        });
        
        // Update change elements
        document.querySelectorAll(`[data-change-symbol="${sym}"], [data-change-symbol="${cleanSym}"]`).forEach(el => {
            const pct = data.changePercent;
            if (pct != null) {
                el.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
                el.className = pct >= 0 ? 'positive' : 'negative';
            }
        });
    }
}

// Restart stream when symbols change (e.g. portfolio/watchlist update)
function refreshLiveStream() {
    if (liveStream) startLiveStream();
}

// Chart data cache
const CHART_CACHE_KEY = 'portfolio_chart_cache';
const CHART_CACHE_MAX_AGE = 5 * 60 * 1000; // 5 min
let chartCache = {};
let chartAbortController = null;

function loadChartCache() {
    try {
        const saved = localStorage.getItem(CHART_CACHE_KEY);
        if (saved) chartCache = JSON.parse(saved);
    } catch (e) {
        console.warn('[utils] Failed to load chart cache from localStorage:', e.message);
    }
}

function saveChartCache() {
    try {
        // Only keep last 20 entries
        const keys = Object.keys(chartCache);
        if (keys.length > 20) {
            const sorted = keys.sort((a, b) => (chartCache[b]._ts || 0) - (chartCache[a]._ts || 0));
            sorted.slice(20).forEach(k => delete chartCache[k]);
        }
        localStorage.setItem(CHART_CACHE_KEY, JSON.stringify(chartCache));
    } catch (e) {
        console.warn('[utils] Failed to save chart cache to localStorage:', e.message);
    }
}

async function fetchChartData(symbol, range) {
    const cacheKey = `${symbol}_${range}`;
    const cached = chartCache[cacheKey];
    const now = Date.now();
    
    // Return fresh cache immediately
    if (cached && cached._ts && (now - cached._ts) < CHART_CACHE_MAX_AGE) {
        return cached.data;
    }
    
    // Abort previous fetch
    if (chartAbortController) {
        chartAbortController.abort();
    }
    chartAbortController = new AbortController();
    
    const intervals = { '1d': '5m', '5d': '15m', '1mo': '1h', '3mo': '1h', '6mo': '1d', '1y': '1d', '2y': '1wk', '5y': '1wk', 'max': '1mo' };
    
    // Try server API first (cached), then fallback to CORS proxies
    const sources = [
        { name: 'Server API', url: `/api/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${intervals[range]}` },
        { name: 'corsproxy', url: `https://corsproxy.io/?${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${intervals[range]}&range=${range}`)}` },
        { name: 'allorigins', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${intervals[range]}&range=${range}`)}` }
    ];
    
    for (const source of sources) {
        try {
            const res = await fetch(source.url, { 
                signal: chartAbortController.signal,
                cache: 'no-store'
            });
            if (!res.ok) continue;
            const data = await res.json();
            const r = data.chart?.result?.[0];
            if (!r || !r.timestamp) continue;
            
            const q = r.indicators.quote[0];
            const chartData = r.timestamp
                .map((t, i) => q.close[i] != null ? { time: t, value: q.close[i] } : null)
                .filter(Boolean);
            const ohlcData = r.timestamp
                .map((t, i) => (q.open[i] != null && q.close[i] != null) ? { 
                    time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] 
                } : null)
                .filter(Boolean);
            
            // Cache it
            chartCache[cacheKey] = { data: chartData, ohlc: ohlcData, _ts: now };
            saveChartCache();
            return chartData;
        } catch (e) {
            if (e.name === 'AbortError') return cached?.data || [];
            continue;
        }
    }
    
    // Return stale cache if all proxies failed
    return cached?.data || [];
}

// ============ CURRENCY SUPPORT ============
const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', CHF: 'CHF ' };
let userCurrency = localStorage.getItem('userCurrency') || 'USD';
let exchangeRates = null;

async function loadExchangeRates() {
    try {
        const data = await fetch('/api/exchange-rates').then(r => r.json());
        exchangeRates = data.rates;
        // Exchange rates loaded
    } catch (e) {
        console.warn('Failed to load exchange rates:', e);
    }
}

function convertPrice(usdPrice, toCurrency) {
    if (!toCurrency || toCurrency === 'USD' || !exchangeRates) return usdPrice;
    const rate = exchangeRates?.USD?.[toCurrency];
    return rate ? usdPrice * rate : usdPrice;
}

function convertToUsd(price, fromCurrency) {
    if (!fromCurrency || fromCurrency === 'USD' || !exchangeRates) return price;
    const rate = exchangeRates?.[fromCurrency]?.['USD'];
    return rate ? price * rate : price;
}

// Compact large numbers: 1.5M, 2.3B, 456K
function compactNumber(num) {
    const abs = Math.abs(num);
    if (abs >= 1e12)      return (num / 1e12).toFixed(1) + 'T';
    if (abs >= 1e9)       return (num / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6)       return (num / 1e6).toFixed(1) + 'M';
    if (abs >= 100000)    return (num / 1e3).toFixed(0) + 'K';
    return null; // Not large enough for compact
}

function formatCurrency(amount, currency, forceCompact) {
    const cur = currency || userCurrency;
    const sym = CURRENCY_SYMBOLS[cur] || cur + ' ';
    const converted = convertPrice(Number(amount), cur);
    // Compact format for very large amounts
    const compact = compactNumber(converted);
    if (compact && (forceCompact || Math.abs(converted) >= 1e6)) {
        return sym + compact;
    }
    if (Math.abs(converted) >= 1000) {
        return sym + converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return sym + converted.toFixed(2);
}

// Format in native market currency (USD) — for individual ticker prices
function formatNative(amount, nativeCurrency) {
    const cur = nativeCurrency || 'USD';
    const sym = CURRENCY_SYMBOLS[cur] || cur + ' ';
    // Compact for very large prices
    const compact = compactNumber(amount);
    if (compact && Math.abs(amount) >= 1e6) {
        return sym + compact;
    }
    if (Math.abs(amount) >= 1000) {
        return sym + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return sym + amount.toFixed(2);
}

// Short aliases for templates:
// fc(amount) = format in user's selected currency (portfolio totals, P&L, cash)
// fp(amount) = format as native market price (individual ticker prices, entry/current)
function fc(amount) { return formatCurrency(amount); }
function fp(amount) { return formatNative(amount); }
function cs() { return CURRENCY_SYMBOLS[userCurrency] || '$'; }

async function updateCurrencySetting() {
    const sel = document.getElementById('settingsCurrency');
    userCurrency = sel.value;
    localStorage.setItem('userCurrency', userCurrency);
    // Save to server settings too
    if (token) {
        try {
            await api('/auth/settings', { method: 'PUT', body: JSON.stringify({ settings: { currency: userCurrency } }) });
        } catch(e) { console.warn('Failed to save currency setting:', e); }
    }
    showToast('Currency changed to ' + userCurrency, 'success');
    // Refresh all views
    renderDashboard();
}

function initCurrencySetting() {
    const sel = document.getElementById('settingsCurrency');
    if (sel) sel.value = userCurrency;
}

// ============ THEME ============
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    // Update toggle buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    
    // Update chart colors if chart exists
    if (chart) {
        const bg = theme === 'light' ? '#ffffff' : '#1e222d';
        const grid = theme === 'light' ? '#e8e8e8' : '#2a2e39';
        const text = theme === 'light' ? '#131722' : '#d1d4dc';
        chart.applyOptions({
            layout: { background: { type: 'solid', color: bg }, textColor: text },
            grid: { vertLines: { color: grid }, horzLines: { color: grid } }
        });
    }
    
    // Update meta theme-color
    document.querySelector('meta[name="theme-color"]').setAttribute('content', theme === 'light' ? '#ffffff' : '#131722');
}

function loadTheme() {
    const saved = localStorage.getItem('theme');
    if (saved) {
        setTheme(saved);
    } else {
        // Auto-detect system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(prefersDark ? 'dark' : 'light');
    }
}

function setThemeAuto() {
    localStorage.removeItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
    // Highlight auto button
    document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.theme-btn[data-theme="auto"]').classList.add('active');
    showToast('Theme follows system preference', 'success');
}

// Listen for system theme changes (auto-follow when no manual preference)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
        setTheme(e.matches ? 'dark' : 'light');
    }
});

