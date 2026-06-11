// ============ PORTFOLIO — CORE (positions, markets, summary) ============
// Sub-modules (loaded via separate <script> tags in index.html):
//   portfolio-watchlist.js    — watchlist rendering, swipe handlers, edit
//   portfolio-charts.js       — allocation donut, exposure tabs (sectors/regions)
//   portfolio-performance.js  — snapshots, reconstruct, performance chart, sparklines, RSI
//   portfolio-dividends.js    — dividend calendar
//   portfolio-close.js        — close position modal & logic

// Toggle position group collapse (same pattern as watchlist toggleCategory)
function togglePosGroup(group) {
    const header = event.currentTarget;
    const items = document.getElementById(`pos-group-${group}`);
    const isCollapsed = header.classList.toggle('collapsed');

    if (isCollapsed) {
        items.style.maxHeight = items.scrollHeight + 'px';
        requestAnimationFrame(() => {
            items.style.maxHeight = '0px';
        });
    } else {
        items.style.maxHeight = items.scrollHeight + 'px';
        items.addEventListener('transitionend', function handler() {
            items.style.maxHeight = 'none';
            items.removeEventListener('transitionend', handler);
        }, { once: true });
    }

    let collapsed = JSON.parse(localStorage.getItem('collapsedPosGroups') || '[]');
    if (isCollapsed) {
        if (!collapsed.includes(group)) collapsed.push(group);
    } else {
        collapsed = collapsed.filter(c => c !== group);
    }
    localStorage.setItem('collapsedPosGroups', JSON.stringify(collapsed));
}

function filterPositions(query) {
    const cards = document.querySelectorAll('#positionsList .position-card');
    const q = query.toLowerCase().trim();
    let groups = document.querySelectorAll('#positionsList [style*="text-transform:uppercase"]');
    
    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = (!q || text.includes(q)) ? '' : 'none';
    });
    
    // Also filter group headers - hide if all children hidden
    groups.forEach(group => {
        let next = group.nextElementSibling;
        let hasVisible = false;
        while (next && !next.style?.textTransform?.includes('uppercase') && !next.matches?.('[style*="text-transform:uppercase"]')) {
            if (next.classList?.contains('position-card') && next.style.display !== 'none') {
                hasVisible = true;
            }
            next = next.nextElementSibling;
            if (!next || (next.textContent?.includes('▶') && next.style?.textTransform)) break;
        }
        group.style.display = (!q || hasVisible) ? '' : 'none';
    });
}

function renderPositions() {
    const el = document.getElementById('positionsList');
    try {
    // Restore sort dropdown
    const sortSel = document.getElementById('positionSortSelect');
    if (sortSel && !sortSel._restored) {
        sortSel.value = localStorage.getItem('positionSort') || 'default';
        sortSel._restored = true;
    }
    
    if (positions === null || positions === undefined) {
        el.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';
        return;
    }
    if (positions.length === 0) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💼</div><div class="empty-state-text">No positions yet. Add your first position with the + button above!</div><button class="btn btn-primary" onclick="showAddPositionModal()">Add Your First Position</button></div>';
        return;
    }
    
    // Filter closed positions
    const closedCount = positions.filter(p => p.status === 'closed').length;
    const showClosed = window._showClosedPositions || false;
    const visiblePositions = showClosed ? positions : positions.filter(p => p.status !== 'closed');
    
    // Pre-compute values for all positions
    const enriched = visiblePositions.map(pos => {
        let currentPrice; // in USD (market price)
        if (pos.type === 'option') {
            const optSym = buildOptionSymbol(pos.symbol, pos.expiry_date, pos.strike_price);
            const optQuote = optSym ? priceCache[optSym] : null;
            currentPrice = optQuote?.price || pos.current_price || pos.entry_price;
        } else {
            const q = priceCache[pos.symbol];
            currentPrice = q?.price || pos.entry_price;
        }
        const q = priceCache[pos.symbol] || {};
        const mult = pos.multiplier || (pos.type === 'option' ? 100 : 1);
        const posCurrency = pos.currency || 'USD';
        const hasValidCost = pos.entry_price > 0;
        // Convert entry_price from position's currency to USD for P&L calc
        const entryPriceUsd = hasValidCost ? convertToUsd(pos.entry_price, posCurrency) : 0;
        const cost = hasValidCost ? entryPriceUsd * pos.quantity * mult : 0;
        const value = currentPrice * pos.quantity * mult; // market value in USD
        const pnl = hasValidCost ? value - cost : 0;
        const pnlPct = hasValidCost && cost > 0 ? (pnl / cost) * 100 : 0;
        const changePct = q.changePercent || 0;
        return { ...pos, currentPrice, value, cost, pnl, pnlPct, changePct, mult, hasValidCost, posCurrency, entryPriceUsd };
    });
    
    // Apply position sort
    const posSort = localStorage.getItem('positionSort') || 'default';
    if (posSort === 'name-asc') enriched.sort((a, b) => a.symbol.localeCompare(b.symbol));
    else if (posSort === 'name-desc') enriched.sort((a, b) => b.symbol.localeCompare(a.symbol));
    else if (posSort === 'value-desc') enriched.sort((a, b) => b.value - a.value);
    else if (posSort === 'pnl-desc') enriched.sort((a, b) => b.pnlPct - a.pnlPct);
    else if (posSort === 'change-desc') enriched.sort((a, b) => b.changePct - a.changePct);
    
    // Summary calculations — exclude positions with no cost basis from P&L
    const openPositions = enriched.filter(p => p.status !== 'closed');
    const totalValue = openPositions.reduce((s, p) => s + p.value, 0);
    const totalPnl = openPositions.filter(p => p.hasValidCost).reduce((s, p) => s + p.pnl, 0);
    const totalCost = openPositions.filter(p => p.hasValidCost).reduce((s, p) => s + p.cost, 0);
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    // Realized P&L from closed positions
    const closedPositions = positions.filter(p => p.status === 'closed' && p.realized_pnl != null);
    const realizedPnl = closedPositions.reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
    const todaysChange = openPositions.reduce((s, p) => {
        const prevVal = p.value / (1 + (p.changePct / 100));
        return s + (p.value - prevVal);
    }, 0);
    const rawCash = currentPortfolio?.cash || 0;
    const cashCurr = currentPortfolio?.cash_currency || 'USD';
    const cash = convertToUsd(rawCash, cashCurr);
    
    let html = '';
    
    // Summary bar
    html += `<div class="pos-summary">
        <div class="pos-summary-item">
            <div class="pos-summary-label">Portfolio Value</div>
            <div class="pos-summary-value">${fc(totalValue + cash)}</div>
        </div>
        <div class="pos-summary-item">
            <div class="pos-summary-label">Total P&L</div>
            <div class="pos-summary-value ${totalPnl >= 0 ? 'positive' : 'negative'}">${totalPnl >= 0 ? '+' : ''}${fc(totalPnl)} (${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(1)}%)</div>
            ${realizedPnl !== 0 ? `<div style="font-size:0.7rem;color:${realizedPnl >= 0 ? 'var(--color-positive,#4caf50)' : 'var(--color-negative,#f44336)'};margin-top:2px;">Realized: ${realizedPnl >= 0 ? '+' : ''}${fc(realizedPnl)}</div>` : ''}
        </div>
        <div class="pos-summary-item">
            <div class="pos-summary-label">Today's Change</div>
            <div class="pos-summary-value ${todaysChange >= 0 ? 'positive' : 'negative'}">${todaysChange >= 0 ? '+' : ''}${fc(todaysChange)}</div>
        </div>
        <div class="pos-summary-item">
            <div class="pos-summary-label">Cash</div>
            <div class="pos-summary-value">${fc(cash)}</div>
        </div>
    </div>`;
    
    // Closed positions toggle
    if (closedCount > 0) {
        html += `<div style="text-align:center;margin-bottom:8px;">
            <a href="#" onclick="event.preventDefault();window._showClosedPositions=!window._showClosedPositions;renderPositions();" style="font-size:0.8rem;color:var(--text-secondary);text-decoration:none;">
                ${showClosed ? '🔽 Hide' : '▶️ Show'} closed positions (${closedCount})
            </a>
        </div>`;
    }
    
    // Dividend summary (computed from priceCache data)
    const divPositions = enriched.filter(p => p.type !== 'option' && priceCache[p.symbol]?.dividendRate);
    if (divPositions.length > 0) {
        let divTotalIncome = 0;
        let divYieldWeighted = 0;
        let divTotalVal = 0;
        let nextEx = null;
        
        for (const p of divPositions) {
            const d = priceCache[p.symbol];
            const rate = d.dividendRate || d.trailingAnnualDividendRate || 0;
            const yld = d.dividendYield || 0;
            const income = rate * p.quantity;
            divTotalIncome += income;
            divYieldWeighted += yld * p.value;
            divTotalVal += p.value;
            const exTs = d.exDividendDate || d.dividendDate;
            if (exTs) {
                const exStr = new Date(exTs * 1000).toISOString().split('T')[0];
                if (!nextEx || exStr < nextEx) nextEx = exStr;
            }
        }
        const avgYld = divTotalVal > 0 ? (divYieldWeighted / divTotalVal).toFixed(1) : '0.0';
        const nextExLabel = nextEx ? new Date(nextEx).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
        
        html += `<div style="background:var(--card-bg);border-radius:12px;padding:12px 16px;margin-bottom:12px;border:1px solid rgba(22,163,74,0.3);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <span style="font-weight:600;font-size:0.9rem;">💰 Dividends</span>
                <button onclick="showDividendCalendar()" style="background:#16a34a;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:0.7rem;cursor:pointer;font-weight:600;">📅 Calendar</button>
            </div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;">
                <div><div style="font-size:0.7rem;color:var(--text-secondary);">Annual Income</div><div style="font-weight:600;color:#16a34a;">${fc(divTotalIncome)}</div></div>
                <div><div style="font-size:0.7rem;color:var(--text-secondary);">Avg Yield</div><div style="font-weight:600;">${avgYld}%</div></div>
                <div><div style="font-size:0.7rem;color:var(--text-secondary);">Next Ex-Date</div><div style="font-weight:600;">${nextExLabel}</div></div>
                <div><div style="font-size:0.7rem;color:var(--text-secondary);">Paying</div><div style="font-weight:600;">${divPositions.length}/${enriched.filter(p=>p.type!=='option').length}</div></div>
            </div>
        </div>`;
    }
    
    // Helper to render a single position card
    function renderPosCard(pos) {
            const isClosed = pos.status === 'closed';
            const closedStyle = isClosed ? 'opacity:0.6;' : '';
            const typeClass = pos.type === 'option' ? 'type-option' : pos.type === 'crypto' ? 'type-crypto' : 'type-stock';
            const optionInfo = pos.type === 'option' && pos.strike_price ? ` $${pos.strike_price}C ${pos.expiry_date ? pos.expiry_date.substring(0,7) : ''}` : '';
            const isWalletSynced = pos.source === 'wallet' || (pos.notes && pos.notes.includes('wallet-synced'));
            const walletBadge = isWalletSynced ? '<span class="type-badge" style="background:var(--accent-orange);color:#fff;font-size:0.65rem;margin-left:4px;" title="Synced from on-chain wallet">🔗</span>' : '';
            
            // Dividend badge
            const divData = priceCache[pos.symbol];
            const divYield = divData?.dividendYield ? divData.dividendYield.toFixed(1) : null;
            const exDateTs = divData?.exDividendDate || divData?.dividendDate;
            let divBadgeHtml = '';
            if (divYield && parseFloat(divYield) > 0) {
                divBadgeHtml += `<span style="background:#16a34a;color:#fff;font-size:0.6rem;padding:1px 5px;border-radius:4px;margin-left:4px;" title="Dividend Yield">💰 ${divYield}%</span>`;
            }
            if (exDateTs) {
                const exDate = new Date(exDateTs * 1000);
                const now = new Date();
                const daysUntil = Math.ceil((exDate - now) / 86400000);
                if (daysUntil >= 0 && daysUntil <= 30) {
                    const exStyle = daysUntil <= 7 ? 'background:#f59e0b;color:#000;' : 'background:#374151;color:#d1d5db;';
                    const exLabel = exDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    divBadgeHtml += `<span style="${exStyle}font-size:0.6rem;padding:1px 5px;border-radius:4px;margin-left:4px;" title="Ex-Dividend in ${daysUntil} days">Ex: ${exLabel}</span>`;
                }
            }
            
            const entrySym = CURRENCY_SYMBOLS[pos.posCurrency] || pos.posCurrency + ' ';
            const entryPriceStr = pos.posCurrency !== 'USD' ? `${entrySym}${pos.entry_price.toFixed(2)}` : fp(pos.entry_price);
            const qtyInfo = pos.quantity > 0 && pos.entry_price > 0 ? `<span style="margin-left:4px">· ${pos.quantity}${pos.type === 'option' ? 'x' : ''} @ ${entryPriceStr}</span>` : '';
            const locBadge = pos.location ? `<span class="location-badge">${pos.location}</span>` : '';
            const costBasisHint = !pos.hasValidCost ? '<span style="font-size:0.6rem;color:var(--accent-orange);margin-left:4px;" title="Entry price unknown — set cost basis for P&L">⚠️ Set cost basis</span>' : '';
            const pnlDisplay = pos.hasValidCost ? `${pos.pnl >= 0 ? '+' : ''}${fc(pos.pnl)} (${pos.pnlPct >= 0 ? '+' : ''}${pos.pnlPct.toFixed(1)}%)` : '—';
            // Position notes (Feature 6)
            const notesText = pos.notes && !pos.notes.includes('wallet-synced') ? pos.notes : '';
            const notesHtml = notesText ? `<div style="font-size:0.7rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;margin-top:2px;" title="${notesText.replace(/"/g, '&quot;')}">${notesText.length > 50 ? notesText.substring(0, 50) + '…' : notesText}</div>` : '';
            
            return `<div class="swipe-container" data-id="${pos.id}" data-type="position" data-symbol="${pos.symbol}" style="${closedStyle}">
                <div class="swipe-actions">
                    <div class="swipe-action edit" onclick="editPosition(${pos.id})">✏️</div>
                    ${!isClosed ? `<div class="swipe-action" style="background:var(--accent-orange);" onclick="closePosition(${pos.id})">📤</div>` : ''}
                    <div class="swipe-action delete" onclick="deletePosition(${pos.id})">🗑️</div>
                </div>
                <div class="swipe-content position-card" onclick="showPositionDetail(${pos.id})">
                    <div class="pos-row-main">
                        <div class="pos-left">
                            ${logoHtml(pos.symbol, 32)}
                            <div class="pos-left-info">
                                <span class="pos-symbol" ${isClosed ? 'style="text-decoration:line-through;"' : ''}>${pos.symbol}${optionInfo}</span>
                                <span class="type-badge ${typeClass}">${pos.type}</span>${walletBadge}${divBadgeHtml}${costBasisHint}
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <div class="sparkline-container" id="spark-${pos.symbol.replace(/[^a-zA-Z0-9]/g, '_')}" style="width:60px;height:24px;"></div>
                            <div class="pos-value">${fc(pos.value)}</div>
                        </div>
                    </div>
                    <div class="pos-row-sub">
                        <div class="pos-sub-left">
                            <span data-price-symbol="${pos.symbol}">${fp(pos.currentPrice)}</span>
                            <span class="${pos.changePct >= 0 ? 'positive' : 'negative'}" data-change-symbol="${pos.symbol}">${pos.changePct >= 0 ? '+' : ''}${pos.changePct.toFixed(2)}%</span>
                            ${extendedHoursHtml(priceCache[pos.symbol])}${futuresHtml(pos.symbol)}
                            ${qtyInfo}
                            ${locBadge}
                        </div>
                        <div class="pos-sub-right pos-pnl ${pos.hasValidCost ? (pos.pnl >= 0 ? 'positive' : 'negative') : ''}">${pnlDisplay}</div>
                    </div>
                    ${notesHtml}
                </div>
            </div>`;
    }
    
    if (posSort !== 'default') {
        // Flat sorted list (no grouping)
        for (const pos of enriched) {
            html += renderPosCard(pos);
        }
    } else {
    // Group by type
    const groups = {
        crypto:  { label: '🪙 Crypto',  items: [] },
        stock:   { label: '📈 Stocks',  items: [] },
        option:  { label: '📋 Options', items: [] },
    };
    
    for (const p of enriched) {
        const g = groups[p.type] || groups.stock;
        g.items.push(p);
    }
    
    // Sort each group by value (largest first)
    for (const g of Object.values(groups)) {
        g.items.sort((a, b) => b.value - a.value);
    }
    
    const collapsedGroups = JSON.parse(localStorage.getItem('collapsedPosGroups') || '[]');
    
    for (const [groupKey, group] of Object.entries(groups)) {
        if (group.items.length === 0) continue;
        
        const groupValue = group.items.reduce((s, p) => s + p.value, 0);
        const isCollapsed = collapsedGroups.includes(groupKey);
        
        html += `<div class="pos-group-header ${isCollapsed ? 'collapsed' : ''}" onclick="togglePosGroup('${groupKey}')">
            <span>${group.label} (${group.items.length}) — ${fc(groupValue)}</span>
        </div>`;
        html += `<div class="pos-group-items" id="pos-group-${groupKey}" style="max-height: ${isCollapsed ? '0px' : 'none'};">`;
        
        for (const pos of group.items) {
            html += renderPosCard(pos);
        }
        
        html += '</div>'; // close pos-group-items
    }
    } // close else (default grouping)
    
    el.innerHTML = html;
    setupSwipeHandlers();
    // Load sparklines async (don't block)
    loadSparklines(enriched);
    } catch(err) {
        console.error('renderPositions error:', err);
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💥</div><div class="empty-state-text">Error: ' + err.message + '</div></div>';
    }
}

let currentDetailId = null;
let currentDetailSymbol = null;

function showPositionDetail(posId) {
    const pos = positions.find(p => p.id === posId);
    if (!pos) { console.error('Position not found for detail:', posId); return; }
    
    // Enrich the position data (same logic as renderPositions)
    let currentPrice;
    if (pos.type === 'option') {
        const optSym = buildOptionSymbol(pos.symbol, pos.expiry_date, pos.strike_price);
        const optQuote = optSym ? priceCache[optSym] : null;
        currentPrice = optQuote?.price || pos.current_price || pos.entry_price;
    } else {
        const q = priceCache[pos.symbol];
        currentPrice = q?.price || pos.entry_price;
    }
    const q = priceCache[pos.symbol] || {};
    const mult = pos.multiplier || (pos.type === 'option' ? 100 : 1);
    const hasValidCost = pos.entry_price > 0;
    const cost = hasValidCost ? pos.entry_price * pos.quantity * mult : 0;
    const value = currentPrice * pos.quantity * mult;
    const pnl = hasValidCost ? value - cost : 0;
    const pnlPct = hasValidCost && cost > 0 ? (pnl / cost) * 100 : 0;
    const changePct = q.changePercent || 0;
    
    currentDetailId = posId;
    currentDetailSymbol = pos.symbol;
    
    // Set header
    document.getElementById('posDetailLogo').innerHTML = logoHtml(pos.symbol, 40);
    document.getElementById('posDetailSymbol').textContent = pos.symbol;
    document.getElementById('posDetailName').textContent = pos.name || pos.type;
    
    // Build detail body
    const isWalletSynced = pos.source === 'wallet' || (pos.notes && pos.notes.includes('wallet-synced'));
    const changeClass = changePct >= 0 ? 'positive' : 'negative';
    const pnlClass = hasValidCost ? (pnl >= 0 ? 'positive' : 'negative') : '';
    const pnlDisplay = hasValidCost ? `${pnl >= 0 ? '+' : ''}${fc(pnl)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)` : '— (no cost basis)';
    
    let bodyHtml = '';
    
    // Section 1: Price info
    bodyHtml += `<div class="detail-row">
        <span class="detail-label">Current Price</span>
        <span class="detail-value">${fp(currentPrice)} <span class="${changeClass}">${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</span>${extendedHoursHtml(q)}${futuresHtml(pos.symbol)}</span>
    </div>`;
    
    // Section 2: Position info
    bodyHtml += `<div class="detail-section">`;
    bodyHtml += `<div class="detail-row">
        <span class="detail-label">Position Value</span>
        <span class="detail-value">${fc(value)}</span>
    </div>`;
    const detailCur = pos.currency || 'USD';
    const detailCurSym = CURRENCY_SYMBOLS[detailCur] || detailCur + ' ';
    const entryPriceDisplay = detailCur !== 'USD' ? `${detailCurSym}${pos.entry_price.toFixed(2)}` : fp(pos.entry_price);
    bodyHtml += `<div class="detail-row">
        <span class="detail-label">Entry Price</span>
        <span class="detail-value">${entryPriceDisplay}${detailCur !== 'USD' ? ` <span style="color:var(--text-secondary);font-size:0.8rem;">(${detailCur})</span>` : ''}</span>
    </div>`;
    bodyHtml += `<div class="detail-row">
        <span class="detail-label">Quantity</span>
        <span class="detail-value">${pos.quantity}${pos.type === 'option' ? ' contracts' : ''}</span>
    </div>`;
    if (pos.type === 'option' && mult > 1) {
        bodyHtml += `<div class="detail-row">
            <span class="detail-label">Multiplier</span>
            <span class="detail-value">${mult}x</span>
        </div>`;
    }
    bodyHtml += `<div class="detail-row">
        <span class="detail-label">P&L</span>
        <span class="detail-value ${pnlClass}">${pnlDisplay}</span>
    </div>`;
    bodyHtml += `</div>`;
    
    // Section 3: Metadata
    bodyHtml += `<div class="detail-section">`;
    if (isWalletSynced) {
        bodyHtml += `<div class="detail-row">
            <span class="detail-label">Source</span>
            <span class="detail-value">🔗 Wallet</span>
        </div>`;
    }
    if (pos.location) {
        bodyHtml += `<div class="detail-row">
            <span class="detail-label">Location</span>
            <span class="detail-value">${pos.location}</span>
        </div>`;
    }
    bodyHtml += `<div class="detail-row">
        <span class="detail-label">Type</span>
        <span class="detail-value">${pos.type.charAt(0).toUpperCase() + pos.type.slice(1)}</span>
    </div>`;
    if (pos.type === 'option') {
        if (pos.strike_price) {
            bodyHtml += `<div class="detail-row">
                <span class="detail-label">Strike Price</span>
                <span class="detail-value">${fp(pos.strike_price)}</span>
            </div>`;
        }
        if (pos.expiry_date) {
            bodyHtml += `<div class="detail-row">
                <span class="detail-label">Expiry Date</span>
                <span class="detail-value">${pos.expiry_date}</span>
            </div>`;
        }
    }
    if (pos.entry_date) {
        bodyHtml += `<div class="detail-row">
            <span class="detail-label">Entry Date</span>
            <span class="detail-value">${pos.entry_date}</span>
        </div>`;
    }
    if (pos.notes) {
        bodyHtml += `<div class="detail-row">
            <span class="detail-label">Notes</span>
            <span class="detail-value" style="max-width:60%;word-break:break-word;font-size:0.85rem;">${pos.notes}</span>
        </div>`;
    }
    bodyHtml += `</div>`;
    
    document.getElementById('posDetailBody').innerHTML = bodyHtml;
    
    // Wire up footer buttons
    document.getElementById('posDetailChartBtn').onclick = function() {
        closeModal('positionDetailModal');
        selectTicker(currentDetailSymbol);
    };
    document.getElementById('posDetailEditBtn').onclick = function() {
        closeModal('positionDetailModal');
        editPosition(currentDetailId);
    };
    document.getElementById('posDetailDeleteBtn').onclick = function() {
        closeModal('positionDetailModal');
        deletePosition(currentDetailId);
    };
    document.getElementById('posDetailCloseBtn').onclick = function() {
        closeModal('positionDetailModal');
        closePosition(currentDetailId);
    };
    
    showModal('positionDetailModal');
}

function editPosition(id) {
    const pos = positions.find(p => p.id === id);
    if (!pos) { console.error('Position not found:', id); return; }
    editingPositionId = id;
    
    // Use querySelector for reliability
    const form = document.getElementById('positionForm');
    if (!form) { console.error('Position form not found'); return; }
    
    form.querySelector('[name="symbol"]').value = pos.symbol || '';
    form.querySelector('[name="name"]').value = pos.name || '';
    form.querySelector('[name="type"]').value = pos.type || 'stock';
    form.querySelector('[name="quantity"]').value = pos.quantity || '';
    form.querySelector('[name="entry_price"]').value = pos.entry_price || '';
    form.querySelector('[name="entry_date"]').value = pos.entry_date || '';
    // Filter out internal wallet-synced notes from display
    const displayNotes = (pos.notes || '').replace(/^wallet-synced \|.*$/i, '').replace(/^Was wallet-synced.*$/i, '').replace(/^Converted from wallet.*$/i, '').trim();
    form.querySelector('[name="notes"]').value = displayNotes;
    form.querySelector('[name="strike_price"]').value = pos.strike_price || '';
    form.querySelector('[name="expiry_date"]').value = pos.expiry_date || '';
    form.querySelector('[name="current_price"]').value = pos.current_price || '';
    form.querySelector('[name="multiplier"]').value = pos.multiplier || (pos.type === 'option' ? 100 : 1);
    form.querySelector('[name="location"]').value = pos.location || '';
    const curSel = form.querySelector('[name="entry_currency"]');
    if (curSel) curSel.value = pos.currency || 'USD';
    
    // Show option fields if editing an option
    document.getElementById('optionFields').style.display = pos.type === 'option' ? 'block' : 'none';
    const title = document.getElementById('addPositionTitle');
    if (title) title.textContent = 'Edit Position';
    // Hide cash toggle when editing
    const cashToggle = document.getElementById('addPositionCashToggle');
    if (cashToggle) cashToggle.style.display = 'none';
    showModal('addPositionModal');
}

async function renderMarkets() {
    // Default markets + pinned markets
    const defaultSymbols = ['^GSPC', '^IXIC', '^DJI', '^VIX', 'BTC-USD'];
    const allSymbols = [...new Set([...defaultSymbols, ...pinnedMarkets])];
    const names = { '^GSPC': 'S&P 500', '^IXIC': 'Nasdaq', '^DJI': 'Dow', '^VIX': 'VIX', 'BTC-USD': 'Bitcoin' };
    
    // Fetch index + futures quotes in parallel
    const futuresSymbols = [...new Set(Object.values(futuresMap))];
    const quotes = await Promise.all([...allSymbols, ...futuresSymbols].map(fetchQuote));
    quotes.forEach(q => { if (q) priceCache[q.symbol] = q; });
    
    const el = document.getElementById('marketsGrid');
    el.innerHTML = quotes.filter(Boolean).map(q => {
        // Skip raw futures symbols from rendering as their own cards
        if (['ES=F', 'NQ=F', 'YM=F'].includes(q.symbol)) return '';
        const sel = q.symbol === selectedSymbol ? 'selected' : '';
        const price = fp(q.price);
        const isPinned = pinnedMarkets.includes(q.symbol);
        const pinBadge = isPinned && !defaultSymbols.includes(q.symbol) ? '<span style="font-size:0.6rem;">📌</span>' : '';
        const futHtml = futuresHtml(q.symbol);
        const ahHtml = extendedHoursHtml(q);
        
        return `<div class="market-item ${sel}" data-symbol="${q.symbol}" onclick="selectTickerSmall('${q.symbol}')">
            <div class="market-symbol" style="display:flex;align-items:center;gap:4px;">${logoHtml(q.symbol, 16)}${names[q.symbol] || q.symbol} ${pinBadge}</div>
            <div class="market-price" data-price-symbol="${q.symbol}">${price}</div>
            <div class="market-change ${q.changePercent >= 0 ? 'positive' : 'negative'}" data-change-symbol="${q.symbol}">${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%</div>
            ${ahHtml ? `<div style="margin-top:2px;">${ahHtml}</div>` : ''}
            ${futHtml ? `<div style="margin-top:3px;">${futHtml}</div>` : ''}
        </div>`;
    }).filter(Boolean).join('');
    
    // Update VIX
    const vix = priceCache['^VIX'];
    if (vix) {
        document.getElementById('vixValue').textContent = vix.price.toFixed(1);
        let status = vix.price < 15 ? '😌 Calm' : vix.price < 20 ? '😐 Normal' : vix.price < 30 ? '😟 Elevated' : '😱 Fear';
        document.getElementById('vixStatus').textContent = status;
    }
}

function updateSummary() {
    let totalValue = 0;
    let totalCost = 0;
    
    for (const pos of positions) {
        // For options: try Yahoo option symbol, then manual current_price, then entry
        // For stocks/crypto: use live price or entry price as fallback
        let currentPrice;
        if (pos.type === 'option') {
            const optSym = buildOptionSymbol(pos.symbol, pos.expiry_date, pos.strike_price);
            const optQuote = optSym ? priceCache[optSym] : null;
            currentPrice = optQuote?.price || pos.current_price || pos.entry_price;
        } else {
            const q = priceCache[pos.symbol];
            currentPrice = q?.price || pos.entry_price;
        }
        
        // Options default to 100x multiplier (100 shares per contract)
        const mult = pos.multiplier || (pos.type === 'option' ? 100 : 1);
        totalValue += currentPrice * pos.quantity * mult;
        // Only include positions with valid entry price in P&L calculation
        // Convert entry_price from position's stored currency to USD
        if (pos.entry_price > 0) {
            const posCurrency = pos.currency || 'USD';
            const entryPriceUsd = convertToUsd(pos.entry_price, posCurrency);
            totalCost += entryPriceUsd * pos.quantity * mult;
        }
    }
    
    // Cash is stored in its own currency (cash_currency), convert to USD for portfolio math
    const rawCash = currentPortfolio?.cash || 0;
    const cashCurrency = currentPortfolio?.cash_currency || 'USD';
    const cashUsd = convertToUsd(rawCash, cashCurrency); // Convert to USD for summing with positions
    const hasAnyCost = totalCost > 0;
    const pnl = hasAnyCost ? totalValue - totalCost : 0;
    const pnlPct = hasAnyCost ? (pnl / totalCost) * 100 : 0;
    
    document.getElementById('totalValue').textContent = fc(totalValue + cashUsd);
    document.getElementById('totalPnL').textContent = hasAnyCost ? (pnl >= 0 ? '+' : '') + fc(pnl) : '—';
    document.getElementById('totalPnL').className = 'summary-value ' + (hasAnyCost ? (pnl >= 0 ? 'positive' : 'negative') : '');
    document.getElementById('totalPnLPct').textContent = hasAnyCost ? (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%' : '';
    document.getElementById('totalPnLPct').className = 'summary-sub ' + (hasAnyCost ? (pnlPct >= 0 ? 'positive' : 'negative') : '');
    document.getElementById('cashValue').textContent = fc(cashUsd);
    
    // Save snapshot if logged in
    if (token && currentPortfolio && totalValue > 0) {
        savePortfolioSnapshot(totalValue + cashUsd, cashUsd, totalValue);
    }
    
    // Render allocation chart
    renderAllocation(totalValue, cashUsd);
    
    // Reset exposure data so it reloads on next tab switch
    exposureData = null;
    // If sector or region tab is currently active, reload immediately
    const activeTab = document.querySelector('.exposure-tab.active')?.dataset?.tab;
    if (activeTab === 'sectors' || activeTab === 'regions') {
        loadExposureData();
    }
}

/* renderMarkets → kept above (line 753–791) */
/* updateSummary → kept above (line 793–852) */
/* Watchlist → see portfolio-watchlist.js */
/* Allocation & Exposure charts → see portfolio-charts.js */
/* Performance & Sparklines → see portfolio-performance.js */
/* Dividend Calendar → see portfolio-dividends.js */
/* Close Position → see portfolio-close.js */
