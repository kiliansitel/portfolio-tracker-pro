// ============ PORTFOLIO — PERFORMANCE & SPARKLINES ============
// ============ PORTFOLIO PERFORMANCE ============
let performanceChart = null;
let performanceSeries = null;
let performanceRange = 30;

async function savePortfolioSnapshot(totalValue, cash, positionsValue) {
    try {
        await api(`/portfolios/${currentPortfolio.id}/snapshot`, {
            method: 'POST',
            body: JSON.stringify({ total_value: totalValue, cash, positions_value: positionsValue })
        });
    } catch (e) {
        console.warn('Failed to save snapshot:', e);
    }
}

let reconstructing = false;

async function reconstructHistory() {
    if (!token || !currentPortfolio || reconstructing) return;
    reconstructing = true;
    
    try {
        showToast('Reconstructing portfolio history...', 'info');
        const result = await api(`/portfolios/${currentPortfolio.id}/reconstruct`, {
            method: 'POST'
        });
        if (result.snapshots > 0) {
            showToast(`Created ${result.snapshots} historical snapshots`, 'success');
            await loadPerformance();
        } else {
            showToast('No historical data to reconstruct', 'info');
        }
    } catch (e) {
        console.warn('Failed to reconstruct:', e);
        showToast('Failed to reconstruct history', 'error');
    } finally {
        reconstructing = false;
    }
}

async function loadPerformance() {
    if (!token || !currentPortfolio) {
        document.getElementById('performanceCard').style.display = 'none';
        return;
    }
    
    try {
        const days = performanceRange || '';
        const data = await api(`/portfolios/${currentPortfolio.id}/performance${days ? '?days=' + days : ''}`);
        
        if (data.snapshots.length < 2) {
            // No snapshots - try to reconstruct from transaction history
            if (!reconstructing) {
                reconstructHistory();
            }
            document.getElementById('performanceCard').style.display = 'none';
            return;
        }
        
        document.getElementById('performanceCard').style.display = 'block';
        renderPerformanceChart(data.snapshots);
        
        // Update summary
        // Compact format for mobile — no decimals for large values
        const fcc = (v) => {
            const abs = Math.abs(v);
            const sym = CURRENCY_SYMBOLS[userCurrency] || userCurrency + ' ';
            if (abs >= 1e6) return sym + (v / 1e6).toFixed(1).replace('.0', '') + 'M';
            if (abs >= 1e3) return sym + (v / 1e3).toFixed(1).replace('.0', '') + 'K';
            return sym + v.toFixed(0);
        };
        document.getElementById('perfStart').textContent = fcc(convertPrice(data.summary.start_value, userCurrency));
        document.getElementById('perfCurrent').textContent = fcc(convertPrice(data.summary.current_value, userCurrency));
        const returnEl = document.getElementById('perfReturn');
        const retSign = data.summary.total_return >= 0 ? '+' : '';
        returnEl.textContent = retSign + fcc(convertPrice(data.summary.total_return, userCurrency)) + ' (' + data.summary.total_return_pct.toFixed(1) + '%)';
        returnEl.className = data.summary.total_return >= 0 ? 'positive' : 'negative';
    } catch (e) {
        console.warn('Failed to load performance:', e);
        document.getElementById('performanceCard').style.display = 'none';
    }
}

function renderPerformanceChart(snapshots) {
    const el = document.getElementById('performanceChartContainer');
    
    // Destroy and recreate to update colors based on performance
    if (performanceChart) {
        performanceChart.remove();
        performanceChart = null;
        performanceSeries = null;
    }

    const chartData = snapshots.map(s => ({ time: s.date, value: convertPrice(s.total_value, userCurrency) }));
    if (!chartData.length) return;

    const isPositive = chartData.length >= 2 ? chartData[chartData.length - 1].value >= chartData[0].value : true;
    const lineColor = isPositive ? '#26a69a' : '#ef5350';
    const topColor = isPositive ? 'rgba(38,166,154,0.4)' : 'rgba(239,83,80,0.4)';
    const bottomColor = isPositive ? 'rgba(38,166,154,0)' : 'rgba(239,83,80,0)';

    performanceChart = LightweightCharts.createChart(el, {
        width: el.clientWidth || 300,
        height: el.clientHeight || 260,
        layout: { background: { type: 'solid', color: '#1e222d' }, textColor: '#d1d4dc' },
        grid: { vertLines: { color: '#2a2e39' }, horzLines: { color: '#2a2e39' } },
        rightPriceScale: {
            borderColor: '#363a45',
            scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
            borderColor: '#363a45',
            fixLeftEdge: true,
            tickMarkFormatter: (time) => {
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                if (typeof time === 'string') {
                    const parts = time.split('-');
                    return months[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10);
                }
                const d = new Date(time * 1000);
                return months[d.getUTCMonth()] + ' ' + d.getUTCDate();
            }
        },
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
                if (abs >= 1e6) return cs() + (price / 1e6).toFixed(1).replace('.0', '') + 'M';
                if (abs >= 1e3) return cs() + (price / 1e3).toFixed(1).replace('.0', '') + 'K';
                return cs() + price.toFixed(2);
            }
        }
    });

    performanceSeries = performanceChart.addAreaSeries({
        topColor, bottomColor, lineColor, lineWidth: 2,
        priceFormat: {
            type: 'custom',
            formatter: (price) => {
                const abs = Math.abs(price);
                if (abs >= 1e6) return cs() + (price / 1e6).toFixed(1).replace('.0', '') + 'M';
                if (abs >= 1e3) return cs() + (price / 1e3).toFixed(1).replace('.0', '') + 'K';
                return cs() + price.toFixed(2);
            }
        }
    });

    new ResizeObserver(entries => {
        const r = entries[0].contentRect;
        if (performanceChart && r.width > 0) performanceChart.applyOptions({ width: r.width });
    }).observe(el);

    performanceSeries.setData(chartData);
    performanceChart.timeScale().fitContent();
}

// ============ SPARKLINES ============
const sparklineCharts = {};

async function loadSparklines(positions) {
    for (const pos of positions) {
        const elId = 'spark-' + pos.symbol.replace(/[^a-zA-Z0-9]/g, '_');
        const el = document.getElementById(elId);
        if (!el) continue;
        
        try {
            const data = await api(`/history/${encodeURIComponent(pos.symbol)}?limit=30`);
            if (!data || !data.length || data.length < 2) continue;
            
            const chartData = data.map(d => ({ time: d.date || d.time, value: d.close || d.price || d.value })).filter(d => d.time && d.value);
            if (chartData.length < 2) continue;
            
            // Sort by time
            chartData.sort((a, b) => a.time.localeCompare(b.time));
            
            const isUp = chartData[chartData.length - 1].value >= chartData[0].value;
            const color = isUp ? '#26a69a' : '#ef5350';
            
            // Clean up previous
            if (sparklineCharts[elId]) {
                try { sparklineCharts[elId].remove(); } catch(e) {}
            }
            el.innerHTML = '';
            
            const sparkChart = LightweightCharts.createChart(el, {
                width: 60, height: 24,
                handleScroll: false, handleScale: false,
                crosshair: { mode: 0 },
                grid: { vertLines: { visible: false }, horzLines: { visible: false } },
                leftPriceScale: { visible: false },
                rightPriceScale: { visible: false },
                timeScale: { visible: false },
                layout: { background: { type: 'solid', color: 'transparent' }, textColor: 'transparent' },
            });
            
            const series = sparkChart.addAreaSeries({
                topColor: isUp ? 'rgba(38,166,154,0.3)' : 'rgba(239,83,80,0.3)',
                bottomColor: 'transparent',
                lineColor: color,
                lineWidth: 1.5,
                crosshairMarkerVisible: false,
                priceLineVisible: false,
                lastValueVisible: false,
            });
            series.setData(chartData);
            sparkChart.timeScale().fitContent();
            sparklineCharts[elId] = sparkChart;
        } catch (e) {
            console.warn('[portfolio] sparkline render failed for', elId, ':', e.message);
        }
    }
}

function calcRSI(data, period = 14) {
    const result = [];
    if (data.length < period + 1) return result;
    let gainSum = 0, lossSum = 0;
    for (let i = 1; i <= period; i++) {
        const diff = data[i].value - data[i-1].value;
        if (diff >= 0) gainSum += diff; else lossSum -= diff;
    }
    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push({ time: data[period].time, value: Math.round((100 - 100 / (1 + rs)) * 100) / 100 });
    for (let i = period + 1; i < data.length; i++) {
        const diff = data[i].value - data[i-1].value;
        const gain = diff >= 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        const r = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push({ time: data[i].time, value: Math.round((100 - 100 / (1 + r)) * 100) / 100 });
    }
    return result;
}

function setPerformanceRange(days) {
    performanceRange = days;
    document.querySelectorAll('#performanceCard .chart-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    loadPerformance();
