// ============ RENDER ============

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
    
    // Pre-compute values for all positions
    const enriched = positions.map(pos => {
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
    const totalValue = enriched.reduce((s, p) => s + p.value, 0);
    const totalPnl = enriched.filter(p => p.hasValidCost).reduce((s, p) => s + p.pnl, 0);
    const totalCost = enriched.filter(p => p.hasValidCost).reduce((s, p) => s + p.cost, 0);
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const todaysChange = enriched.reduce((s, p) => {
        const prevVal = p.value / (1 + (p.changePct / 100));
        return s + (p.value - prevVal);
    }, 0);
    const cash = currentPortfolio?.cash || 0;
    
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
            
            return `<div class="swipe-container" data-id="${pos.id}" data-type="position" data-symbol="${pos.symbol}">
                <div class="swipe-actions">
                    <div class="swipe-action edit" onclick="editPosition(${pos.id})">✏️</div>
                    <div class="swipe-action delete" onclick="deletePosition(${pos.id})">🗑️</div>
                </div>
                <div class="swipe-content position-card" onclick="showPositionDetail(${pos.id})">
                    <div class="pos-row-main">
                        <div class="pos-left">
                            ${logoHtml(pos.symbol, 32)}
                            <div class="pos-left-info">
                                <span class="pos-symbol">${pos.symbol}${optionInfo}</span>
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
                            ${extendedHoursHtml(priceCache[pos.symbol])}
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
        <span class="detail-value">${fp(currentPrice)} <span class="${changeClass}">${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</span>${extendedHoursHtml(q)}</span>
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
    showModal('addPositionModal');
}

function renderWatchlist() {
    // Update watchlist dropdown
    const label = document.getElementById('watchlistLabel');
    const opts = document.getElementById('watchlistOptions');
    if (label && opts && allWatchlists.length > 0) {
        const current = allWatchlists.find(w => w.id === watchlistId);
        label.textContent = (current?.name || 'Watchlist') + ' (' + (current?.items?.length || 0) + ')';
        opts.innerHTML = allWatchlists.map(w =>
            `<div class="watchlist-dropdown-item ${w.id === watchlistId ? 'active' : ''}" onclick="switchWatchlist(${w.id});closeWatchlistDropdown()"><span>${w.name}</span><span class="wl-count">(${(w.items||[]).length})</span></div>`
        ).join('');
    }
    
    // Restore watchlist sort dropdown
    const wSortSel = document.getElementById('watchlistSortSelect');
    if (wSortSel && !wSortSel._restored) {
        wSortSel.value = localStorage.getItem('watchlistSort') || 'default';
        wSortSel._restored = true;
    }
    
    const el = document.getElementById('watchlistItems');
    
    if (watchlist === null || watchlist === undefined) {
        el.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';
        return;
    }
    if (watchlist.length === 0) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👀</div><div class="empty-state-text">Your watchlist is empty. Add tickers to start tracking!</div><button class="btn btn-primary" onclick="showAddWatchlistModal()">Add Ticker</button></div>';
        return;
    }
    
    // Enrich watchlist items with price data for sorting
    const enrichedWL = watchlist.map(item => {
        const q = priceCache[item.symbol];
        return { ...item, _price: q?.price || 0, _change: q?.changePercent || 0 };
    });
    
    // Apply watchlist sort
    const wSort = localStorage.getItem('watchlistSort') || 'default';
    if (wSort === 'name-asc') enrichedWL.sort((a, b) => a.symbol.localeCompare(b.symbol));
    else if (wSort === 'price-desc') enrichedWL.sort((a, b) => b._price - a._price);
    else if (wSort === 'change-desc') enrichedWL.sort((a, b) => b._change - a._change);
    
    // Helper to render a single watchlist item card
    function renderWLCard(item) {
        const price = item._price;
        const change = item._change;
            
            let alertBadge = '';
            let target = '';
            if (item.alert_below && price > 0 && price <= item.alert_below) {
                alertBadge = '<span class="alert-badge buy">🔔 BUY</span>';
            } else if (item.alert_above && price > 0 && price >= item.alert_above) {
                alertBadge = '<span class="alert-badge sell">🔔 SELL</span>';
            }
            if (item.alert_below) target = `Target: ${fp(item.alert_below)}`;
            
            return `<div class="swipe-container" data-id="${item.id}" data-type="watchlist" data-symbol="${item.symbol}">
                <div class="swipe-actions">
                    <div class="swipe-action edit" onclick="editWatchlistItem(${item.id})">✏️</div>
                    <div class="swipe-action delete" onclick="deleteWatchlistItem(${item.id})">🗑️</div>
                </div>
                <div class="swipe-content watchlist-item" style="display:flex;align-items:center;">
                    <div class="watch-info" onclick="selectTicker('${item.symbol}')" style="display:flex;align-items:center;gap:10px;flex:1;">
                        ${logoHtml(item.symbol, 32)}
                        <div>
                            <div><span class="watch-symbol">${item.symbol}</span>${alertBadge}</div>
                            <div class="watch-name">${item.name || ''}</div>
                            ${target ? `<div class="watch-target">${target}</div>` : ''}
                        </div>
                    </div>
                    <div class="watch-price" style="text-align:right;min-width:70px;">
                        <div data-price-symbol="${item.symbol}">${price > 0 ? fp(price) : '--'}</div>
                        <div class="${change >= 0 ? 'positive' : 'negative'}" data-change-symbol="${item.symbol}">${price > 0 ? (change >= 0 ? '+' : '') + change.toFixed(2) + '%' : ''}</div>
                        <div class="ext-hours-block">${extendedHoursHtml(priceCache[item.symbol])}</div>
                    </div>
                    <button onclick="event.stopPropagation();quickAddFromWatchlist('${item.symbol}')" title="Add to portfolio" style="margin-left:12px;flex-shrink:0;background:#3b82f6;border:none;color:#fff;font-size:0.7rem;cursor:pointer;padding:5px 10px;border-radius:6px;font-weight:700;letter-spacing:0.3px;">+ ADD</button>
                </div>
            </div>`;
    }
    
    let html = '';
    
    if (wSort !== 'default') {
        // Flat sorted list (no category grouping)
        for (const item of enrichedWL) {
            html += renderWLCard(item);
        }
    } else {
    // Group by category
    const categories = {};
    const categoryNames = {
        tech: '💻 Tech', robotics: '🤖 Robotics', crypto: '₿ Crypto',
        indices: '📊 Indices', etf: '📦 ETFs', commodities: '⚡ Commodities',
        forex: '💱 Forex', energy: '🛢️ Energy',
        resources: '⛏️ Resources', safe: '🛡️ Safe Haven',
        industrial: '🏭 Industrial', general: '📈 General'
    };
    
    for (const item of enrichedWL) {
        const cat = item.category || 'general';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(item);
    }
    
    const catOrder = ['tech', 'robotics', 'crypto', 'indices', 'etf', 'commodities', 'forex', 'energy', 'resources', 'safe', 'industrial', 'general'];
    // Include any categories in data that aren't in catOrder
    const allCats = [...catOrder, ...Object.keys(categories).filter(c => !catOrder.includes(c))];
    
    // Load collapsed state from localStorage
    const collapsedCats = JSON.parse(localStorage.getItem('collapsedCategories') || '[]');
    
    for (const cat of allCats) {
        if (!categories[cat]) continue;
        const isCollapsed = collapsedCats.includes(cat);
        const count = categories[cat].length;
        html += `<div class="watchlist-category">
            <div class="category-header ${isCollapsed ? 'collapsed' : ''}" onclick="toggleCategory('${cat}')">
                <span>${categoryNames[cat] || cat} (${count})</span>
            </div>
            <div class="category-items" id="cat-${cat}" style="max-height: ${isCollapsed ? '0px' : 'none'};">`;
        
        for (const item of categories[cat]) {
            html += renderWLCard(item);
        }
        html += '</div></div>'; // Close category-items and watchlist-category
    }
    } // close else (default grouping)
    el.innerHTML = html;
    setupSwipeHandlers();
}

// Toggle category collapse
function toggleCategory(cat) {
    const header = event.currentTarget;
    const items = document.getElementById(`cat-${cat}`);
    const isCollapsed = header.classList.toggle('collapsed');
    
    if (isCollapsed) {
        // Collapse: set current height first, then animate to 0
        items.style.maxHeight = items.scrollHeight + 'px';
        requestAnimationFrame(() => {
            items.style.maxHeight = '0px';
            items.classList.add('collapsed');
        });
    } else {
        // Expand: animate from 0 to scrollHeight
        items.classList.remove('collapsed');
        items.style.maxHeight = items.scrollHeight + 'px';
        // After transition, remove fixed max-height so content can grow
        items.addEventListener('transitionend', function handler() {
            items.style.maxHeight = 'none';
            items.removeEventListener('transitionend', handler);
        }, { once: true });
    }
    
    // Save state
    let collapsedCats = JSON.parse(localStorage.getItem('collapsedCategories') || '[]');
    if (isCollapsed) {
        if (!collapsedCats.includes(cat)) collapsedCats.push(cat);
    } else {
        collapsedCats = collapsedCats.filter(c => c !== cat);
    }
    localStorage.setItem('collapsedCategories', JSON.stringify(collapsedCats));
}

// Swipe gesture handling
let activeSwipe = null;
function setupSwipeHandlers() {
    document.querySelectorAll('.swipe-container').forEach(container => {
        const content = container.querySelector('.swipe-content');
        let startX = 0, currentX = 0, isDragging = false;
        
        content.addEventListener('touchstart', (e) => {
            // Close any other open swipes
            if (activeSwipe && activeSwipe !== container) {
                activeSwipe.querySelector('.swipe-content').style.transform = '';
                activeSwipe = null;
            }
            startX = e.touches[0].clientX;
            isDragging = true;
            content.style.transition = 'none';
        }, { passive: true });
        
        content.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentX = e.touches[0].clientX;
            const diff = startX - currentX;
            if (diff > 0 && diff < 150) { // Only allow left swipe, max 150px
                content.style.transform = `translateX(-${diff}px)`;
            }
        }, { passive: true });
        
        content.addEventListener('touchend', () => {
            isDragging = false;
            content.style.transition = 'transform 0.2s ease';
            const diff = startX - currentX;
            if (diff > 60) { // Threshold to keep open
                content.style.transform = 'translateX(-140px)';
                activeSwipe = container;
            } else {
                content.style.transform = '';
                activeSwipe = null;
            }
        });
        
        // Close on tap elsewhere
        content.addEventListener('click', (e) => {
            if (activeSwipe === container && !e.target.closest('.watch-info')) {
                content.style.transform = '';
                activeSwipe = null;
            }
        });
    });
}

// Close swipe when tapping elsewhere
document.addEventListener('click', (e) => {
    if (activeSwipe && !e.target.closest('.swipe-container')) {
        activeSwipe.querySelector('.swipe-content').style.transform = '';
        activeSwipe = null;
    }
});

function editWatchlistItem(id) {
    const item = watchlist.find(w => w.id === id);
    if (!item) { console.error('Watchlist item not found:', id); return; }
    editingWatchlistItemId = id;
    
    const form = document.getElementById('watchlistForm');
    if (!form) { console.error('Watchlist form not found'); return; }
    
    form.querySelector('[name="symbol"]').value = item.symbol || '';
    form.querySelector('[name="name"]').value = item.name || '';
    form.querySelector('[name="alert_below"]').value = item.alert_below || '';
    form.querySelector('[name="alert_above"]').value = item.alert_above || '';
    form.querySelector('[name="category"]').value = item.category || 'general';
    
    const title = document.getElementById('addWatchlistTitle');
    if (title) title.textContent = 'Edit Watchlist Item';
    showModal('addWatchlistModal');
}

async function renderMarkets() {
    // Default markets + pinned markets
    const defaultSymbols = ['^GSPC', '^IXIC', '^DJI', '^VIX', 'BTC-USD'];
    const allSymbols = [...new Set([...defaultSymbols, ...pinnedMarkets])];
    const names = { '^GSPC': 'S&P 500', '^IXIC': 'Nasdaq', '^DJI': 'Dow', '^VIX': 'VIX', 'BTC-USD': 'Bitcoin' };
    
    // Futures mapping for after-hours index tracking
    const futuresMap = { '^GSPC': 'ES=F', '^IXIC': 'NQ=F', '^DJI': 'YM=F' };
    const futuresNames = { 'ES=F': 'Futures', 'NQ=F': 'Futures', 'YM=F': 'Futures' };
    
    // Fetch index + futures quotes in parallel
    const futuresSymbols = Object.values(futuresMap);
    const quotes = await Promise.all([...allSymbols, ...futuresSymbols].map(fetchQuote));
    quotes.forEach(q => { if (q) priceCache[q.symbol] = q; });
    
    const el = document.getElementById('marketsGrid');
    el.innerHTML = quotes.filter(Boolean).map(q => {
        const sel = q.symbol === selectedSymbol ? 'selected' : '';
        const price = q.symbol.includes('BTC') ? fp(q.price) : fp(q.price);
        const isPinned = pinnedMarkets.includes(q.symbol);
        const pinBadge = isPinned && !defaultSymbols.includes(q.symbol) ? '<span style="font-size:0.6rem;">📌</span>' : '';
        // Futures line for indices when market is closed
        let futuresHtml = '';
        const futSym = futuresMap[q.symbol];
        if (futSym && q.marketState !== 'REGULAR') {
            const fq = priceCache[futSym];
            if (fq && fq.price) {
                const fChange = fq.changePercent || 0;
                const fColor = fChange >= 0 ? '#26a69a' : '#ef5350';
                futuresHtml = `<div style="margin-top:3px;font-size:0.7rem;">
                    <span style="background:#ff9800;color:#000;padding:1px 4px;border-radius:3px;font-size:0.6rem;font-weight:600;">FUT</span>
                    <span style="color:${fColor};" data-price-symbol="${futSym}">${fp(fq.price)}</span>
                    <span style="color:${fColor};" data-change-symbol="${futSym}">${fChange >= 0 ? '+' : ''}${fChange.toFixed(2)}%</span>
                </div>`;
            }
        }
        const ahHtml = extendedHoursHtml(q);
        
        return `<div class="market-item ${sel}" data-symbol="${q.symbol}" onclick="selectTickerSmall('${q.symbol}')">
            <div class="market-symbol" style="display:flex;align-items:center;gap:4px;">${logoHtml(q.symbol, 16)}${names[q.symbol] || q.symbol} ${pinBadge}</div>
            <div class="market-price" data-price-symbol="${q.symbol}">${price}</div>
            <div class="market-change ${q.changePercent >= 0 ? 'positive' : 'negative'}" data-change-symbol="${q.symbol}">${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%</div>
            ${ahHtml ? `<div style="margin-top:2px;">${ahHtml}</div>` : ''}
            ${futuresHtml}
        </div>`;
    }).join('');
    
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
    
    const cashUsd = currentPortfolio?.cash || 0; // Raw USD from server, fc() will convert
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
        document.getElementById('perfStart').textContent = fcc(data.summary.start_value);
        document.getElementById('perfCurrent').textContent = fcc(data.summary.current_value);
        const returnEl = document.getElementById('perfReturn');
        const retSign = data.summary.total_return >= 0 ? '+' : '';
        returnEl.textContent = retSign + fcc(data.summary.total_return) + ' (' + data.summary.total_return_pct.toFixed(1) + '%)';
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
            // Silently skip failed sparklines
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
}

// ============ DIVIDEND CALENDAR ============

async function showDividendCalendar() {
    if (!currentPortfolio) return;
    
    // Show a modal with loading state
    const modalId = 'dividendCalendarModal';
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-overlay';
        modal.innerHTML = `<div class="modal" style="max-width:500px;max-height:85vh;overflow-y:auto;">
            <div class="modal-header">
                <h3>💰 Dividend Income Calendar</h3>
                <button class="modal-close" onclick="closeModal('${modalId}')">&times;</button>
            </div>
            <div class="modal-body" id="dividendCalendarBody" style="padding:16px;">Loading...</div>
        </div>`;
        document.body.appendChild(modal);
    }
    showModal(modalId);
    
    try {
        const data = await api(`/portfolios/${currentPortfolio.id}/dividends`);
        const body = document.getElementById('dividendCalendarBody');
        
        if (!data.positions || data.positions.length === 0) {
            body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary);"><div style="font-size:2rem;margin-bottom:8px;">📭</div>No dividend-paying positions found.</div>';
            return;
        }
        
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const maxMonthly = Math.max(...data.monthlyIncome);
        
        let html = '';
        
        // Summary
        html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
            <div style="background:var(--bg-primary);padding:12px;border-radius:8px;text-align:center;">
                <div style="font-size:0.7rem;color:var(--text-secondary);">Annual Income</div>
                <div style="font-size:1.2rem;font-weight:700;color:#16a34a;">${fc(data.summary.totalAnnualIncome)}</div>
            </div>
            <div style="background:var(--bg-primary);padding:12px;border-radius:8px;text-align:center;">
                <div style="font-size:0.7rem;color:var(--text-secondary);">Monthly Avg</div>
                <div style="font-size:1.2rem;font-weight:700;">${fc(data.summary.totalAnnualIncome / 12)}</div>
            </div>
        </div>`;
        
        // Monthly bar chart
        html += `<div style="margin-bottom:16px;"><div style="font-weight:600;margin-bottom:8px;font-size:0.85rem;">Monthly Breakdown</div>`;
        for (let i = 0; i < 12; i++) {
            const val = data.monthlyIncome[i];
            const pct = maxMonthly > 0 ? (val / maxMonthly * 100) : 0;
            const now = new Date();
            const isCurrentMonth = i === now.getMonth();
            html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="width:28px;font-size:0.75rem;color:${isCurrentMonth ? '#16a34a' : 'var(--text-secondary)'};font-weight:${isCurrentMonth ? '700' : '400'};">${months[i]}</span>
                <div style="flex:1;height:18px;background:var(--bg-primary);border-radius:4px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:${isCurrentMonth ? '#16a34a' : '#22c55e80'};border-radius:4px;transition:width 0.3s;"></div>
                </div>
                <span style="width:60px;text-align:right;font-size:0.75rem;font-weight:600;">${val > 0 ? fc(val) : '—'}</span>
            </div>`;
        }
        html += `</div>`;
        
        // Upcoming ex-dates
        html += `<div style="font-weight:600;margin-bottom:8px;font-size:0.85rem;">Upcoming Ex-Dates</div>`;
        const upcoming = data.positions.filter(p => p.exDividendDate);
        if (upcoming.length > 0) {
            for (const p of upcoming) {
                const exDate = new Date(p.exDividendDate);
                const now = new Date();
                const daysUntil = Math.ceil((exDate - now) / 86400000);
                const isPast = daysUntil < 0;
                const isUrgent = daysUntil >= 0 && daysUntil <= 7;
                const dateLabel = exDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const statusColor = isPast ? 'var(--text-secondary)' : isUrgent ? '#f59e0b' : '#16a34a';
                const statusText = isPast ? 'passed' : daysUntil === 0 ? 'today!' : `in ${daysUntil}d`;
                
                html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:var(--bg-primary);border-radius:8px;margin-bottom:4px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        ${typeof logoHtml === 'function' ? logoHtml(p.symbol, 24) : ''}
                        <div>
                            <div style="font-weight:600;font-size:0.85rem;">${p.symbol}</div>
                            <div style="font-size:0.7rem;color:var(--text-secondary);">${p.quantity} shares · ${p.dividendYield.toFixed(1)}% yield</div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.8rem;font-weight:600;">${dateLabel}</div>
                        <div style="font-size:0.7rem;color:${statusColor};font-weight:600;">${statusText}</div>
                    </div>
                </div>`;
            }
        } else {
            html += `<div style="color:var(--text-secondary);font-size:0.85rem;">No upcoming ex-dates available.</div>`;
        }
        
        // All dividend positions
        html += `<div style="font-weight:600;margin:16px 0 8px;font-size:0.85rem;">All Dividend Positions</div>`;
        for (const p of data.positions) {
            html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-bottom:1px solid var(--border-color);">
                <div>
                    <span style="font-weight:600;font-size:0.85rem;">${p.symbol}</span>
                    <span style="font-size:0.7rem;color:var(--text-secondary);margin-left:4px;">${p.frequency}</span>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.8rem;font-weight:600;color:#16a34a;">${fc(p.annualIncome)}/yr</div>
                    <div style="font-size:0.7rem;color:var(--text-secondary);">$${p.dividendRate.toFixed(2)}/share · ${p.dividendYield.toFixed(1)}%</div>
                </div>
            </div>`;
        }
        
        body.innerHTML = html;
    } catch (e) {
        console.error('Failed to load dividends:', e);
        document.getElementById('dividendCalendarBody').innerHTML = '<div style="color:var(--accent-red);padding:16px;">Failed to load dividend data.</div>';
    }
}

