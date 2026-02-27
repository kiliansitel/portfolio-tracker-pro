// ============ PORTFOLIO — DIVIDEND CALENDAR ============
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
