// ============ CHART ============
function initChart() {
    const el = document.getElementById('chartContainer');
    const wrapper = el.parentElement;
    const width = wrapper.clientWidth || el.clientWidth || 300;
    const height = wrapper.clientHeight || 350;
    
    chart = LightweightCharts.createChart(el, {
        width: width,
        height: height,
        layout: { background: { type: 'solid', color: '#1e222d' }, textColor: '#d1d4dc' },
        grid: { vertLines: { color: '#2a2e39' }, horzLines: { color: '#2a2e39' } },
        rightPriceScale: { borderColor: '#363a45', scaleMargins: { top: 0.15, bottom: 0.15 } },
        timeScale: { borderColor: '#363a45', timeVisible: true },
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
                if (abs >= 1e3) return '$' + (price / 1e3).toFixed(1).replace('.0', '') + 'K';
                return '$' + price.toFixed(2);
            }
        }
    });
    
    createMainSeries();
    
    // Handle resize
    new ResizeObserver((entries) => {
        const rect = entries[0].contentRect;
        if (chart && rect.width > 0) {
            chart.applyOptions({ width: rect.width, height: rect.height || 350 });
        }
    }).observe(wrapper);
    
    // RSI chart
    const rsiEl = document.getElementById('mainRSIContainer');
    mainRSIChart = LightweightCharts.createChart(rsiEl, {
        width: rsiEl.clientWidth || 300,
        height: 80,
        layout: { background: { type: 'solid', color: '#1e222d' }, textColor: '#787b86', fontSize: 10 },
        grid: { vertLines: { color: '#2a2e39' }, horzLines: { color: '#2a2e39' } },
        rightPriceScale: { borderColor: '#363a45' },
        timeScale: { visible: false },
        crosshair: { mode: 0 }
    });
    new ResizeObserver(entries => {
        const r = entries[0].contentRect;
        if (mainRSIChart && r.width > 0) mainRSIChart.applyOptions({ width: r.width });
    }).observe(rsiEl);
    
    // Sync time scales
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range && mainRSIChart) mainRSIChart.timeScale().setVisibleLogicalRange(range);
    });
}

function createMainSeries() {
    // Remove existing series
    if (mainSeries) { try { chart.removeSeries(mainSeries); } catch(e){} mainSeries = null; }
    if (ma100Series) { try { chart.removeSeries(ma100Series); } catch(e){} ma100Series = null; }
    if (ma200Series) { try { chart.removeSeries(ma200Series); } catch(e){} ma200Series = null; }
    
    if (mainChartType === 'candle') {
        mainSeries = chart.addCandlestickSeries({
            upColor: '#26a69a', downColor: '#ef5350',
            borderUpColor: '#26a69a', borderDownColor: '#ef5350',
            wickUpColor: '#26a69a', wickDownColor: '#ef5350'
        });
    } else {
        mainSeries = chart.addAreaSeries({ topColor: 'rgba(41,98,255,0.4)', bottomColor: 'rgba(41,98,255,0)', lineColor: '#2962ff', lineWidth: 2 });
    }
    
    if (mainMA100On) { ma100Series = chart.addLineSeries({ color: '#627eea', lineWidth: 1, lastValueVisible: false, priceLineVisible: false }); }
    if (mainMA200On) { ma200Series = chart.addLineSeries({ color: '#e91e63', lineWidth: 1, lastValueVisible: false, priceLineVisible: false }); }
}

// Calculate moving average
function calcMA(data, period) {
    const result = [];
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].value;
        }
        result.push({ time: data[i].time, value: sum / period });
    }
    return result;
}

function renderChartData(data) {
    if (!data.length || !mainSeries) return;
    lastChartRawData = data;
    
    if (mainChartType === 'candle') {
        // Use cached OHLC data from Yahoo API
        const cacheKey = `${selectedSymbol}_${currentTimeframe}`;
        const cached = chartCache[cacheKey];
        const ohlc = cached?.ohlc;
        if (ohlc && ohlc.length > 0) {
            mainSeries.setData(ohlc);
        } else {
            // Fallback: use line data as single-value candles
            mainSeries.setData(data.map(d => ({ time: d.time, open: d.value, high: d.value, low: d.value, close: d.value })));
        }
    } else {
        mainSeries.setData(data);
        const q = priceCache[selectedSymbol];
        if (q) {
            const color = q.change >= 0 ? '#26a69a' : '#ef5350';
            mainSeries.applyOptions({ 
                topColor: q.change >= 0 ? 'rgba(38,166,154,0.4)' : 'rgba(239,83,80,0.4)', 
                lineColor: color 
            });
        }
    }
    
    // Moving averages (all timeframes)
    if (ma100Series) ma100Series.setData(mainMA100On && data.length >= 100 ? calcMA(data, 100) : []);
    if (ma200Series) ma200Series.setData(mainMA200On && data.length >= 200 ? calcMA(data, 200) : []);
    
    // Logarithmic scale for "All" timeframe
    const useLog = (currentTimeframe === 'max');
    chart.priceScale('right').applyOptions({
        mode: useLog ? 1 : 0
    });
    
    // Dynamic bar spacing for large datasets
    chart.timeScale().applyOptions({
        barSpacing: data.length > 100 ? 2 : 8,
        minBarSpacing: data.length > 100 ? 0.5 : 3
    });
    
    chart.timeScale().fitContent();
    
    // After-hours price line on main chart
    if (window._mainAhLine && mainSeries) {
        try { mainSeries.removePriceLine(window._mainAhLine); } catch(e) {}
        window._mainAhLine = null;
    }
    const mq = priceCache[selectedSymbol];
    if (mq && mq.marketState !== 'REGULAR') {
        const ahp = (mq.postMarketPrice || mq.preMarketPrice);
        if (ahp && mainSeries) {
            const label = (mq.marketState === 'POST' || mq.marketState === 'POSTPOST' || mq.marketState === 'CLOSED') ? 'AH' : 'PM';
            window._mainAhLine = mainSeries.createPriceLine({
                price: ahp, color: '#ff9800', lineWidth: 1, lineStyle: 2,
                axisLabelVisible: true, title: label
            });
        }
    }
    
    // RSI
    renderMainRSI(data);
}

function renderMainRSI(data) {
    const rsiEl = document.getElementById('mainRSIContainer');
    if (!mainRSIChart || data.length < 15) {
        if (rsiEl) rsiEl.style.display = data.length < 15 ? 'none' : 'block';
        return;
    }
    rsiEl.style.display = 'block';
    if (mainRSISeries) { try { mainRSIChart.removeSeries(mainRSISeries); } catch(e){} }
    mainRSISeries = mainRSIChart.addLineSeries({
        color: '#ab47bc', lineWidth: 1.5, 
        priceFormat: { type: 'custom', formatter: v => v.toFixed(0) }
    });
    const rsiData = calcRSI(data, 14);
    mainRSISeries.setData(rsiData);
    if (rsiData.length > 0) {
        mainRSISeries.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
    }
    mainRSIChart.timeScale().fitContent();
}

function setMainChartType(type) {
    mainChartType = type;
    document.getElementById('mainTypeArea').classList.toggle('active', type === 'area');
    document.getElementById('mainTypeCandle').classList.toggle('active', type === 'candle');
    createMainSeries();
    if (lastChartRawData) renderChartData(lastChartRawData);
}

function toggleMainMA(period) {
    if (period === 100) mainMA100On = document.getElementById('mainMA100').checked;
    if (period === 200) mainMA200On = document.getElementById('mainMA200').checked;
    createMainSeries();
    if (lastChartRawData) renderChartData(lastChartRawData);
}

async function updateChart() {
    const cacheKey = `${selectedSymbol}_${currentTimeframe}`;
    const titleEl = document.getElementById('chartTitle');
    const displayName = selectedSymbol.replace('-USD', '').replace('^', '');
    
    // Show cached data IMMEDIATELY (no await)
    const cached = chartCache[cacheKey];
    if (cached?.data?.length) {
        titleEl.textContent = displayName;
        renderChartData(cached.data);
    } else {
        titleEl.textContent = displayName + ' ⏳';
    }
    
    // Then fetch fresh data in background
    const freshData = await fetchChartData(selectedSymbol, currentTimeframe);
    titleEl.textContent = displayName;
    if (freshData.length) {
        renderChartData(freshData);
    }
}

function selectTicker(symbol) {
    // Open detail chart modal
    openChartDetail(symbol);
}

function selectTickerSmall(symbol) {
    // For market grid - update small chart
    selectedSymbol = symbol;
    document.querySelectorAll('.market-item').forEach(m => m.classList.remove('selected'));
    updateChart();
}

function setTimeframe(tf) {
    currentTimeframe = tf;
    // Only toggle timeframe buttons, not chart type buttons
    const tfMap = { '1d': '1D', '5d': '5D', '1mo': '1M', '3mo': '3M', '1y': '1Y', 'max': 'All' };
    document.querySelectorAll('.chart-controls .chart-btn').forEach(b => {
        const label = b.textContent.trim();
        b.classList.toggle('active', label === tfMap[tf]);
    });
    updateChart();
}

// ============ DETAIL CHART ============
function updateDetailPrice(symbol) {
    const q = priceCache[symbol];
    if (q) {
        document.getElementById('chartDetailPrice').textContent = fp(q.price);
        const changeEl = document.getElementById('chartDetailChange');
        changeEl.textContent = (q.changePercent >= 0 ? '+' : '') + q.changePercent.toFixed(2) + '%';
        changeEl.className = q.changePercent >= 0 ? 'positive' : 'negative';
        
        // Show after-hours price if available
        let ahEl = document.getElementById('chartDetailAH');
        if (!ahEl) {
            ahEl = document.createElement('div');
            ahEl.id = 'chartDetailAH';
            ahEl.style.cssText = 'font-size:0.75rem;margin-top:2px;';
            const priceEl = document.getElementById('chartDetailPrice');
            if (priceEl && priceEl.parentElement) priceEl.parentElement.appendChild(ahEl);
        }
        
        const state = q.marketState;
        if (state !== 'REGULAR' && (q.postMarketPrice || q.preMarketPrice)) {
            const isPost = state === 'POST' || state === 'POSTPOST' || state === 'CLOSED';
            const label = isPost ? 'After Hours' : 'Pre-Market';
            const ahPrice = isPost ? q.postMarketPrice : q.preMarketPrice;
            const ahChange = isPost ? q.postMarketChangePercent : q.preMarketChangePercent;
            if (ahPrice) {
                const sign = ahChange >= 0 ? '+' : '';
                const color = ahChange >= 0 ? '#26a69a' : '#ef5350';
                ahEl.innerHTML = `<span style="color:#787b86;">${label}:</span> <span style="color:${color};" data-price-symbol="${symbol}-ah">${fp(ahPrice)}</span> <span style="color:${color};">${sign}${ahChange.toFixed(2)}%</span>`;
                ahEl.style.display = '';
            }
        } else {
            ahEl.style.display = 'none';
        }
        
        // Add/update after-hours price line on detail chart
        updateAHPriceLine(q);
    }
}

function updateAHPriceLine(quote) {
    if (!detailChart) return;
    const state = quote.marketState;
    const ahPrice = (state === 'POST' || state === 'POSTPOST' || state === 'CLOSED') ? quote.postMarketPrice :
                    (state === 'PRE' || state === 'PREPRE') ? quote.preMarketPrice : null;
    
    // Remove existing AH line
    if (window._ahPriceLine && detailCandleSeries) {
        try { detailCandleSeries.removePriceLine(window._ahPriceLine); } catch(e) {}
        window._ahPriceLine = null;
    }
    
    if (ahPrice && state !== 'REGULAR') {
        const series = detailChartType === 'candle' ? detailCandleSeries : detailMainSeries;
        if (series) {
            window._ahPriceLine = series.createPriceLine({
                price: ahPrice,
                color: '#ff9800',
                lineWidth: 1,
                lineStyle: 2, // dashed
                axisLabelVisible: true,
                title: state === 'POST' || state === 'POSTPOST' || state === 'CLOSED' ? 'AH' : 'PM',
            });
        }
    }
}

// Common crypto tickers that need -USD suffix for Yahoo Finance
const CRYPTO_TICKERS = ['BTC','ETH','SOL','BNB','XRP','ADA','DOGE','DOT','AVAX','MATIC','LTC','LINK','UNI','ATOM','NEAR','APT','ARB','OP','FTM','ALGO','XLM','VET','HBAR','ICP','FIL','SAND','MANA','AXS','AAVE','MKR','CRV','LDO','RPL','IMX','RNDR','INJ','SUI','SEI','TIA','JUP','WIF','PEPE','SHIB','BONK','FLOKI'];

function normalizeSymbol(symbol) {
    const upper = symbol.toUpperCase();
    if (CRYPTO_TICKERS.includes(upper) || CRYPTO_TICKERS.includes(upper.replace('-USD',''))) {
        return upper.endsWith('-USD') ? upper : upper + '-USD';
    }
    return symbol;
}

function openChartDetail(symbol) {
    detailSymbol = normalizeSymbol(symbol);
    detailTimeframe = '1mo';
    detailChartType = 'candle';
    
    // Update header
    document.getElementById('chartDetailTitle').textContent = detailSymbol.replace('-USD', '').replace('^', '');
    updateDetailPrice(detailSymbol);
    
    // Fetch price if not cached
    if (!priceCache[detailSymbol]) {
        document.getElementById('chartDetailPrice').textContent = '...';
        fetch('/api/price/' + encodeURIComponent(detailSymbol))
            .then(r => r.json())
            .then(data => {
                if (data && data.price) {
                    priceCache[detailSymbol] = data;
                    updateDetailPrice(detailSymbol);
                }
            })
            .catch(() => {});
    }
    
    // Update pin button
    const isPinned = pinnedMarkets.includes(symbol);
    document.getElementById('addToMarketsBtn').textContent = isPinned ? '📌 Unpin' : '📌 Pin to Markets';
    
    // Reset MA toggles (off by default)
    const ma100El = document.getElementById('maToggle100');
    const ma200El = document.getElementById('maToggle200');
    if (ma100El) ma100El.checked = false;
    if (ma200El) ma200El.checked = false;
    
    // Reset button states — candle active (index 1), 1M active (index 2)
    document.querySelectorAll('.chart-type-btns .chart-btn').forEach((b, i) => b.classList.toggle('active', i === 1));
    document.querySelectorAll('.chart-tf-btns .chart-btn').forEach((b, i) => b.classList.toggle('active', i === 2));
    
    showModal('chartDetailModal');
    
    // Init chart after modal is visible
    setTimeout(() => {
        initDetailChart();
        updateDetailChart();
    }, 100);
}

// Update last candle on open charts with live price (called from refresh loop)
function updateLastCandle(symbol, price) {
    if (!price || price <= 0) return;
    
    const q = priceCache[symbol];
    const isCrypto = symbol.endsWith('-USD');
    const isExtended = q && !isCrypto && (q.marketState === 'POST' || q.marketState === 'POSTPOST' || q.marketState === 'PRE' || q.marketState === 'PREPRE' || q.marketState === 'CLOSED');
    
    // Update main chart if this symbol is selected
    if (symbol === selectedSymbol && mainSeries && lastChartRawData && lastChartRawData.length > 0) {
        if (isExtended) {
            // Move the AH price line instead of the candle
            if (window._mainAhLine && mainSeries) {
                try { mainSeries.removePriceLine(window._mainAhLine); } catch(e) {}
            }
            const label = (q.marketState === 'POST' || q.marketState === 'POSTPOST' || q.marketState === 'CLOSED') ? 'AH' : 'PM';
            window._mainAhLine = mainSeries.createPriceLine({
                price: price, color: '#ff9800', lineWidth: 1, lineStyle: 2,
                axisLabelVisible: true, title: label
            });
        } else {
            // Regular hours — update the last candle
            const cacheKey = `${selectedSymbol}_${currentTimeframe}`;
            const cached = chartCache[cacheKey];
            if (mainChartType === 'candle' && cached?.ohlc?.length > 0) {
                const last = { ...cached.ohlc[cached.ohlc.length - 1] };
                last.close = price;
                if (price > last.high) last.high = price;
                if (price < last.low) last.low = price;
                try { mainSeries.update(last); } catch(e) {}
            } else if (lastChartRawData.length > 0) {
                const last = { ...lastChartRawData[lastChartRawData.length - 1] };
                last.value = price;
                try { mainSeries.update(last); } catch(e) {}
            }
        }
    }
    
    // Update detail chart if open for this symbol
    if (symbol === detailSymbol) {
        if (isExtended) {
            // Move the AH price line
            if (window._ahPriceLine) {
                const series = detailChartType === 'candle' ? detailCandleSeries : detailMainSeries;
                if (series) {
                    try { series.removePriceLine(window._ahPriceLine); } catch(e) {}
                    const label = (q.marketState === 'POST' || q.marketState === 'POSTPOST' || q.marketState === 'CLOSED') ? 'AH' : 'PM';
                    window._ahPriceLine = series.createPriceLine({
                        price: price, color: '#ff9800', lineWidth: 1, lineStyle: 2,
                        axisLabelVisible: true, title: label
                    });
                }
            }
        } else {
            // Regular hours — update last candle
            const detailCacheKey = `${detailSymbol}_${detailTimeframe}`;
            const cached = chartCache[detailCacheKey];
            if (detailChartType === 'candle' && detailCandleSeries && cached?.ohlc?.length > 0) {
                const last = { ...cached.ohlc[cached.ohlc.length - 1] };
                last.close = price;
                if (price > last.high) last.high = price;
                if (price < last.low) last.low = price;
                try { detailCandleSeries.update(last); } catch(e) {}
            } else if (detailMainSeries && cached?.data?.length > 0) {
                const last = { ...cached.data[cached.data.length - 1] };
                last.value = price;
                try { detailMainSeries.update(last); } catch(e) {}
            }
        }
        // Update the detail price header (AH display)
        updateDetailPrice(detailSymbol);
    }
}
