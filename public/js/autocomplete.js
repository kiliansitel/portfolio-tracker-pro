// ============ TICKER AUTOCOMPLETE ============
let autocompleteTimeout = null;
let selectedIndex = -1;
let autocompleteResults = [];
let isDropdownVisible = false;
let activeAutocompleteInput = null;

// Enhanced reusable autocomplete system
function initTickerAutocomplete() {
    // Initialize autocomplete for all ticker inputs
    initAutocompleteForInput('symbolInput', 'positionForm');
    initAutocompleteForInput('watchlistSymbolInput', 'watchlistForm');
    initAutocompleteForInput('alertSymbolInput', 'alertForm');
    initAutocompleteForInput('transactionSymbolInput', 'transactionForm');
}

function initAutocompleteForInput(inputId, formId) {
    const input = document.getElementById(inputId);
    const form = document.getElementById(formId);
    if (!input || !form) return;

    const dropdown = input.nextElementSibling; // Should be the dropdown
    if (!dropdown || !dropdown.classList.contains('autocomplete-dropdown')) return;

    // Show popular tickers on focus
    input.addEventListener('focus', async () => {
        activeAutocompleteInput = { input, form, dropdown };
        if (input.value.trim() === '') {
            await showPopularTickers(dropdown);
        }
    });

    // Search on input
    input.addEventListener('input', (e) => {
        activeAutocompleteInput = { input, form, dropdown };
        const query = e.target.value.trim();
        selectedIndex = -1;
        
        if (query === '') {
            showPopularTickers(dropdown);
        } else {
            searchTickers(query, dropdown);
        }
    });

    // Handle keyboard navigation
    input.addEventListener('keydown', (e) => {
        if (!isDropdownVisible) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, autocompleteResults.length - 1);
                updateSelection(dropdown);
                break;
            case 'ArrowUp':
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                updateSelection(dropdown);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0) {
                    selectAutocompleteTicker(autocompleteResults[selectedIndex], input, form);
                }
                break;
            case 'Escape':
                hideDropdown(dropdown);
                input.blur();
                break;
        }
    });

    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-container')) {
            hideDropdown(dropdown);
        }
    });
}

async function showPopularTickers(dropdown) {
    const targetDropdown = dropdown || getActiveDropdown();
    if (!targetDropdown) return;

    try {
        showLoadingDropdown(targetDropdown);
        const response = await fetch('/api/tickers/popular');
        if (!response.ok) throw new Error('Failed to fetch popular tickers');
        const tickers = await response.json();
        autocompleteResults = tickers.slice(0, 8);
        renderDropdown(autocompleteResults, targetDropdown);
        showDropdown(targetDropdown);
    } catch (error) {
        console.error('Error loading popular tickers:', error);
        hideDropdown(targetDropdown);
    }
}

function searchTickers(query, dropdown) {
    const targetDropdown = dropdown || getActiveDropdown();
    if (!targetDropdown) return;

    // Clear existing timeout
    if (autocompleteTimeout) {
        clearTimeout(autocompleteTimeout);
    }

    // Show loading state immediately for better UX
    showLoadingDropdown(targetDropdown);

    // Debounce search requests (300ms delay)
    autocompleteTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`/api/tickers/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('Search failed');
            const tickers = await response.json();
            autocompleteResults = tickers.slice(0, 10);
            
            if (autocompleteResults.length === 0) {
                renderNoResults(targetDropdown);
            } else {
                renderDropdown(autocompleteResults, targetDropdown);
            }
            showDropdown(targetDropdown);
        } catch (error) {
            console.error('Error searching tickers:', error);
            renderErrorState(targetDropdown);
            showDropdown(targetDropdown);
        }
    }, 300);
}

function renderDropdown(tickers, dropdown) {
    const targetDropdown = dropdown || getActiveDropdown();
    if (!targetDropdown) return;

    selectedIndex = -1; // Reset selection

    targetDropdown.innerHTML = tickers.map((ticker, index) => `
        <div class="autocomplete-item"
             data-symbol="${escapeAttr(ticker.symbol)}"
             data-name="${escapeAttr(ticker.name)}"
             onmousedown="event.preventDefault(); selectTickerFromClick(this)"
             ontouchend="event.preventDefault(); selectTickerFromClick(this)">
            <span class="autocomplete-symbol">${escapeHtml(ticker.symbol)}</span>
            <span class="autocomplete-name">${escapeHtml(ticker.name)}</span>
        </div>
    `).join('');
}

function showLoadingDropdown(dropdown) {
    const targetDropdown = dropdown || getActiveDropdown();
    if (!targetDropdown) return;

    targetDropdown.innerHTML = '<div class="autocomplete-loading">Searching tickers...</div>';
    showDropdown(targetDropdown);
}

function renderNoResults(dropdown) {
    const targetDropdown = dropdown || getActiveDropdown();
    if (!targetDropdown) return;

    targetDropdown.innerHTML = '<div class="autocomplete-loading">No tickers found</div>';
}

function renderErrorState(dropdown) {
    const targetDropdown = dropdown || getActiveDropdown();
    if (!targetDropdown) return;

    targetDropdown.innerHTML = '<div class="autocomplete-loading">Error loading tickers</div>';
}

function updateSelection(dropdown) {
    const targetDropdown = dropdown || getActiveDropdown();
    if (!targetDropdown) return;

    const items = targetDropdown.querySelectorAll('.autocomplete-item');
    items.forEach((item, index) => {
        item.classList.toggle('selected', index === selectedIndex);
    });

    // Scroll selected item into view
    if (selectedIndex >= 0 && items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
    }
}

function selectAutocompleteTicker(ticker, input, form) {
    if (!activeAutocompleteInput) return;

    const { input: activeInput, form: activeForm, dropdown: activeDropdown } = activeAutocompleteInput;
    const targetInput = input || activeInput;
    const targetForm = form || activeForm;
    
    // Set symbol
    targetInput.value = ticker.symbol;
    
    // Set name if available (only some forms have name fields)
    const nameInput = targetForm.querySelector('[name="name"]');
    if (nameInput && (!nameInput.value || nameInput.value.trim() === '')) {
        nameInput.value = ticker.name;
    }
    
    hideDropdown(activeDropdown);
    selectedIndex = -1;
    
    // Focus next relevant input based on form type
    if (targetForm.id === 'positionForm') {
        const quantityInput = targetForm.querySelector('[name="quantity"]');
        if (quantityInput) quantityInput.focus();
    } else if (targetForm.id === 'alertForm') {
        const targetPriceInput = targetForm.querySelector('[name="target_price"]');
        if (targetPriceInput) targetPriceInput.focus();
    } else if (targetForm.id === 'transactionForm') {
        const quantityInput = targetForm.querySelector('[name="quantity"]');
        if (quantityInput) quantityInput.focus();
    }
}

function selectTickerFromClick(element, dropdownId) {
    const ticker = {
        symbol: element.dataset.symbol,
        name: element.dataset.name
    };
    
    // Find the input associated with this dropdown
    let dropdown, container, input, form;
    
    if (dropdownId) {
        dropdown = document.getElementById(dropdownId);
        container = dropdown?.parentElement;
        input = container?.querySelector('input[type="text"]');
        form = input?.closest('form');
    } else {
        // Fallback: find the dropdown this element belongs to
        dropdown = element.closest('.autocomplete-dropdown');
        container = dropdown?.parentElement;
        input = container?.querySelector('input[type="text"]');
        form = input?.closest('form');
    }
    
    selectAutocompleteTicker(ticker, input, form);
}

function showDropdown(dropdown) {
    const targetDropdown = dropdown || getActiveDropdown();
    if (!targetDropdown) return;

    targetDropdown.classList.remove('hidden');
    isDropdownVisible = true;
}

function hideDropdown(dropdown) {
    const targetDropdown = dropdown || getActiveDropdown();
    if (!targetDropdown) return;

    targetDropdown.classList.add('hidden');
    targetDropdown.innerHTML = ''; // Clear loading/error text
    isDropdownVisible = false;
    selectedIndex = -1;
    
    if (autocompleteTimeout) {
        clearTimeout(autocompleteTimeout);
        autocompleteTimeout = null;
    }
}

function getActiveDropdown() {
    return activeAutocompleteInput?.dropdown || document.getElementById('symbolDropdown');
}

async function savePosition(e) {
    e.preventDefault();
    if (!token || !portfolioId) {
        alert('Please login to save positions');
        return;
    }
    const form = e.target;
    const entryPrice = parseFloat(form.entry_price.value);
    const entryCurrency = form.entry_currency?.value || 'USD';
    
    const data = {
        symbol: form.symbol.value.toUpperCase(),
        name: form.name.value,
        type: form.type.value,
        quantity: parseFloat(form.quantity.value),
        entry_price: entryPrice,
        currency: entryCurrency,
        entry_date: form.entry_date.value || null,
        notes: form.notes.value,
        strike_price: form.strike_price.value ? parseFloat(form.strike_price.value) : null,
        expiry_date: form.expiry_date.value || null,
        current_price: form.current_price?.value ? parseFloat(form.current_price.value) : null,
        multiplier: form.multiplier.value ? parseFloat(form.multiplier.value) : 1,
        location: form.location.value.trim() || null,
        affects_cash: editingPositionId ? undefined : document.getElementById('addPositionAffectsCash')?.checked
    };
    
    // Remove undefined keys
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
    
    try {
        if (editingPositionId) {
            await api(`/portfolios/positions/${editingPositionId}`, { method: 'PUT', body: JSON.stringify(data) });
            editingPositionId = null;
        } else {
            await api(`/portfolios/${portfolioId}/positions`, { method: 'POST', body: JSON.stringify(data) });
        }
        closeModal('addPositionModal');
        form.reset();
        document.getElementById('addPositionTitle').textContent = 'Add Position';
        await loadPortfolio();
        
        // Auto-add to "Main Watchlist" if not already present
        if (!editingPositionId && watchlistId) {
            const symbol = data.symbol;
            const existingItem = watchlist.find(w => w.symbol === symbol);
            if (!existingItem) {
                try {
                    await api(`/watchlists/${watchlistId}/items`, {
                        method: 'POST',
                        body: JSON.stringify({
                            symbol: symbol,
                            name: data.name || '',
                            category: 'general'
                        })
                    });
                    await loadWatchlists(); // Refresh watchlist
                    showToast(`${symbol} added to Main Watchlist`, 'success');
                } catch (e) {
                    console.error('Failed to auto-add to watchlist:', e);
                    // Don't show error to user as this is a convenience feature
                }
            }
        }
    } catch (e) {
        alert(e.message);
    }
}

async function saveWatchlistItem(e) {
    e.preventDefault();
    if (!token || !watchlistId) {
        alert('Please login to save watchlist items');
        return;
    }
    const form = e.target;
    const data = {
        symbol: form.symbol.value.toUpperCase(),
        name: form.name.value,
        alert_below: form.alert_below.value ? parseFloat(form.alert_below.value) : null,
        alert_above: form.alert_above.value ? parseFloat(form.alert_above.value) : null,
        category: form.category.value
    };
    
    try {
        if (editingWatchlistItemId) {
            await api(`/watchlists/items/${editingWatchlistItemId}`, { method: 'PUT', body: JSON.stringify(data) });
            editingWatchlistItemId = null;
        } else {
            await api(`/watchlists/${watchlistId}/items`, { method: 'POST', body: JSON.stringify(data) });
        }
        closeModal('addWatchlistModal');
        form.reset();
        document.getElementById('addWatchlistTitle').textContent = 'Add to Watchlist';
        await loadWatchlists();
        renderAlerts();
    } catch (e) {
        alert(e.message);
    }
}

// Load alerts from API
async function loadAlerts() {
    if (!token) return;
    try {
        alerts = await api('/alerts');
    } catch (e) {
        console.error('Failed to load alerts:', e);
        alerts = [];
    }
}

async function renderAlerts() {
    await loadAlerts(); // Load alerts from API
    const el = document.getElementById('alertsList');
    
    if (alerts.length === 0) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔔</div><div class="empty-state-text">No alerts set. Create price alerts to get notified!</div><p style="color:var(--text-secondary);font-size:0.9rem;">Add alerts via the + button</p></div>';
        return;
    }
    
    // Fetch prices for alert symbols that aren't cached
    const symbolsToFetch = alerts
        .map(alert => alert.symbol)
        .filter(symbol => !priceCache[symbol] || Date.now() - priceCache[symbol]._fetchedAt > 300000); // 5 min cache
    
    if (symbolsToFetch.length > 0) {
        const quotes = await Promise.allSettled(symbolsToFetch.map(fetchQuote));
        quotes.forEach((result, i) => {
            if (result.status === 'fulfilled' && result.value) {
                priceCache[symbolsToFetch[i]] = result.value;
            }
        });
    }
    
    let html = '';
    for (const alert of alerts) {
        const q = priceCache[alert.symbol];
        const price = q?.price || 0;
        
        const condition = `${alert.condition} ${fp(alert.value)}`;
        let status = 'pending';
        let statusText = '⏳ Active';
        
        if (!alert.is_active) {
            status = 'triggered';
            statusText = '🔔 TRIGGERED';
        }
        
        // Calculate proximity percentage for progress bar
        let proximityPct = 0;
        let proximityColor = 'var(--accent-blue)';
        if (price > 0) {
            if (alert.condition === 'below') {
                proximityPct = Math.max(0, Math.min(100, (2 - price / alert.value) * 100));
            } else if (alert.condition === 'above') {
                proximityPct = Math.max(0, Math.min(100, (price / alert.value) * 100));
            }
            if (proximityPct >= 80) proximityColor = 'var(--accent-green)';
            else if (proximityPct >= 50) proximityColor = '#f39c12';
        }
        
        const progressBar = price > 0 ? `
            <div style="width:100%;height:4px;background:var(--bg-tertiary);border-radius:2px;margin-top:6px;overflow:hidden;">
                <div style="width:${proximityPct}%;height:100%;background:${proximityColor};border-radius:2px;transition:width 0.3s;"></div>
            </div>
            <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:2px;">${proximityPct.toFixed(0)}% to target</div>
        ` : '';
        
        html += `<div class="swipe-container" data-id="${alert.id}" data-type="alert">
            <div class="swipe-actions">
                <div class="swipe-action delete" onclick="deleteAlert(${alert.id})">🗑️</div>
            </div>
            <div class="swipe-content alert-item">
                <div class="alert-info" onclick="selectTicker('${alert.symbol}')" style="cursor:pointer;flex:1;display:flex;align-items:center;gap:10px;">
                    ${logoHtml(alert.symbol, 32)}
                    <div style="flex:1;">
                        <div class="alert-symbol">${alert.symbol}</div>
                        <div class="alert-condition">${condition}</div>
                        <div style="font-size:0.8rem;color:var(--text-secondary);">Current: ${price > 0 ? fp(price) : 'Loading...'}</div>
                        ${progressBar}
                    </div>
                </div>
                <div class="alert-status ${status}">${statusText}</div>
            </div>
        </div>`;
    }
    el.innerHTML = html;
    setupSwipeHandlers();
}

