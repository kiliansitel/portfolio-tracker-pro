// ============ PORTFOLIO — WATCHLIST ============
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
                        <div class="ext-hours-block">${extendedHoursHtml(priceCache[item.symbol])}${futuresHtml(item.symbol)}</div>
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
                const actionCount = container.querySelectorAll('.swipe-action').length;
                content.style.transform = `translateX(-${actionCount * 70}px)`;
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
