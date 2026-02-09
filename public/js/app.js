// ============ UI ============
function updateUserUI() {
    const name = user?.username || 'Guest';
    document.getElementById('userName').textContent = name;
    document.getElementById('userAvatar').textContent = name[0].toUpperCase();
    document.getElementById('settingsUsername').textContent = user?.username || '--';
    document.getElementById('settingsEmail').textContent = user?.email || '--';
    document.getElementById('loggedInSettings').style.display = token ? 'block' : 'none';
}

function toggleDropdown() {
    document.getElementById('userDropdown').classList.toggle('show');
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
        document.getElementById('userDropdown').classList.remove('show');
    }
});

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.onclick = () => showPage(item.dataset.page);
});

function showPage(page) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
    document.getElementById(`page-${page}`)?.classList.add('active');
    document.getElementById('userDropdown').classList.remove('show');
    // AI page needs full-height layout without content padding/scroll
    const contentEl = document.querySelector('.content');
    if (page === 'ai') {
        contentEl.style.overflow = 'hidden';
        contentEl.style.padding = '0';
    } else {
        contentEl.style.overflow = '';
        contentEl.style.padding = '';
    }
    localStorage.setItem('lastPage', page);
    // Render content when switching pages
    if (page === 'dashboard' || page === 'portfolio') loadPortfolio();
    if (page === 'alerts') renderAlerts();
    if (page === 'history') {
        // Switching to history page
        renderTransactions();
    }
    if (page === 'news') loadNews();
    if (page === 'ai') initAi();
    if (page === 'wallets') renderWallets();
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

function showModal(id) {
    document.getElementById(id).classList.add('show');
}

function showAddPositionModal() {
    editingPositionId = null;
    document.getElementById('positionForm').reset();
    // Default entry currency to user's display currency
    const curSel = document.querySelector('#positionForm [name="entry_currency"]');
    if (curSel) curSel.value = userCurrency;
    const title = document.getElementById('addPositionTitle');
    if (title) title.textContent = 'Add Position';
    showModal('addPositionModal');
}

// Feature 2: Quick-add from watchlist
function quickAddFromWatchlist(symbol) {
    showAddPositionModal();
    const symInput = document.querySelector('#positionForm [name="symbol"]');
    if (symInput) symInput.value = symbol;
}

// Feature 1: Position sort change handler
function onPositionSortChange(value) {
    localStorage.setItem('positionSort', value);
    renderPositions();
}

// Feature 9: Watchlist sort change handler
function onWatchlistSortChange(value) {
    localStorage.setItem('watchlistSort', value);
    renderWatchlist();
}

function showAddWatchlistModal() {
    editingWatchlistItemId = null;
    document.getElementById('watchlistForm').reset();
    const title = document.getElementById('addWatchlistTitle');
    if (title) title.textContent = 'Add to Watchlist';
    showModal('addWatchlistModal');
}

function showAddAlertModal() {
    const form = document.getElementById('alertForm');
    if (form) form.reset();
    document.getElementById('addAlertTitle').textContent = 'Add Price Alert';
    showModal('addAlertModal');
}

async function saveAlert(e) {
    e.preventDefault();
    if (!token) {
        alert('Please login to create alerts');
        return;
    }
    const form = e.target;
    const data = {
        symbol: form.symbol.value.toUpperCase(),
        condition: form.condition.value,
        target_price: parseFloat(form.target_price.value)
    };
    
    try {
        await api('/alerts', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        closeModal('addAlertModal');
        form.reset();
        await renderAlerts();
        showToast('Price alert created successfully', 'success');
    } catch (e) {
        alert('Failed to create alert: ' + e.message);
    }
}

// Type toggle for options
document.querySelector('select[name="type"]').onchange = (e) => {
    document.getElementById('optionFields').style.display = e.target.value === 'option' ? 'block' : 'none';
};

// ============ DATA ============
async function loadPortfolio() {
    if (!token) return;
    try {
        const portfolios = await api('/portfolios');
        if (portfolios.length > 0) {
            currentPortfolio = portfolios[0];
            portfolioId = currentPortfolio.id;
            // Display cash in user's currency
            document.getElementById('settingsCash').value = Math.round(convertPrice(currentPortfolio.cash || 0, userCurrency));
            positions = await api(`/portfolios/${portfolioId}/positions`);
            renderPositions();
        }
    } catch (e) {
        console.error('Load portfolio error:', e);
    }
}

async function loadWatchlists() {
    if (!token) return;
    try {
        const wls = await api('/watchlists');
        allWatchlists = wls;
        if (wls.length > 0) {
            // Prefer "Main Watchlist", fall back to first
            const main = wls.find(w => w.name === 'Main Watchlist') || wls[0];
            watchlistId = main.id;
            watchlist = main.items || [];
            renderWatchlist();
        }
    } catch (e) {
        console.error('Load watchlist error:', e);
    }
}

async function switchWatchlist(id) {
    const wl = allWatchlists.find(w => w.id === Number(id));
    if (wl) {
        watchlistId = wl.id;
        watchlist = wl.items || [];
        renderWatchlist();
        setupSwipeHandlers();
        // Fetch prices for any symbols not in cache
        const missing = watchlist.filter(item => !priceCache[item.symbol]);
        if (missing.length > 0) {
            await Promise.allSettled(missing.map(item => fetchQuote(item.symbol)));
            renderWatchlist();
            setupSwipeHandlers();
        }
    }
}

function toggleWatchlistDropdown() {
    const opts = document.getElementById('watchlistOptions');
    if (opts.style.display === 'none' || !opts.style.display) {
        // Position fixed dropdown below the trigger
        const trigger = document.getElementById('watchlistSelected');
        const rect = trigger.getBoundingClientRect();
        opts.style.top = (rect.bottom + 6) + 'px';
        opts.style.left = rect.left + 'px';
        opts.style.display = 'block';
    } else {
        closeWatchlistDropdown();
    }
}
function closeWatchlistDropdown() {
    document.getElementById('watchlistOptions').style.display = 'none';
}
// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('#watchlistDropdown')) closeWatchlistDropdown();
});

// ============ INIT ============
// Load theme immediately (before anything else)
loadTheme();

async function initApp() {
    window._initialLoadInProgress = true;
    setTimeout(() => { window._initialLoadInProgress = false; }, 5000);
    // Set app title from server (production vs beta)
    try {
        const info = await fetch('/api/info').then(r => r.json());
        document.title = info.name;
        const appTitle = document.querySelector('.app-title');
        if (appTitle) appTitle.textContent = info.name;
    } catch(e) {}
    
    // Load caches immediately for instant display
    loadPriceCache();
    loadChartCache();
    
    updateUserUI();
    initChart();
    initCurrencySetting();
    initPushNotifications();
    initUpdateSection();
    initTickerAutocomplete();
    loadExchangeRates();
    
    // Sync pinned markets from server if logged in
    if (token) {
        try {
            const me = await api('/auth/me');
            if (me.settings?.pinnedMarkets) {
                pinnedMarkets = me.settings.pinnedMarkets;
                localStorage.setItem('pinnedMarkets', JSON.stringify(pinnedMarkets));
            }
            if (me.settings?.currency) {
                userCurrency = me.settings.currency;
                localStorage.setItem('userCurrency', userCurrency);
                initCurrencySetting();
            }
        } catch (e) { console.warn('Failed to load settings:', e); }
    }
    
    // Load user data
    await Promise.all([loadPortfolio(), loadWatchlists()]);
    
    // Render watchlist/alerts immediately, but only show summary if we have cached prices
    const hasCachedPrices = Object.keys(priceCache || {}).length > 0;
    if (hasCachedPrices) {
        renderPositions();
        updateSummary();
    }
    renderWatchlist();
    renderAlerts();
    updateCacheStatus();
    
    // Feature 3: Remember last page
    const lastPage = localStorage.getItem('lastPage');
    if (lastPage) showPage(lastPage);
    
    // On-chain holdings now flow through positions (wallet sync)
    
    // Load chart (don't await - let it load in background)
    updateChart();
    
    // Fetch fresh market data
    renderMarkets();
    
    // Load portfolio performance chart
    loadPerformance();
    
    // Background: refresh prices for positions/watchlist
    setTimeout(async () => {
        // Build list of symbols including option symbols
        const stockSymbols = [
            ...positions.filter(p => p.type !== 'option').map(p => p.symbol),
            ...watchlist.map(w => w.symbol)
        ];
        const optionSymbols = positions
            .filter(p => p.type === 'option' && p.expiry_date && p.strike_price)
            .map(p => buildOptionSymbol(p.symbol, p.expiry_date, p.strike_price))
            .filter(Boolean);
        
        const allSymbols = [...new Set([...stockSymbols, ...optionSymbols])];
        await fetchQuotes(allSymbols);
        renderPositions();
        renderWatchlist();
        renderAlerts();
        updateSummary();
        updateCacheStatus();
        savePriceCache();
        // Re-render performance chart with fresh price data
        loadPerformance();
    }, 100);
    
    // Auto refresh every 60s
    setInterval(async () => {
        const symbols = [...new Set([...positions.map(p => p.symbol), ...watchlist.slice(0, 10).map(w => w.symbol)])];
        await fetchQuotes(symbols);
        await renderMarkets();
        updateSummary();
        renderPositions();
        renderWatchlist();
        renderAlerts();
        updateCacheStatus();
        savePriceCache();
    }, 60000);
}

// Start — validate token server-side before trusting it
if (token) {
    fetch(`${API_BASE}/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => {
            if (r.ok) {
                hideAuth();
                setupSessionTimeout(token);
                initApp();
            } else if (r.status === 401) {
                // Token truly invalid (e.g. server secret rotated) — clear and show login
                localStorage.removeItem('token');
                token = null;
                showAuth();
            } else {
                // Non-auth error (500, network issue) — keep token, try loading anyway
                hideAuth();
                initApp();
            }
        })
        .catch(() => {
            // Network error / aborted — try loading anyway with cached token
            hideAuth();
            setupSessionTimeout(token);
            initApp();
        });
} else {
    showAuth();
}

// ============ KEYBOARD SHORTCUTS ============
document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        // Escape blurs input
        if (e.key === 'Escape') document.activeElement.blur();
        return;
    }

    switch(e.key) {
        case 'Escape':
            // Close any open modal
            document.querySelectorAll('.modal').forEach(m => {
                if (m.style.display === 'flex' || m.style.display === 'block') {
                    m.style.display = 'none';
                }
            });
            break;
        case '/':
            e.preventDefault();
            // Focus position search if on portfolio page, otherwise ticker search
            const posSearch = document.getElementById('positionSearchInput');
            const activePage = document.querySelector('.page[style*="display: block"], .page.active');
            if (activePage?.id === 'page-portfolio' && posSearch) {
                posSearch.focus();
            } else {
                const tickerSearch = document.getElementById('tickerSearch');
                if (tickerSearch) tickerSearch.focus();
            }
            break;
        case '1': if (e.altKey) { e.preventDefault(); switchPage('dashboard'); } break;
        case '2': if (e.altKey) { e.preventDefault(); switchPage('portfolio'); } break;
        case '3': if (e.altKey) { e.preventDefault(); switchPage('watchlist'); } break;
        case '4': if (e.altKey) { e.preventDefault(); switchPage('alerts'); } break;
        case '5': if (e.altKey) { e.preventDefault(); switchPage('wallets'); } break;
        case '6': if (e.altKey) { e.preventDefault(); switchPage('settings'); } break;
    }
});

// ============ SESSION TIMEOUT ============
// Server-side validation handles expired/invalid tokens on API calls.
// Only show client-side warning when token is genuinely close to expiry.
(function scheduleSessionWarning() {
    if (!token) return;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const exp = payload.exp * 1000;
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        if (exp <= now) {
            // Already expired — logout silently, server will reject anyway
            logout();
        } else if (exp - now < oneHour) {
            // Less than 1 hour left — schedule a single warning
            showToast('⏰ Session expires soon. Re-login to continue.', 'warning');
        } else {
            // Schedule warning for 1 hour before expiry
            setTimeout(() => {
                showToast('⏰ Session expires soon. Re-login to continue.', 'warning');
            }, exp - now - oneHour);
        }
    } catch(e) { /* ignore parse errors */ }
})();

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    // Unregister old service workers to prevent stale cache issues
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
    });
    // Clear all caches
    if (window.caches) {
        caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    }
}
