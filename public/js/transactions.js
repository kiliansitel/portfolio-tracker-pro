// ============ EXPORT ============
function exportPositionsCSV() {
    if (!positions.length) {
        alert('No positions to export');
        return;
    }
    
    const headers = ['Symbol', 'Name', 'Type', 'Quantity', 'Entry Price', 'Current Price', 'P&L', 'P&L %', 'Notes'];
    const rows = positions.map(pos => {
        const q = priceCache[pos.symbol];
        const optSym = pos.type === 'option' ? buildOptionSymbol(pos.symbol, pos.expiry_date, pos.strike_price) : null;
        const optQuote = optSym ? priceCache[optSym] : null;
        const currentPrice = pos.type === 'option' ? (optQuote?.price || pos.current_price || pos.entry_price) : (q?.price || pos.entry_price);
        const mult = pos.multiplier || (pos.type === 'option' ? 100 : 1);
        const hasValidCost = pos.entry_price > 0;
        const cost = hasValidCost ? pos.entry_price * pos.quantity * mult : 0;
        const value = currentPrice * pos.quantity * mult;
        const pnl = hasValidCost ? value - cost : 0;
        const pnlPct = hasValidCost && cost > 0 ? (pnl / cost) * 100 : 0;
        return [
            pos.symbol,
            pos.name || '',
            pos.type,
            pos.quantity,
            pos.entry_price > 0 ? pos.entry_price.toFixed(2) : 'N/A',
            currentPrice.toFixed(2),
            hasValidCost ? pnl.toFixed(2) : 'N/A',
            hasValidCost ? pnlPct.toFixed(2) + '%' : 'N/A',
            (pos.notes || '').replace(/,/g, ';')
        ];
    });
    
    downloadCSV([headers, ...rows], 'portfolio-positions.csv');
}

function exportWatchlistCSV() {
    if (!watchlist.length) {
        alert('No watchlist items to export');
        return;
    }
    
    const headers = ['Symbol', 'Name', 'Category', 'Current Price', 'Change %', 'Alert Below', 'Alert Above'];
    const rows = watchlist.map(item => {
        const q = priceCache[item.symbol];
        return [
            item.symbol,
            item.name || '',
            item.category || 'general',
            q?.price?.toFixed(2) || '--',
            q?.changePercent?.toFixed(2) + '%' || '--',
            item.alert_below || '',
            item.alert_above || ''
        ];
    });
    
    downloadCSV([headers, ...rows], 'watchlist.csv');
}

function downloadCSV(data, filename) {
    const csv = data.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

function exportPDF() {
    // Create a printable HTML report
    const cash = currentPortfolio?.cash || 0; // Raw USD
    let totalValue = 0;
    let totalCost = 0;
    
    positions.forEach(pos => {
        const q = priceCache[pos.symbol];
        const optSym = pos.type === 'option' ? buildOptionSymbol(pos.symbol, pos.expiry_date, pos.strike_price) : null;
        const optQuote = optSym ? priceCache[optSym] : null;
        const currentPrice = pos.type === 'option' ? (optQuote?.price || pos.current_price || pos.entry_price) : (q?.price || pos.entry_price);
        const mult = pos.multiplier || (pos.type === 'option' ? 100 : 1);
        totalValue += currentPrice * pos.quantity * mult;
        if (pos.entry_price > 0) {
            totalCost += pos.entry_price * pos.quantity * mult;
        }
    });
    
    const pnl = totalCost > 0 ? totalValue - totalCost : 0;
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Portfolio Report - ${new Date().toLocaleDateString()}</title>
    <style>
body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
h1 { color: #2962ff; }
.summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0; }
.summary-card { background: #f5f5f5; padding: 15px; border-radius: 8px; }
.summary-label { color: #666; font-size: 0.9rem; }
.summary-value { font-size: 1.5rem; font-weight: bold; }
.positive { color: #26a69a; }
.negative { color: #ef5350; }
table { width: 100%; border-collapse: collapse; margin: 20px 0; }
th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
th { background: #f5f5f5; }
.section-title { margin-top: 30px; border-bottom: 2px solid #2962ff; padding-bottom: 5px; }
@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style>
</head>
<body>
    <h1>📊 Portfolio Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
    
    <div class="summary">
<div class="summary-card">
    <div class="summary-label">Portfolio Value</div>
    <div class="summary-value">${fc(totalValue + cash)}</div>
</div>
<div class="summary-card">
    <div class="summary-label">Total P&L</div>
    <div class="summary-value ${pnl >= 0 ? 'positive' : 'negative'}">${pnl >= 0 ? '+' : ''}${fc(pnl)} (${pnlPct.toFixed(2)}%)</div>
</div>
<div class="summary-card">
    <div class="summary-label">Cash</div>
    <div class="summary-value">${fc(cash)}</div>
</div>
<div class="summary-card">
    <div class="summary-label">Positions</div>
    <div class="summary-value">${positions.length}</div>
</div>
    </div>
    
    <h2 class="section-title">💼 Positions</h2>
    <table>
<thead>
    <tr><th>Symbol</th><th>Type</th><th>Qty</th><th>Entry</th><th>Current</th><th>P&L</th></tr>
</thead>
<tbody>
    ${positions.map(pos => {
        const q = priceCache[pos.symbol];
        const optSym = pos.type === 'option' ? buildOptionSymbol(pos.symbol, pos.expiry_date, pos.strike_price) : null;
        const optQuote = optSym ? priceCache[optSym] : null;
        const currentPrice = pos.type === 'option' ? (optQuote?.price || pos.current_price || pos.entry_price) : (q?.price || pos.entry_price);
        const mult = pos.multiplier || (pos.type === 'option' ? 100 : 1);
        const cost = pos.entry_price * pos.quantity * mult;
        const value = currentPrice * pos.quantity * mult;
        const pl = value - cost;
        return `<tr>
            <td><strong>${pos.symbol}</strong></td>
            <td>${pos.type}</td>
            <td>${pos.quantity}</td>
            <td>${fp(pos.entry_price)}</td>
            <td>${fp(currentPrice)}</td>
            <td class="${pl >= 0 ? 'positive' : 'negative'}">${pl >= 0 ? '+' : ''}${fc(pl)}</td>
        </tr>`;
    }).join('')}
</tbody>
    </table>
    
    <h2 class="section-title">👁️ Watchlist</h2>
    <table>
<thead>
    <tr><th>Symbol</th><th>Category</th><th>Price</th><th>Change</th><th>Target</th></tr>
</thead>
<tbody>
    ${watchlist.map(item => {
        const q = priceCache[item.symbol];
        return `<tr>
            <td><strong>${item.symbol}</strong></td>
            <td>${item.category || 'general'}</td>
            <td>${q?.price ? fp(q.price) : '--'}</td>
            <td class="${(q?.changePercent || 0) >= 0 ? 'positive' : 'negative'}">${q?.changePercent ? (q.changePercent >= 0 ? '+' : '') + q.changePercent.toFixed(2) + '%' : '--'}</td>
            <td>${item.alert_below ? '$' + item.alert_below : '--'}</td>
        </tr>`;
    }).join('')}
</tbody>
    </table>
    
    <p style="color: #666; margin-top: 40px; font-size: 0.9rem;">
Generated by Portfolio Tracker Pro | Data from Yahoo Finance
    </p>
</body>
</html>`;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
}

// ============ IMPORT ============

// Detect broker CSV format and return column mapping
function detectBrokerFormat(headers) {
    const h = headers.map(x => x.toLowerCase().trim());
    const joined = h.join('|');
    
    // Keytrade Bank (Belgian broker)
    if (joined.includes('isin') && (joined.includes('beurs') || joined.includes('exchange')) && joined.includes('hoeveelheid')) {
        return {
            broker: 'Keytrade Bank',
            symbol: h.findIndex(x => x.includes('isin') || x.includes('ticker') || x.includes('symbool')),
            name: h.findIndex(x => x.includes('naam') || x.includes('name') || x.includes('omschrijving')),
            qty: h.findIndex(x => x.includes('hoeveelheid') || x.includes('aantal')),
            price: h.findIndex(x => x.includes('koers') || x.includes('prijs') || x.includes('aankoopprijs')),
            type: -1,
            location: -1,
            notes: -1,
            separator: ';'
        };
    }
    // IBKR / Interactive Brokers
    if (joined.includes('financial instrument') || (joined.includes('symbol') && joined.includes('asset class'))) {
        return {
            broker: 'Interactive Brokers',
            symbol: h.findIndex(x => x === 'symbol'),
            name: h.findIndex(x => x.includes('description') || x.includes('financial instrument')),
            qty: h.findIndex(x => x.includes('quantity') || x.includes('position')),
            price: h.findIndex(x => x.includes('cost basis') || x.includes('avg price') || x.includes('cost price')),
            type: h.findIndex(x => x.includes('asset class')),
            location: -1,
            notes: -1,
        };
    }
    // DeGiro
    if (joined.includes('product') && joined.includes('lokale waarde')) {
        return {
            broker: 'DeGiro',
            symbol: h.findIndex(x => x.includes('isin') || x.includes('symbol')),
            name: h.findIndex(x => x.includes('product')),
            qty: h.findIndex(x => x.includes('aantal') || x.includes('quantity')),
            price: h.findIndex(x => x.includes('koers') || x.includes('slotkoers') || x.includes('prijs')),
            type: -1,
            location: -1,
            notes: -1,
        };
    }
    // CoinMarketCap Portfolio
    if (joined.includes('coin') || (joined.includes('name') && (joined.includes('buy price') || joined.includes('avg buy price') || joined.includes('holdings')))) {
        return {
            broker: 'CoinMarketCap',
            symbol: h.findIndex(x => x === 'symbol' || x === 'ticker'),
            name: h.findIndex(x => x === 'name' || x === 'coin'),
            qty: h.findIndex(x => x.includes('quantity') || x.includes('amount') || x.includes('holdings')),
            price: h.findIndex(x => x.includes('buy price') || x.includes('avg buy price') || x.includes('cost basis') || x.includes('avg price')),
            type: -1,
            location: -1,
            notes: h.findIndex(x => x === 'notes'),
        };
    }
    // Generic / Portfolio Tracker Pro format
    return {
        broker: 'Generic',
        symbol: h.findIndex(x => x.includes('symbol') || x.includes('ticker') || x.includes('isin')),
        name: h.findIndex(x => x.includes('name')),
        qty: h.findIndex(x => x.includes('quantity') || x.includes('qty') || x.includes('shares') || x.includes('amount')),
        price: h.findIndex(x => x.includes('entry') || x.includes('price') || x.includes('cost') || x.includes('avg')),
        type: h.findIndex(x => x.includes('type') || x.includes('class')),
        location: h.findIndex(x => x.includes('location') || x.includes('exchange') || x.includes('broker')),
        notes: h.findIndex(x => x.includes('notes') || x.includes('comment')),
    };
}

async function importPositionsCSV(input) {
    const file = input.files[0];
    if (!file) return;
    
    if (!token || !portfolioId) {
        alert('Please login first');
        return;
    }
    
    try {
        const text = await file.text();
        // Detect separator (semicolon for some European brokers)
        const firstLine = text.split('\n')[0];
        const sep = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
        
        const lines = text.trim().split('\n');
        const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, ''));
        
        const format = detectBrokerFormat(headers);
        if (format.broker !== 'Generic') {
            showToast(`Detected ${format.broker} format`, 'success');
        }
        
        // Find column indices (use detected format, fall back to generic search)
        const symbolIdx = format.symbol >= 0 ? format.symbol : headers.findIndex(h => h.toLowerCase().includes('symbol'));
        const nameIdx = format.name >= 0 ? format.name : headers.findIndex(h => h.toLowerCase().includes('name'));
        const typeIdx = format.type >= 0 ? format.type : headers.findIndex(h => h.toLowerCase().includes('type'));
        const qtyIdx = format.qty >= 0 ? format.qty : headers.findIndex(h => h.toLowerCase().includes('quantity') || h.toLowerCase().includes('qty'));
        const priceIdx = format.price >= 0 ? format.price : headers.findIndex(h => h.toLowerCase().includes('entry') || h.toLowerCase().includes('price') || h.toLowerCase().includes('cost'));
        const locationIdx = format.location >= 0 ? format.location : headers.findIndex(h => h.toLowerCase().includes('location'));
        const notesIdx = format.notes >= 0 ? format.notes : headers.findIndex(h => h.toLowerCase().includes('notes'));
        
        if (symbolIdx === -1 || qtyIdx === -1 || priceIdx === -1) {
            alert(`CSV must have Symbol, Quantity, and Price columns.\nDetected columns: ${headers.join(', ')}`);
            return;
        }
        
        let imported = 0;
        let failed = 0;
        
        for (let i = 1; i < lines.length; i++) {
            const cols = sep === ';' ? lines[i].split(';').map(c => c.trim().replace(/^["']|["']$/g, '')) : parseCSVLine(lines[i]);
            if (cols.length < 3) continue;
            
            const symbol = cols[symbolIdx]?.trim().toUpperCase();
            const quantity = parseFloat(cols[qtyIdx]?.replace(/[,]/g, '.').replace(/[^\d.\-]/g, ''));
            const entry_price = parseFloat(cols[priceIdx]?.replace(/[,]/g, '.').replace(/[$€£\s]/g, ''));
            
            if (!symbol || isNaN(quantity) || isNaN(entry_price)) {
                failed++;
                continue;
            }
            
            try {
                const body = {
                    symbol,
                    name: nameIdx >= 0 ? cols[nameIdx]?.trim() : '',
                    type: typeIdx >= 0 ? cols[typeIdx]?.toLowerCase() || 'stock' : (format.broker === 'CoinMarketCap' ? 'crypto' : 'stock'),
                    quantity,
                    entry_price,
                    notes: notesIdx >= 0 ? cols[notesIdx]?.trim() : ''
                };
                if (locationIdx >= 0 && cols[locationIdx]?.trim()) {
                    body.location = cols[locationIdx].trim();
                }
                await api(`/portfolios/${portfolioId}/positions`, {
                    method: 'POST',
                    body: JSON.stringify(body)
                });
                imported++;
            } catch (e) {
                failed++;
            }
        }
        
        showToast(`Imported ${imported} positions` + (failed > 0 ? `, ${failed} failed` : ''), imported > 0 ? 'success' : 'error');
        await loadPortfolio();
        renderPositions();
        updateSummary();
    } catch (e) {
        alert('Failed to import: ' + e.message);
    }
    
    input.value = ''; // Reset file input
}

async function importWatchlistCSV(input) {
    const file = input.files[0];
    if (!file) return;
    
    if (!token || !watchlistId) {
        alert('Please login first');
        return;
    }
    
    try {
        const text = await file.text();
        const lines = text.trim().split('\n');
        const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
        
        const symbolIdx = headers.findIndex(h => h.includes('symbol'));
        const nameIdx = headers.findIndex(h => h.includes('name'));
        const catIdx = headers.findIndex(h => h.includes('category') || h.includes('cat'));
        const belowIdx = headers.findIndex(h => h.includes('below') || h.includes('buy'));
        const aboveIdx = headers.findIndex(h => h.includes('above') || h.includes('sell'));
        
        if (symbolIdx === -1) {
            alert('CSV must have a Symbol column');
            return;
        }
        
        let imported = 0;
        let failed = 0;
        
        for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]);
            const symbol = cols[symbolIdx]?.trim().toUpperCase();
            
            if (!symbol) {
                failed++;
                continue;
            }
            
            try {
                await api(`/watchlists/${watchlistId}/items`, {
                    method: 'POST',
                    body: JSON.stringify({
                        symbol,
                        name: nameIdx >= 0 ? cols[nameIdx] : '',
                        category: catIdx >= 0 ? cols[catIdx] || 'general' : 'general',
                        alert_below: belowIdx >= 0 ? parseFloat(cols[belowIdx]) || null : null,
                        alert_above: aboveIdx >= 0 ? parseFloat(cols[aboveIdx]) || null : null
                    })
                });
                imported++;
            } catch (e) {
                failed++;
            }
        }
        
        alert(`Imported ${imported} watchlist items` + (failed > 0 ? `, ${failed} failed` : ''));
        await loadWatchlists();
        renderWatchlist();
        renderAlerts();
    } catch (e) {
        alert('Failed to import: ' + e.message);
    }
    
    input.value = '';
}

// Parse CSV line handling quoted values
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

