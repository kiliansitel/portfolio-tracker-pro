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
        rightPriceScale: { borderColor: '#363a45' },
        timeScale: { borderColor: '#363a45', timeVisible: true }
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
    if (ma20Series) { try { chart.removeSeries(ma20Series); } catch(e){} ma20Series = null; }
    if (ma50Series) { try { chart.removeSeries(ma50Series); } catch(e){} ma50Series = null; }
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
    
    if (mainMA20On) { ma20Series = chart.addLineSeries({ color: '#f7931a', lineWidth: 1 }); }
    if (mainMA50On) { ma50Series = chart.addLineSeries({ color: '#627eea', lineWidth: 1 }); }
    if (mainMA200On) { ma200Series = chart.addLineSeries({ color: '#e91e63', lineWidth: 1 }); }
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
    
    // Moving averages
    const showMA = data.length >= 20 && ['1mo', '3mo', '1y'].includes(currentTimeframe);
    if (ma20Series) ma20Series.setData(showMA && mainMA20On ? calcMA(data, 20) : []);
    if (ma50Series) ma50Series.setData(showMA && mainMA50On && data.length >= 50 ? calcMA(data, 50) : []);
    if (ma200Series) ma200Series.setData(showMA && mainMA200On && data.length >= 200 ? calcMA(data, 200) : []);
    
    chart.timeScale().fitContent();
    
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
    if (period === 20) mainMA20On = document.getElementById('mainMA20').checked;
    if (period === 50) mainMA50On = document.getElementById('mainMA50').checked;
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
    document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    updateChart();
}

// ============ DETAIL CHART ============
function openChartDetail(symbol) {
    detailSymbol = symbol;
    detailTimeframe = '1mo';
    detailChartType = 'area';
    
    // Update header
    const q = priceCache[symbol];
    document.getElementById('chartDetailTitle').textContent = symbol.replace('-USD', '').replace('^', '');
    if (q) {
        document.getElementById('chartDetailPrice').textContent = fp(q.price);
        const changeEl = document.getElementById('chartDetailChange');
        changeEl.textContent = (q.changePercent >= 0 ? '+' : '') + q.changePercent.toFixed(2) + '%';
        changeEl.className = q.changePercent >= 0 ? 'positive' : 'negative';
    }
    
    // Update pin button
    const isPinned = pinnedMarkets.includes(symbol);
    document.getElementById('addToMarketsBtn').textContent = isPinned ? '📌 Unpin' : '📌 Pin to Markets';
    
    // Reset MA toggles
    document.getElementById('maToggle20').checked = true;
    document.getElementById('maToggle50').checked = true;
    document.getElementById('maToggle200').checked = false;
    
    // Reset button states
    document.querySelectorAll('.chart-type-btns .chart-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    document.querySelectorAll('.chart-tf-btns .chart-btn').forEach((b, i) => b.classList.toggle('active', i === 2));
    
    showModal('chartDetailModal');
    
    // Init chart after modal is visible
    setTimeout(() => {
        initDetailChart();
        updateDetailChart();
    }, 100);
}

