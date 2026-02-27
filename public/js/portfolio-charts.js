// ============ PORTFOLIO — ALLOCATION & EXPOSURE CHARTS ============
// ============ ALLOCATION CHART ============
let allocationSlices = []; // Store slices for hover detection

function renderAllocation(positionsValue, cash) {
    const card = document.getElementById('allocationCard');
    const canvas = document.getElementById('allocationChart');
    const legend = document.getElementById('allocationLegend');
    const tooltip = document.getElementById('allocationTooltip');
    
    if (positions.length === 0 && cash === 0) {
        card.style.display = 'none';
        return;
    }
    card.style.display = 'block';
    allocationSlices = []; // Reset slices
    
    // Calculate allocations
    const allocations = [];
    const colors = [
        '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
        '#1abc9c', '#e91e63', '#00bcd4', '#ff5722', '#8bc34a',
        '#673ab7', '#009688', '#ff9800', '#795548', '#607d8b',
        '#4caf50', '#03a9f4', '#cddc39', '#ff4081', '#7c4dff'
    ];
    
    // Add positions
    for (const pos of positions) {
        let currentPrice;
        if (pos.type === 'option') {
            // Try to get option price from cache (using constructed symbol) - same as positions display
            const optSym = buildOptionSymbol(pos.symbol, pos.expiry_date, pos.strike_price);
            const optQuote = optSym ? priceCache[optSym] : null;
            currentPrice = optQuote?.price || pos.current_price || pos.entry_price;
        } else {
            const q = priceCache[pos.symbol];
            currentPrice = q?.price || pos.entry_price;
        }
        // Options default to 100x multiplier
        const mult = pos.multiplier || (pos.type === 'option' ? 100 : 1);
        const value = currentPrice * pos.quantity * mult;
        if (value > 0) {
            allocations.push({ label: pos.symbol, value, type: pos.type });
        }
    }
    
    // Add cash
    if (cash > 0) {
        allocations.push({ label: 'Cash', value: cash, type: 'cash' });
    }
    
    // Sort by value descending
    allocations.sort((a, b) => b.value - a.value);
    
    const total = allocations.reduce((sum, a) => sum + a.value, 0);
    
    // Draw donut chart
    const ctx = canvas.getContext('2d');
    // Responsive canvas size
    const size = Math.min(160, canvas.parentElement?.offsetWidth || 160);
    canvas.width = size;
    canvas.height = size;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 5;
    const innerRadius = radius * 0.6;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let startAngle = -Math.PI / 2; // Start at top
    
    allocations.forEach((alloc, i) => {
        const sliceAngle = (alloc.value / total) * 2 * Math.PI;
        const color = alloc.type === 'cash' ? '#95a5a6' : colors[i % colors.length];
        alloc.color = color;
        
        // Store slice data for hover detection
        allocationSlices.push({
            ...alloc,
            startAngle,
            endAngle: startAngle + sliceAngle,
            pct: (alloc.value / total) * 100
        });
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.arc(centerX, centerY, innerRadius, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        
        startAngle += sliceAngle;
    });
    
    // Add hover listener
    canvas.onmousemove = (e) => handleAllocationHover(e, canvas, tooltip, centerX, centerY, radius, innerRadius);
    canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
    
    // Draw center text
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#fff';
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cs() + (convertPrice(total, userCurrency)/1000).toFixed(1).replace('.0', '') + 'K', centerX, centerY - 8);
    ctx.font = '11px system-ui';
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#888';
    ctx.fillText('Total', centerX, centerY + 10);
    
    // Render legend
    legend.innerHTML = allocations.slice(0, 8).map(alloc => {
        const pct = ((alloc.value / total) * 100).toFixed(1);
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <div style="width:12px;height:12px;border-radius:3px;background:${alloc.color};flex-shrink:0;"></div>
            <div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${alloc.label}</div>
            <div style="color:var(--text-secondary);font-size:0.8rem;">${pct}%</div>
        </div>`;
    }).join('') + (allocations.length > 8 ? `<div style="color:var(--text-secondary);font-size:0.8rem;">+${allocations.length - 8} more</div>` : '');
}

function handleAllocationHover(e, canvas, tooltip, centerX, centerY, radius, innerRadius) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if mouse is in donut area
    const dx = x - centerX;
    const dy = y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < innerRadius || dist > radius) {
        tooltip.style.display = 'none';
        return;
    }
    
    // Get angle
    let angle = Math.atan2(dy, dx);
    if (angle < -Math.PI / 2) angle += 2 * Math.PI; // Adjust for starting at top
    angle += Math.PI / 2; // Offset since we start at top
    if (angle > 2 * Math.PI) angle -= 2 * Math.PI;
    
    // Find which slice
    for (const slice of allocationSlices) {
        let start = slice.startAngle + Math.PI / 2;
        let end = slice.endAngle + Math.PI / 2;
        if (start < 0) start += 2 * Math.PI;
        if (end < 0) end += 2 * Math.PI;
        
        if (angle >= start && angle < end) {
            tooltip.innerHTML = `
                <div style="font-weight:600;color:${slice.color};">${slice.label}</div>
                <div>${fc(slice.value)}</div>
                <div style="color:var(--text-secondary);">${slice.pct.toFixed(1)}%</div>
            `;
            tooltip.style.display = 'block';
            tooltip.style.left = (x + 15) + 'px';
            tooltip.style.top = (y - 10) + 'px';
            return;
        }
    }
    
    tooltip.style.display = 'none';
}

// ============ EXPOSURE TABS (Sectors & Regions) ============
let exposureData = null;
let sectorSlices = [];
let regionSlices = [];

function switchExposureTab(tab) {
    document.querySelectorAll('.exposure-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('exposureAllocation').style.display = tab === 'allocation' ? 'flex' : 'none';
    document.getElementById('exposureSectors').style.display = tab === 'sectors' ? 'flex' : 'none';
    document.getElementById('exposureRegions').style.display = tab === 'regions' ? 'flex' : 'none';
    
    if ((tab === 'sectors' || tab === 'regions') && !exposureData) {
        loadExposureData();
    }
}

async function loadExposureData() {
    if (!token || !currentPortfolio) return;
    try {
        exposureData = await api(`/portfolios/${currentPortfolio.id}/exposure`);
        renderExposureDonut('sector', exposureData.bySector, 'sector');
        renderExposureDonut('region', exposureData.byRegion, 'region');
    } catch (e) {
        console.warn('Failed to load exposure data:', e);
    }
}

const SECTOR_COLORS = {
    'Technology': '#3498db', 'Healthcare': '#2ecc71', 'Financial Services': '#f1c40f',
    'Energy': '#e67e22', 'Consumer Cyclical': '#9b59b6', 'Consumer Defensive': '#8e44ad',
    'Industrials': '#7f8c8d', 'Real Estate': '#795548', 'Communication Services': '#e91e63',
    'Utilities': '#00bcd4', 'Basic Materials': '#ff5722', 'Crypto': '#f39c12', 'Unknown': '#607d8b'
};
const REGION_COLORS = {
    'North America': '#3498db', 'Europe': '#2ecc71', 'Asia': '#e74c3c',
    'Crypto/Digital': '#f39c12', 'Oceania': '#1abc9c', 'Latin America': '#9b59b6',
    'Middle East & Africa': '#e67e22', 'Other': '#7f8c8d', 'Unknown': '#607d8b'
};

function renderExposureDonut(type, data, labelKey) {
    const canvas = document.getElementById(type + 'Chart');
    const legend = document.getElementById(type + 'Legend');
    const tooltip = document.getElementById(type + 'Tooltip');
    if (!canvas || !data || data.length === 0) return;
    
    const slices = [];
    const colorMap = type === 'sector' ? SECTOR_COLORS : REGION_COLORS;
    const fallbackColors = ['#3498db','#e74c3c','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e91e63','#00bcd4','#ff5722','#8bc34a'];
    
    const total = data.reduce((s, d) => s + d.totalValue, 0);
    if (total <= 0) return;
    
    const ctx = canvas.getContext('2d');
    const size = Math.min(160, canvas.parentElement?.offsetWidth || 160);
    canvas.width = size;
    canvas.height = size;
    const centerX = size / 2, centerY = size / 2;
    const radius = Math.min(centerX, centerY) - 5;
    const innerRadius = radius * 0.6;
    ctx.clearRect(0, 0, size, size);
    
    let startAngle = -Math.PI / 2;
    data.forEach((item, i) => {
        const label = item[labelKey];
        const color = colorMap[label] || fallbackColors[i % fallbackColors.length];
        const sliceAngle = (item.totalValue / total) * 2 * Math.PI;
        item.color = color;
        
        slices.push({ label, value: item.totalValue, color, startAngle, endAngle: startAngle + sliceAngle, pct: item.percentage, positions: item.positions });
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.arc(centerX, centerY, innerRadius, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        startAngle += sliceAngle;
    });
    
    if (type === 'sector') sectorSlices = slices;
    else regionSlices = slices;
    
    // Center text
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#fff';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.length + (type === 'sector' ? ' Sectors' : ' Regions'), centerX, centerY - 8);
    ctx.font = '11px system-ui';
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#888';
    ctx.fillText(cs() + (convertPrice(total, userCurrency)/1000).toFixed(1).replace('.0', '') + 'K', centerX, centerY + 10);
    
    // Hover
    canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        const dx = x - centerX, dy = y - centerY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < innerRadius || dist > radius) { tooltip.style.display = 'none'; return; }
        let angle = Math.atan2(dy, dx);
        if (angle < -Math.PI/2) angle += 2*Math.PI;
        angle += Math.PI/2;
        if (angle > 2*Math.PI) angle -= 2*Math.PI;
        for (const s of slices) {
            let st = s.startAngle + Math.PI/2, en = s.endAngle + Math.PI/2;
            if (st < 0) st += 2*Math.PI;
            if (en < 0) en += 2*Math.PI;
            if (angle >= st && angle < en) {
                const posNames = s.positions.map(p => p.symbol).slice(0, 5).join(', ');
                tooltip.innerHTML = `<div style="font-weight:600;color:${s.color};">${s.label}</div><div>${fc(s.value)}</div><div style="color:var(--text-secondary);">${s.pct.toFixed(1)}%</div><div style="color:var(--text-secondary);font-size:0.75rem;margin-top:2px;">${posNames}${s.positions.length > 5 ? '...' : ''}</div>`;
                tooltip.style.display = 'block';
                tooltip.style.left = (x+15)+'px';
                tooltip.style.top = (y-10)+'px';
                return;
            }
        }
        tooltip.style.display = 'none';
    };
    canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
    
    // Legend
    legend.innerHTML = data.slice(0, 8).map(item => {
        const pct = item.percentage.toFixed(1);
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <div style="width:12px;height:12px;border-radius:3px;background:${item.color};flex-shrink:0;"></div>
            <div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item[labelKey]}</div>
            <div style="color:var(--text-secondary);font-size:0.8rem;">${pct}%</div>
        </div>`;
    }).join('') + (data.length > 8 ? `<div style="color:var(--text-secondary);font-size:0.8rem;">+${data.length - 8} more</div>` : '');
}
