// ============ OPTIONS CHAIN ============
let optionsData = null;
let optionsSymbol = null;

async function toggleOptionsChain() {
    const section = document.getElementById('optionsChainSection');
    const btn = document.getElementById('optionsChainBtn');
    
    if (section.style.display === 'none') {
        section.style.display = 'block';
        btn.textContent = '⛓️ Hide Options';
        await loadOptionsChain();
    } else {
        section.style.display = 'none';
        btn.textContent = '⛓️ Options';
    }
}

async function loadOptionsChain() {
    const symbol = detailSymbol;
    if (!symbol) return;
    
    optionsSymbol = symbol;
    document.getElementById('optionsCallsList').innerHTML = '<div style="color:var(--text-secondary);">Loading...</div>';
    document.getElementById('optionsPutsList').innerHTML = '<div style="color:var(--text-secondary);">Loading...</div>';
    
    try {
        const data = await fetch(`/api/options/${symbol}`).then(r => r.json());
        if (data.error) throw new Error(data.error);
        
        optionsData = data;
        
        // Populate expiry dropdown
        const select = document.getElementById('optionsExpirySelect');
        select.innerHTML = data.expirationDates.slice(0, 12).map((date, i) => 
            `<option value="${date}" ${i === 0 ? 'selected' : ''}>${date}</option>`
        ).join('');
        
        // Render options
        renderOptionsChain(data.calls, data.puts, data.quote?.regularMarketPrice);
    } catch (e) {
        document.getElementById('optionsCallsList').innerHTML = '<div style="color:var(--accent-red);">Not available</div>';
        document.getElementById('optionsPutsList').innerHTML = '<div style="color:var(--accent-red);">Not available</div>';
    }
}

async function loadOptionsForExpiry() {
    const expiry = document.getElementById('optionsExpirySelect').value;
    if (!expiry || !optionsSymbol) return;
    
    document.getElementById('optionsCallsList').innerHTML = '<div style="color:var(--text-secondary);">Loading...</div>';
    document.getElementById('optionsPutsList').innerHTML = '<div style="color:var(--text-secondary);">Loading...</div>';
    
    try {
        const data = await fetch(`/api/options/${optionsSymbol}/${expiry}`).then(r => r.json());
        if (data.error) throw new Error(data.error);
        
        const currentPrice = optionsData?.quote?.regularMarketPrice || 0;
        renderOptionsChain(data.calls, data.puts, currentPrice);
    } catch (e) {
        document.getElementById('optionsCallsList').innerHTML = '<div style="color:var(--accent-red);">Failed to load</div>';
        document.getElementById('optionsPutsList').innerHTML = '<div style="color:var(--accent-red);">Failed to load</div>';
    }
}

function renderOptionsChain(calls, puts, currentPrice) {
    const formatOption = (opt, type) => {
        const strike = opt.strike;
        const itm = type === 'call' ? strike < currentPrice : strike > currentPrice;
        const itmClass = itm ? 'color:var(--accent-green);font-weight:600;' : '';
        const price = opt.lastPrice?.toFixed(2) || '-';
        const change = opt.change ? (opt.change >= 0 ? '+' : '') + opt.change.toFixed(2) : '';
        const changeColor = opt.change >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
        const vol = opt.volume || 0;
        const oi = opt.openInterest || 0;
        
        return `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border-color);${itmClass}">
            <span>$${strike}</span>
            <span>$${price} <span style="color:${changeColor};font-size:0.7rem;">${change}</span></span>
        </div>`;
    };
    
    // Filter to show strikes near current price
    const nearStrikes = (opts) => {
        if (!currentPrice) return opts.slice(0, 10);
        return opts.filter(o => Math.abs(o.strike - currentPrice) / currentPrice < 0.15).slice(0, 10);
    };
    
    const filteredCalls = nearStrikes(calls);
    const filteredPuts = nearStrikes(puts);
    
    document.getElementById('optionsCallsList').innerHTML = filteredCalls.length 
        ? filteredCalls.map(c => formatOption(c, 'call')).join('')
        : '<div style="color:var(--text-secondary);">No calls</div>';
    
    document.getElementById('optionsPutsList').innerHTML = filteredPuts.length
        ? filteredPuts.map(p => formatOption(p, 'put')).join('')
        : '<div style="color:var(--text-secondary);">No puts</div>';
}

function closeChartDetail() {
    closeModal('chartDetailModal');
    if (detailChart) {
        detailChart.remove();
        detailChart = null;
    }
    if (detailRSIChart) {
        detailRSIChart.remove();
        detailRSIChart = null;
        detailRSISeries = null;
    }
    // Reset options section
    document.getElementById('optionsChainSection').style.display = 'none';
    document.getElementById('optionsChainBtn').textContent = '⛓️ Options';
    optionsData = null;
    optionsSymbol = null;
}

let detailRSIChart = null;
let detailRSISeries = null;

function initDetailChart() {
    const el = document.getElementById('chartDetailContainer');
    if (detailChart) detailChart.remove();
    if (detailRSIChart) { detailRSIChart.remove(); detailRSIChart = null; }
    
    detailChart = LightweightCharts.createChart(el, {
        width: el.clientWidth,
        height: el.clientHeight || 400,
        layout: { background: { type: 'solid', color: '#1e222d' }, textColor: '#d1d4dc' },
        grid: { vertLines: { color: '#2a2e39' }, horzLines: { color: '#2a2e39' } },
        rightPriceScale: { borderColor: '#363a45', scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: '#363a45', timeVisible: true, barSpacing: 6, minBarSpacing: 1 },
        handleScroll: false,
        handleScale: false,
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { labelVisible: true },
            horzLine: { labelVisible: true }
        },
        localization: {
            priceFormatter: (price) => {
                const abs = Math.abs(price);
                if (abs >= 1e6) return '$' + (price / 1e6).toFixed(1).replace('.0', '') + 'M';
                if (abs >= 1e4) return '$' + (price / 1e3).toFixed(0) + 'K';
                if (abs >= 1e3) return '$' + price.toFixed(0);
                return '$' + price.toFixed(2);
            }
        }
    });
    
    detailMainSeries = detailChart.addAreaSeries({ topColor: 'rgba(41,98,255,0.4)', bottomColor: 'rgba(41,98,255,0)', lineColor: '#2962ff', lineWidth: 2 });
    detailMainSeries.applyOptions({ visible: false });
    detailCandleSeries = detailChart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
    
    // MAs removed for cleaner chart view
    
    // RSI chart
    const rsiEl = document.getElementById('detailRSIContainer');
    if (rsiEl) {
        detailRSIChart = LightweightCharts.createChart(rsiEl, {
            width: rsiEl.clientWidth || 300,
            height: 60,
            layout: { background: { type: 'solid', color: '#1e222d' }, textColor: '#787b86', fontSize: 10 },
            grid: { vertLines: { color: '#2a2e39' }, horzLines: { color: '#2a2e39' } },
            rightPriceScale: { borderColor: '#363a45' },
            timeScale: { visible: false },
            handleScroll: false,
            handleScale: false,
            crosshair: { mode: 0 }
        });
        new ResizeObserver(entries => {
            const r = entries[0].contentRect;
            if (detailRSIChart && r.width > 0) detailRSIChart.applyOptions({ width: r.width });
        }).observe(rsiEl);
    }
    
    new ResizeObserver(() => {
        if (detailChart) detailChart.applyOptions({ width: el.clientWidth, height: el.clientHeight || 400 });
    }).observe(el);
}

// For MA calculation: fetch daily data separately (always consistent)
async function fetchMAData(symbol) {
    const cacheKey = `${symbol}_ma_daily`;
    const cached = chartCache[cacheKey];
    const now = Date.now();
    if (cached && cached._ts && (now - cached._ts) < 5 * 60 * 1000) return cached.data;
    
    try {
        const res = await fetch(`/api/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`);
        if (!res.ok) return [];
        const json = await res.json();
        const r = json.chart?.result?.[0];
        if (!r || !r.timestamp) return [];
        const q = r.indicators.quote[0];
        const data = r.timestamp.map((t, i) => q.close[i] != null ? { time: t, value: q.close[i] } : null).filter(Boolean);
        chartCache[cacheKey] = { data, _ts: now };
        return data;
    } catch (e) { return []; }
}

async function updateDetailChart() {
    if (!detailChart) return;
    
    // Fetch chart data at the normal interval for candles
    const data = await fetchChartData(detailSymbol, detailTimeframe);
    if (!data.length) return;
    
    let dataLen = data.length;
    if (detailChartType === 'area') {
        detailMainSeries.setData(data);
        detailMainSeries.applyOptions({ visible: true });
        detailCandleSeries.applyOptions({ visible: false });
    } else {
        const ohlcData = await fetchOHLCData(detailSymbol, detailTimeframe);
        if (ohlcData.length) {
            detailCandleSeries.setData(ohlcData);
            detailCandleSeries.applyOptions({ visible: true });
            detailMainSeries.applyOptions({ visible: false });
            dataLen = ohlcData.length;
        }
    }
    
    // Logarithmic scale for "All" timeframe (like TradingView)
    const useLog = (detailTimeframe === 'max');
    detailChart.priceScale('right').applyOptions({
        mode: useLog ? 1 : 0  // 1 = Logarithmic, 0 = Normal
    });
    
    // Cap candle width: slim on desktop, comfortable on mobile
    const chartEl2 = document.getElementById('detailChart') || document.getElementById('marketDetailChart');
    const chartW2 = chartEl2?.clientWidth || 800;
    detailChart.timeScale().applyOptions({ minBarSpacing: 0.5 });
    detailChart.timeScale().fitContent();
    
    // RSI
    renderDetailRSI(data);
}

function renderDetailRSI(data) {
    const rsiEl = document.getElementById('detailRSIContainer');
    if (!detailRSIChart || data.length < 15) {
        if (rsiEl) rsiEl.style.display = data.length < 15 ? 'none' : 'block';
        return;
    }
    rsiEl.style.display = 'block';
    if (detailRSISeries) { try { detailRSIChart.removeSeries(detailRSISeries); } catch(e){} }
    detailRSISeries = detailRSIChart.addLineSeries({
        color: '#ab47bc', lineWidth: 1.5,
        priceFormat: { type: 'custom', formatter: v => v.toFixed(0) }
    });
    const rsiData = calcRSI(data, 14);
    detailRSISeries.setData(rsiData);
    if (rsiData.length > 0) {
        detailRSISeries.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
    }
    detailRSIChart.timeScale().fitContent();
}

async function fetchOHLCData(symbol, range) {
    const intervals = { '1d': '5m', '5d': '15m', '1mo': '1d', '3mo': '1d', '6mo': '1d', '1y': '1wk', '2y': '1wk', '5y': '1wk', 'max': '1mo' };
    
    // Try server API first, then fallback
    const sources = [
        `/api/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${intervals[range]}`,
        `https://corsproxy.io/?${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${intervals[range]}&range=${range}`)}`
    ];
    
    for (const url of sources) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            const data = await res.json();
            const r = data.chart?.result?.[0];
            if (!r || !r.timestamp) continue;
            const q = r.indicators.quote[0];
            return r.timestamp.map((t, i) => {
                if (q.open[i] == null) return null;
                return { time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] };
            }).filter(Boolean);
        } catch (e) {
            continue;
        }
    }
    return [];
}

function setDetailChartType(type) {
    detailChartType = type;
    document.querySelectorAll('.chart-type-btns .chart-btn').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === type));
    updateDetailChart();
}

function setDetailTimeframe(tf) {
    detailTimeframe = tf;
    document.querySelectorAll('.chart-tf-btns .chart-btn').forEach(b => {
        const btnTf = { '1D': '1d', '5D': '5d', '1M': '1mo', '3M': '3mo', '1Y': '1y', 'All': 'max' }[b.textContent];
        b.classList.toggle('active', btnTf === tf);
    });
    updateDetailChart();
}

function toggleDetailMA(period) {
    updateDetailChart();
}

async function addToMarkets() {
    const idx = pinnedMarkets.indexOf(detailSymbol);
    if (idx >= 0) {
        pinnedMarkets.splice(idx, 1);
        document.getElementById('addToMarketsBtn').textContent = '📌 Pin to Markets';
    } else {
        pinnedMarkets.push(detailSymbol);
        document.getElementById('addToMarketsBtn').textContent = '📌 Unpin';
    }
    localStorage.setItem('pinnedMarkets', JSON.stringify(pinnedMarkets));
    // Sync to server if logged in
    if (token) {
        try {
            const me = await api('/auth/me');
            const settings = me.settings || {};
            settings.pinnedMarkets = pinnedMarkets;
            await api('/auth/settings', { method: 'PUT', body: JSON.stringify({ settings }) });
        } catch (e) { console.warn('Failed to sync pinned markets:', e); }
    }
    renderMarkets();
}

// ============ NEWS ============
let currentNewsFilter = 'market';

function setNewsFilter(filter) {
    currentNewsFilter = filter;
    document.querySelectorAll('.news-filter').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    
    const searchBox = document.getElementById('newsSearchBox');
    searchBox.style.display = filter === 'search' ? 'block' : 'none';
    
    if (filter !== 'search') {
        loadNews();
    }
}

async function loadNews(query = null, symbol = null) {
    const newsList = document.getElementById('newsList');
    newsList.innerHTML = '<div class="loading"><div class="spinner"></div>Loading news...</div>';
    
    try {
        let url = `/api/news?limit=15`;
        
        if (query) {
            url += `&query=${encodeURIComponent(query)}`;
        } else if (symbol) {
            url += `&symbol=${encodeURIComponent(symbol)}`;
        } else if (currentNewsFilter === 'portfolio') {
            // Get symbols from positions for portfolio news
            const symbols = positions.map(p => p.symbol).slice(0, 3).join(' OR ');
            if (symbols) {
                url += `&query=${encodeURIComponent(symbols + ' stock')}`;
            }
        }
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.items && data.items.length > 0) {
            renderNews(data.items);
        } else {
            newsList.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px;">No news found</div>';
        }
    } catch (err) {
        console.error('News error:', err);
        newsList.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px;">Failed to load news</div>';
    }
}

function renderNews(items) {
    const newsList = document.getElementById('newsList');
    
    // Map sources to icons
    const sourceIcons = {
        'Bloomberg': '💹',
        'CNBC': '📺',
        'Yahoo Finance': '💰',
        'Reuters': '🌐',
        'WSJ': '📰',
        'Wall Street Journal': '📰',
        'Barrons': '📊',
        'MarketWatch': '📈',
        'Forbes': '💎',
        'Investopedia': '📚',
        'Seeking Alpha': '🔍',
        'TechCrunch': '💻',
        'The Motley Fool': '🃏',
    };
    
    newsList.innerHTML = items.map(item => {
        // Find matching icon
        let icon = '📄';
        for (const [src, emoji] of Object.entries(sourceIcons)) {
            if (item.source && item.source.toLowerCase().includes(src.toLowerCase())) {
                icon = emoji;
                break;
            }
        }
        
        return `
            <a href="${item.link}" target="_blank" class="news-item">
                <div class="news-icon">${icon}</div>
                <div class="news-content">
                    <div class="news-title">${item.title}</div>
                    <div class="news-meta">
                        <span class="news-source">${item.source || 'News'}</span>
                        <span>${item.timeAgo}</span>
                    </div>
                </div>
            </a>
        `;
    }).join('');
}

function searchNews() {
    const query = document.getElementById('newsSearchInput').value.trim();
    if (query) {
        loadNews(query);
    }
}

function refreshNews() {
    if (currentNewsFilter === 'search') {
        searchNews();
    } else {
        loadNews();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

