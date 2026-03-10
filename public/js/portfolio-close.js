// ============ PORTFOLIO — CLOSE POSITION ============
// ============ CLOSE POSITION ============
let closingPositionId = null;

function closePosition(id) {
    const pos = positions.find(p => p.id === id);
    if (!pos) { showToast('Position not found', 'error'); return; }
    closingPositionId = id;
    
    const mult = pos.multiplier || (pos.type === 'option' ? 100 : 1);
    const posCurrency = pos.currency || 'USD';
    const q = priceCache[pos.symbol] || {};
    const livePrice = q.price || pos.entry_price;
    const entryPriceDisplay = pos.entry_price.toFixed(2);
    const value = livePrice * pos.quantity * mult;
    
    // Fill info section
    document.getElementById('closePositionInfo').innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="font-weight:600;font-size:1rem;">${pos.symbol}</span>
            <span class="type-badge ${pos.type === 'option' ? 'type-option' : pos.type === 'crypto' ? 'type-crypto' : 'type-stock'}">${pos.type}</span>
        </div>
        <div style="font-size:0.85rem;color:var(--text-secondary);">
            ${pos.quantity}${pos.type === 'option' ? ' contracts' : ' shares'} @ ${CURRENCY_SYMBOLS[posCurrency] || posCurrency + ' '}${entryPriceDisplay}
            ${mult > 1 ? ' · ' + mult + 'x multiplier' : ''}
        </div>
        <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:2px;">Current value: ${fc(value)}</div>
    `;
    
    // Set defaults
    const form = document.getElementById('closePositionForm');
    form.close_price.value = livePrice.toFixed(2);
    form.quantity.value = pos.quantity;
    form.fees.value = 0;
    form.date.value = new Date().toISOString().split('T')[0];
    
    // Hint
    document.getElementById('closeQtyHint').textContent = `(max: ${pos.quantity})`;
    
    // Default affects_cash based on source
    const isWallet = pos.source === 'wallet' || (pos.notes && pos.notes.includes('wallet-synced'));
    form.affects_cash.checked = !isWallet;
    
    // Setup live preview
    const inputs = form.querySelectorAll('input[type="number"], input[type="date"], input[name="affects_cash"]');
    inputs.forEach(inp => {
        inp.removeEventListener('input', updateClosePreview);
        inp.addEventListener('input', updateClosePreview);
        inp.removeEventListener('change', updateClosePreview);
        inp.addEventListener('change', updateClosePreview);
    });
    
    updateClosePreview();
    showModal('closePositionModal');
}

function updateClosePreview() {
    const pos = positions.find(p => p.id === closingPositionId);
    if (!pos) return;
    
    const form = document.getElementById('closePositionForm');
    const closePrice = parseFloat(form.close_price.value) || 0;
    const quantity = parseFloat(form.quantity.value) || 0;
    const fees = parseFloat(form.fees.value) || 0;
    const affectsCash = form.affects_cash.checked;
    const mult = pos.multiplier || (pos.type === 'option' ? 100 : 1);
    const posCurrency = pos.currency || 'USD';
    
    const proceeds = closePrice * quantity * mult;
    const pnl = (closePrice - pos.entry_price) * quantity * mult;
    const netProceeds = proceeds - fees;
    
    // Convert from position currency to USD for display via fc()
    const proceedsUsd = convertToUsd(proceeds, posCurrency);
    const pnlUsd = convertToUsd(pnl, posCurrency);
    const netProceedsUsd = convertToUsd(netProceeds, posCurrency);
    
    const pnlColor = pnlUsd >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    const pnlSign = pnlUsd >= 0 ? '+' : '';
    
    document.getElementById('closeCashPreview').innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>Proceeds:</span><span style="font-weight:600;">${fc(proceedsUsd)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>P&L:</span><span style="font-weight:600;color:${pnlColor};">${pnlSign}${fc(pnlUsd)}</span>
        </div>
        ${fees > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>Fees:</span><span>-${fc(convertToUsd(fees, posCurrency))}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border-color);padding-top:4px;">
            <span>Cash impact:</span><span style="font-weight:600;color:${affectsCash ? pnlColor : 'var(--text-secondary)'};">${affectsCash ? pnlSign + fc(netProceedsUsd) : 'None'}</span>
        </div>
    `;
}

async function submitClosePosition(event) {
    event.preventDefault();
    if (!closingPositionId || !token || !portfolioId) return;
    
    const form = document.getElementById('closePositionForm');
    const closePrice = parseFloat(form.close_price.value);
    const quantity = parseFloat(form.quantity.value);
    const fees = parseFloat(form.fees.value) || 0;
    const date = form.date.value || null;
    const affectsCash = form.affects_cash.checked;
    
    try {
        const result = await api(`/portfolios/${portfolioId}/positions/${closingPositionId}/close`, {
            method: 'POST',
            body: JSON.stringify({ close_price: closePrice, quantity, fees, date, affects_cash: affectsCash })
        });
        
        const pos = positions.find(p => p.id === closingPositionId);
        const mult = pos ? (pos.multiplier || (pos.type === 'option' ? 100 : 1)) : 1;
        const pnl = pos ? (closePrice - pos.entry_price) * quantity * mult : 0;
        const posCurrency = pos?.currency || 'USD';
        const pnlUsd = convertToUsd(pnl, posCurrency);
        const pnlSign = pnlUsd >= 0 ? '+' : '';
        
        showToast(`Position closed! P&L: ${pnlSign}${fc(pnlUsd)}`, pnlUsd >= 0 ? 'success' : 'error');
        closeModal('closePositionModal');
        closingPositionId = null;
        await loadPortfolio();
    } catch (e) {
        showToast('Failed to close position: ' + e.message, 'error');
    }
}

