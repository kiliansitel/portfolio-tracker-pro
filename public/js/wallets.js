// ============ WALLETS ============
let walletsData = [];

const CHAIN_ICONS = {
    btc: '₿',
    eth: '⟠',
    sol: '◎',
    bnb: '⬡',
    avax: '🔺',
    matic: '⬡',
    arb: '🔵',
    op: '🔴',
    ltc: 'Ł',
    doge: 'Ð',
    xrp: '✕',
    ada: '₳',
    dot: '●',
};
const CHAIN_COLORS = {
    btc: '#F7931A',
    eth: '#627EEA',
    sol: '#9945FF',
    bnb: '#F3BA2F',
    avax: '#E84142',
    matic: '#8247E5',
    arb: '#28A0F0',
    op: '#FF0420',
    ltc: '#345D9D',
    doge: '#C2A633',
    xrp: '#23292F',
    ada: '#0033AD',
    dot: '#E6007A',
};

async function loadWallets() {
    if (!token) return;
    try {
        walletsData = await api('/wallets');
    } catch (e) {
        console.error('Failed to load wallets:', e);
        walletsData = [];
    }
}

function truncateAddress(addr) {
    if (!addr || addr.length <= 16) return addr;
    return addr.slice(0, 8) + '...' + addr.slice(-6);
}

function timeSince(dateStr) {
    if (!dateStr) return 'Never';
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
}

async function renderWallets() {
    await loadWallets();
    const el = document.getElementById('walletsList');
    if (!el) return;

    if (walletsData.length === 0) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔗</div><div class="empty-state-text">No wallets connected. Add a blockchain wallet to track on-chain!</div><p style="color:var(--text-secondary);font-size:0.9rem;">Add a blockchain wallet to track on-chain balances</p></div>';
        return;
    }

    let totalUsd = 0;
    let html = '';

    // Summary bar
    for (const w of walletsData) totalUsd += (w.usd_value || 0);
    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border-color);margin-bottom:12px;">
        <div style="font-size:0.9rem;color:var(--text-secondary);">${walletsData.length} wallet${walletsData.length !== 1 ? 's' : ''}</div>
        <div style="font-size:1.1rem;font-weight:600;">${fc(totalUsd)}</div>
    </div>`;

    for (const w of walletsData) {
        const chainIcon = CHAIN_ICONS[w.chain] || '?';
        const chainColor = CHAIN_COLORS[w.chain] || 'var(--text-primary)';
        const balStr = w.balance !== null && w.balance !== undefined ? Number(w.balance).toFixed(w.chain === 'btc' ? 8 : 4) : '0';
        const usdStr = fc(w.usd_value || 0);
        const syncTime = timeSince(w.last_synced);
        const tokenCount = w.token_count || 0;
        const tokens = w.tokens || [];
        const hasTokenSupport = ['eth','bnb','avax','matic','arb','op','sol'].includes(w.chain);

        html += `<div class="swipe-container" data-id="${w.id}" data-type="wallet">
            <div class="swipe-actions">
                <div class="swipe-action delete" onclick="deleteWallet(${w.id})">🗑️</div>
            </div>
            <div class="swipe-content" style="padding:12px 0;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:40px;height:40px;border-radius:50%;background:${chainColor}20;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;color:${chainColor};">${chainIcon}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div style="font-weight:600;font-size:0.95rem;">${escapeHtml(w.label || w.chain_name || w.chain.toUpperCase())}</div>
                            <div style="font-weight:600;">${usdStr}</div>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
                            <div style="font-size:0.8rem;color:var(--text-secondary);font-family:monospace;" title="${escapeAttr(w.address)}">${escapeHtml(truncateAddress(w.address))}</div>
                            <div style="font-size:0.8rem;color:var(--text-secondary);">${balStr} ${w.chain.toUpperCase()}</div>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
                            <div style="display:flex;gap:6px;align-items:center;">
                                <span style="font-size:0.75rem;color:var(--text-secondary);">Synced: ${syncTime}</span>
                                ${hasTokenSupport && tokenCount > 0 ? (() => { const defiCount = tokens.filter(t => t.protocol).length; const label = defiCount > 0 ? `🪙 ${tokenCount - defiCount} token${(tokenCount - defiCount) !== 1 ? 's' : ''} · 🏦 ${defiCount} DeFi` : `🪙 ${tokenCount} token${tokenCount !== 1 ? 's' : ''}`; return `<button onclick="toggleWalletTokens(${w.id})" style="background:none;border:none;cursor:pointer;font-size:0.7rem;color:var(--accent-blue);padding:1px 6px;border-radius:10px;border:1px solid var(--accent-blue);">${label}</button>`; })() : ''}
                            </div>
                            <div style="display:flex;gap:8px;align-items:center;">
                                <button onclick="showWalletTx(${w.id}, '${w.chain}', this.dataset.label)" data-label="${escapeAttr(w.label || w.chain_name || w.chain.toUpperCase())}" style="background:none;border:none;cursor:pointer;font-size:0.75rem;color:var(--accent-blue);padding:2px 4px;">📜 Txs</button>
                                <button onclick="syncWallet(${w.id})" style="background:none;border:none;cursor:pointer;font-size:0.8rem;color:var(--accent-blue);padding:2px 6px;">🔄 Sync</button>
                                <button onclick="deleteWallet(${w.id})" style="background:none;border:none;cursor:pointer;font-size:0.8rem;color:var(--accent-red);padding:2px 6px;">🗑️</button>
                            </div>
                        </div>
                    </div>
                </div>`;

        html += `</div></div>`;

        // Collapsible token list with DeFi separation (OUTSIDE swipe-container)
        if (hasTokenSupport && tokens.length > 0) {
            // Split tokens into regular and DeFi
            const regularTokens = tokens.filter(t => !t.protocol);
            const defiTokens = tokens.filter(t => t.protocol);
            const regularUsd = regularTokens.reduce((s, t) => s + (t.usd_value || 0), 0);
            const defiUsd = defiTokens.reduce((s, t) => s + (t.usd_value || 0), 0);
            const tokenLabel = w.chain === 'sol' ? 'SPL Tokens' : 'ERC-20 Tokens';

            html += `<div id="wallet-tokens-${w.id}" style="display:none;margin-left:52px;border-top:1px solid var(--border-color);padding:8px 0;">`;

            // Regular tokens (ERC-20 or SPL)
            if (regularTokens.length > 0) {
                html += `<div style="font-size:0.7rem;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">${tokenLabel} — ${fc(regularUsd)}</div>`;
                for (const t of regularTokens) {
                    const tBal = parseFloat(t.balance) || 0;
                    const tBalStr = tBal >= 1000 ? tBal.toLocaleString(undefined, {maximumFractionDigits: 2}) : tBal.toFixed(Math.min(6, Math.max(2, 4 - Math.floor(Math.log10(Math.max(tBal, 0.0001))))));
                    const tUsdStr = fc(t.usd_value || 0);
                    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:0.8rem;">
                        <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                            <span style="font-weight:600;color:var(--text-primary);">${escapeHtml(t.symbol)}</span>
                            <span style="color:var(--text-secondary);font-size:0.7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;" title="${escapeAttr(t.name)}">${escapeHtml(t.name)}</span>
                        </div>
                        <div style="text-align:right;flex-shrink:0;">
                            <div style="font-weight:500;">${tUsdStr}</div>
                            <div style="font-size:0.7rem;color:var(--text-secondary);">${tBalStr}</div>
                        </div>
                    </div>`;
                }
            }

            // DeFi positions section
            if (defiTokens.length > 0) {
                html += `<div style="font-size:0.7rem;color:var(--text-secondary);margin-top:${regularTokens.length > 0 ? '10' : '0'}px;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">🏦 DeFi Positions — ${fc(defiUsd)}</div>`;
                for (const t of defiTokens) {
                    const tBal = parseFloat(t.balance) || 0;
                    const tBalStr = tBal >= 1000 ? tBal.toLocaleString(undefined, {maximumFractionDigits: 2}) : tBal.toFixed(Math.min(6, Math.max(2, 4 - Math.floor(Math.log10(Math.max(tBal, 0.0001))))));
                    const tUsdStr = fc(t.usd_value || 0);
                    // Protocol badge
                    const protocolIcon = t.protocol === 'Lido' || t.protocol === 'Coinbase' || t.protocol === 'Rocket Pool' ? '🥩' : '🏦';
                    const badgeColor = t.protocol === 'Aave' ? '#B6509E' : t.protocol === 'Compound' ? '#00D395' : t.protocol === 'Lido' ? '#00A3FF' : t.protocol === 'Rocket Pool' ? '#FF6E40' : 'var(--accent-blue)';
                    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:0.8rem;">
                        <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                            <span style="font-weight:600;color:var(--text-primary);">${escapeHtml(t.symbol)}</span>
                            <span style="font-size:0.6rem;padding:1px 5px;border-radius:8px;background:${badgeColor}20;color:${badgeColor};font-weight:600;white-space:nowrap;">${protocolIcon} ${escapeHtml(t.protocol)}</span>
                        </div>
                        <div style="text-align:right;flex-shrink:0;">
                            <div style="font-weight:500;">${tUsdStr}</div>
                            <div style="font-size:0.7rem;color:var(--text-secondary);">${tBalStr}</div>
                        </div>
                    </div>`;
                }
            }

            html += `</div>`;
        }
    }

    el.innerHTML = html;
    setupSwipeHandlers();
}

function showAddWalletModal() {
    document.getElementById('walletForm').reset();
    updateAddressPlaceholder(); // Set initial placeholder for Bitcoin (default selection)
    showModal('addWalletModal');
}

// Frontend address validation functions
function validateBtcAddress(address) {
    const base58Regex = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
    const bech32Regex = /^bc1[02-9ac-hj-np-z]{7,87}$/;
    return base58Regex.test(address) || bech32Regex.test(address);
}

function validateEvmAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function validateSolAddress(address) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function validateLtcAddress(address) {
    const legacyRegex = /^[LM][a-km-zA-HJ-NP-Z1-9]{26,33}$/;
    const bech32Regex = /^ltc1[02-9ac-hj-np-z]{7,87}$/;
    return legacyRegex.test(address) || bech32Regex.test(address);
}

function validateDogeAddress(address) {
    return /^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$/.test(address);
}

function validateXrpAddress(address) {
    return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);
}

function validateAdaAddress(address) {
    return /^addr1[02-9ac-hj-np-z]{7,103}$/.test(address);
}

function validateDotAddress(address) {
    return /^1[a-km-zA-HJ-NP-Z1-9]{24,47}$/.test(address);
}

function validateWalletAddress(chain, address) {
    const validators = {
        btc: validateBtcAddress,
        eth: validateEvmAddress,
        bnb: validateEvmAddress,
        avax: validateEvmAddress,
        matic: validateEvmAddress,
        arb: validateEvmAddress,
        op: validateEvmAddress,
        sol: validateSolAddress,
        ltc: validateLtcAddress,
        doge: validateDogeAddress,
        xrp: validateXrpAddress,
        ada: validateAdaAddress,
        dot: validateDotAddress,
    };
    
    const validator = validators[chain];
    return validator ? validator(address) : false;
}

function getAddressExample(chain) {
    const examples = {
        btc: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa or bc1q...',
        eth: '0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7d',
        bnb: '0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7d',
        avax: '0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7d',
        matic: '0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7d',
        arb: '0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7d',
        op: '0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7d',
        sol: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        ltc: 'LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL or ltc1q...',
        doge: 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L',
        xrp: 'rDfNhYvC2TmFyJ4BFqwbVHDyVGvF7j1M2',
        ada: 'addr1qxy3rsdp8g7qvs9z8w6z8m3j6x9q5v8n...',
        dot: '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5',
    };
    return examples[chain] || 'please check the address format';
}

function updateAddressPlaceholder() {
    const form = document.getElementById('walletForm');
    const chain = form.chain.value;
    const addressInput = form.address;
    
    const placeholders = {
        btc: 'e.g. bc1q... or 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        eth: 'e.g. 0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7d',
        bnb: 'e.g. 0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7d',
        avax: 'e.g. 0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7d',
        matic: 'e.g. 0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7d',
        arb: 'e.g. 0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7d',
        op: 'e.g. 0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7d',
        sol: 'e.g. 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        ltc: 'e.g. LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL',
        doge: 'e.g. DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L',
        xrp: 'e.g. rDfNhYvC2TmFyJ4BFqwbVHDyVGvF7j1M2',
        ada: 'e.g. addr1qxy3rsdp8g7qvs9z8w6z8m3j6x9q5v8n...',
        dot: 'e.g. 15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5',
    };
    
    addressInput.placeholder = placeholders[chain] || 'Enter wallet address';
    
    // Clear validation feedback when chain changes
    const feedback = document.getElementById('addressValidationFeedback');
    if (feedback) feedback.innerHTML = '';
    
    // Re-validate current address if any
    if (addressInput.value.trim()) {
        validateAddressInput(addressInput);
    }
}

function validateAddressInput(input) {
    const form = document.getElementById('walletForm');
    const chain = form.chain.value;
    const address = input.value.trim();
    const feedback = document.getElementById('addressValidationFeedback');
    
    if (!address) {
        feedback.innerHTML = '';
        input.style.borderColor = 'var(--border-color)';
        return;
    }
    
    if (validateWalletAddress(chain, address)) {
        feedback.innerHTML = '<span style="color: var(--accent-green);">✓ Valid address format</span>';
        input.style.borderColor = 'var(--accent-green)';
    } else {
        const chainName = {
            btc: 'Bitcoin', eth: 'Ethereum', sol: 'Solana', bnb: 'BNB',
            avax: 'Avalanche', matic: 'Polygon', arb: 'Arbitrum', op: 'Optimism',
            ltc: 'Litecoin', doge: 'Dogecoin', xrp: 'Ripple', ada: 'Cardano', dot: 'Polkadot'
        }[chain] || chain.toUpperCase();
        feedback.innerHTML = `<span style="color: var(--accent-red);">⚠ Invalid ${chainName} address format</span>`;
        input.style.borderColor = 'var(--accent-red)';
    }
}

async function saveWallet(e) {
    e.preventDefault();
    const form = document.getElementById('walletForm');
    const chain = form.chain.value;
    const address = form.address.value.trim();
    const label = form.label.value.trim();

    if (!address) {
        showToast('Wallet address is required', 'error');
        return;
    }

    // Frontend address validation
    if (!validateWalletAddress(chain, address)) {
        const chainName = {
            btc: 'Bitcoin', eth: 'Ethereum', sol: 'Solana', bnb: 'BNB',
            avax: 'Avalanche', matic: 'Polygon', arb: 'Arbitrum', op: 'Optimism',
            ltc: 'Litecoin', doge: 'Dogecoin', xrp: 'Ripple', ada: 'Cardano', dot: 'Polkadot'
        }[chain] || chain.toUpperCase();
        showToast(`Invalid ${chainName} address format. Example: ${getAddressExample(chain)}`, 'error');
        return;
    }

    try {
        await api('/wallets', {
            method: 'POST',
            body: JSON.stringify({ chain, address, label }),
        });
        closeModal('addWalletModal');
        showToast('Wallet added! Syncing balance...', 'success');
        await renderWallets();
        // Auto-sync the newly added wallet
        if (walletsData.length > 0) {
            const newest = walletsData[walletsData.length - 1];
            await syncWallet(newest.id);
        }
    } catch (err) {
        showToast(err.message || 'Failed to add wallet', 'error');
    }
}

function toggleWalletTokens(walletId) {
    const el = document.getElementById(`wallet-tokens-${walletId}`);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function deleteWallet(id) {
    if (!await confirmDialog('Remove this wallet?', { title: 'Remove Wallet', confirmText: 'Remove', danger: true })) return;
    try {
        await api('/wallets/' + id, { method: 'DELETE' });
        showToast('Wallet removed', 'success');
        await renderWallets();
    } catch (err) {
        showToast(err.message || 'Failed to delete wallet', 'error');
    }
}

async function syncWallet(id) {
    try {
        showToast('Syncing wallet...', 'info');
        const result = await api('/wallets/' + id + '/sync', { method: 'POST' });
        showToast('Wallet synced!', 'success');
        await renderWallets();
        // Refresh positions since wallet sync updates them
        await loadPortfolio();
        renderPositions();
        updateSummary();
    } catch (err) {
        showToast('Sync failed: ' + (err.message || 'Unknown error'), 'error');
    }
}

async function syncAllWallets() {
    try {
        showToast('Syncing all wallets...', 'info');
        const result = await api('/wallets/sync-all', { method: 'POST' });
        const errCount = result.errors ? result.errors.length : 0;
        if (errCount > 0) {
            showToast(`Synced ${result.synced}/${result.total} wallets (${errCount} failed)`, 'error');
        } else {
            const posActions = (result.position_sync || []).filter(p => p.action !== 'skipped_manual');
            const posMsg = posActions.length > 0 ? ` | ${posActions.length} position(s) updated` : '';
            showToast(`All ${result.synced} wallets synced!${posMsg}`, 'success');
        }
        await renderWallets();
        // Refresh positions since wallet sync updates them
        await loadPortfolio();
        renderPositions();
        updateSummary();
    } catch (err) {
        showToast('Sync failed: ' + (err.message || 'Unknown error'), 'error');
    }
}

// ---- Wallet Transactions ----
let currentWalletTxId = null;
const EXPLORER_TX_URLS = {
    btc: 'https://mempool.space/tx/',
    eth: 'https://etherscan.io/tx/',
    sol: 'https://solscan.io/tx/',
};

async function showWalletTx(walletId, chain, label) {
    currentWalletTxId = walletId;
    document.getElementById('walletTxTitle').textContent = `${label} — Transactions`;
    document.getElementById('walletTxBody').innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-text">Loading...</div></div>';
    document.getElementById('walletTxFetchBtn').style.display = chain === 'sol' ? 'none' : 'inline-block';
    showModal('walletTxModal');
    await loadWalletTx(walletId);
}

async function loadWalletTx(walletId) {
    try {
        const data = await api(`/wallets/${walletId}/transactions?limit=50`);
        const body = document.getElementById('walletTxBody');
        const txs = data.transactions || [];
        const explorerBase = data.explorer_base || '';

        if (txs.length === 0) {
            body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">No transactions yet</div><p style="color:var(--text-secondary);font-size:0.85rem;">Click "Fetch from Chain" to import on-chain transactions</p></div>';
            return;
        }

        let html = '';
        for (const tx of txs) {
            const date = tx.block_time ? new Date(tx.block_time).toLocaleDateString() : '—';
            const time = tx.block_time ? new Date(tx.block_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
            const dirIcon = tx.direction === 'in' ? '↙️' : '↗️';
            const dirLabel = tx.direction === 'in' ? 'Received' : 'Sent';
            const dirColor = tx.direction === 'in' ? 'var(--accent-green, #22c55e)' : 'var(--accent-red, #ef4444)';
            const hashShort = tx.tx_hash ? tx.tx_hash.slice(0, 8) + '...' + tx.tx_hash.slice(-6) : '';
            const explorerUrl = explorerBase + tx.tx_hash;
            const amountStr = Number(tx.amount).toFixed(tx.chain === 'btc' ? 8 : 6);
            const feeStr = tx.fee ? Number(tx.fee).toFixed(8) : '';
            const counterpartyShort = tx.counterparty ? tx.counterparty.slice(0, 8) + '...' + tx.counterparty.slice(-4) : '—';

            html += `<div style="padding:10px 0;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:10px;">
                <div style="font-size:1.3rem;flex-shrink:0;">${dirIcon}</div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-weight:600;color:${dirColor};font-size:0.9rem;">${dirLabel}</span>
                        <span style="font-weight:600;font-size:0.9rem;">${amountStr} ${tx.chain.toUpperCase()}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
                        <span style="font-size:0.75rem;color:var(--text-secondary);" title="${tx.counterparty || ''}">${tx.direction === 'in' ? 'From' : 'To'}: ${counterpartyShort}</span>
                        <span style="font-size:0.75rem;color:var(--text-secondary);">${date} ${time}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
                        <a href="${explorerUrl}" target="_blank" rel="noopener" style="font-size:0.7rem;color:var(--accent-blue);font-family:monospace;text-decoration:none;" title="View on explorer">${hashShort}</a>
                        ${feeStr ? `<span style="font-size:0.7rem;color:var(--text-secondary);">Fee: ${feeStr}</span>` : ''}
                    </div>
                </div>
            </div>`;
        }
        body.innerHTML = html;
    } catch (err) {
        document.getElementById('walletTxBody').innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">Failed to load: ${err.message}</div></div>`;
    }
}

async function fetchWalletTxFromChain() {
    if (!currentWalletTxId) return;
    const btn = document.getElementById('walletTxFetchBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Fetching...';
    try {
        const result = await api(`/wallets/${currentWalletTxId}/fetch-transactions`, { method: 'POST' });
        showToast(`Fetched ${result.stored || 0} new transactions`, 'success');
        await loadWalletTx(currentWalletTxId);
    } catch (err) {
        showToast('Fetch failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔄 Fetch from Chain';
    }
}

// On-Chain Holdings card removed — wallet balances now sync directly into positions

// Transactions
// Clean transaction loading and display logic
let transactions = [];

async function loadTransactions() {
    if (!token || !currentPortfolio) {
        // Missing token or portfolio for transactions
        return false;
    }
    
    try {
        const response = await fetch(`/api/transactions/portfolios/${currentPortfolio.id}/transactions?limit=100`, {
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load transactions: ' + response.status);
        }
        
        const data = await response.json();
        transactions = data.transactions || [];
        // Transactions loaded
        return true;
    } catch (error) {
        console.error('Error loading transactions:', error);
        transactions = [];
        return false;
    }
}

async function renderTransactions() {
    const el = document.getElementById('transactionsList');
    try {
        // Ensure we have authentication and portfolio
        if (!token) {
            console.error('renderTransactions: No token');
            el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔒</div><div class="empty-state-text">Please log in to view transactions</div></div>';
            return;
        }
        
        if (!currentPortfolio) {
            await loadPortfolio();
            if (!currentPortfolio) {
                console.error('renderTransactions: No portfolio after load');
                el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">Could not load portfolio</div></div>';
                return;
            }
        }
        
        // Show loading state
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-text">Loading transactions...</div></div>';
        
        // Load transactions
        const success = await loadTransactions();
        if (!success) {
            el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">Failed to load transactions</div></div>';
            return;
        }
        
        if (transactions.length === 0) {
            el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-text">No transactions recorded yet.</div></div>';
            return;
        }
        
        // Render transactions
        let html = '';
        for (let i = 0; i < transactions.length; i++) {
            const tx = transactions[i];
            const date = new Date(tx.executed_at).toLocaleDateString();
            const multiplier = tx.type === 'option' ? 100 : 1;
            const total = (tx.quantity * tx.price * multiplier + (tx.fees || 0)).toFixed(2);
            const actionClass = tx.action === 'buy' ? 'positive' : 'negative';
            const actionIcon = tx.action === 'buy' ? '📈' : '📉';
            
            html += '<div class="swipe-container" data-id="' + tx.id + '" data-type="transaction">';
            html += '<div class="swipe-actions">';
            html += '<div class="swipe-action delete" onclick="deleteTransaction(' + tx.id + ')">🗑️</div>';
            html += '</div>';
            html += '<div class="swipe-content" style="padding:12px;display:flex;justify-content:space-between;align-items:center;">';
            html += '<div onclick="selectTicker(\'' + tx.symbol + '\')" style="cursor:pointer;flex:1;display:flex;align-items:center;gap:10px;">';
            html += logoHtml(tx.symbol, 28);
            html += '<div>';
            html += '<div style="font-weight:600;">' + actionIcon + ' ' + tx.symbol + '</div>';
            html += '<div style="font-size:0.8rem;color:var(--text-secondary);">' + tx.action.toUpperCase() + ' ' + tx.quantity + ' @ ' + fp(tx.price);
            if (tx.type !== 'stock') {
                html += ' (' + tx.type + ')';
            }
            html += '</div>';
            if (tx.location) {
                html += '<div style="font-size:0.7rem;"><span style="color:var(--text-secondary);background:var(--bg-tertiary);padding:1px 5px;border-radius:3px;">' + tx.location + '</span></div>';
            } else if (tx.notes && !tx.notes.startsWith('wallet-tx:')) {
                html += '<div style="font-size:0.75rem;color:var(--text-secondary);font-style:italic;">' + tx.notes + '</div>';
            }
            // Badges row
            const badges = [];
            if (tx.source === 'wallet') {
                badges.push('<span style="font-size:0.65rem;color:var(--accent-color);background:rgba(var(--accent-rgb,100,149,237),0.15);padding:1px 5px;border-radius:3px;">🔗 On-Chain</span>');
            }
            if (tx.affects_cash === 1) {
                badges.push('<span style="font-size:0.65rem;color:#4caf50;background:rgba(76,175,80,0.12);padding:1px 5px;border-radius:3px;">💰 Cash</span>');
            } else if (tx.affects_cash === 0) {
                badges.push('<span style="font-size:0.65rem;color:var(--text-secondary);opacity:0.6;padding:1px 5px;">No cash impact</span>');
            }
            if (badges.length > 0) {
                html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px;">' + badges.join('') + '</div>';
            }
            html += '</div>';
            html += '</div>';
            html += '<div style="text-align:right;">';
            html += '<div class="' + actionClass + '" style="font-weight:600;">';
            html += (tx.action === 'buy' ? '-' : '+') + fc(total);
            html += '</div>';
            html += '<div style="font-size:0.8rem;color:var(--text-secondary);">' + date + '</div>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
        }
        
        el.innerHTML = html;
        setupSwipeHandlers();
        // Transactions rendered
    } catch (err) {
        console.error('renderTransactions error:', err);
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💥</div><div class="empty-state-text">Error: ' + err.message + '</div></div>';
    }
}

function showAddTransactionModal() {
    document.getElementById('transactionForm').reset();
    document.getElementById('addTransactionTitle').textContent = 'Add Transaction';
    // Set default date to now
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.querySelector('#transactionForm [name="executed_at"]').value = now.toISOString().slice(0, 16);
    showModal('addTransactionModal');
}

async function saveTransaction(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
        symbol: form.symbol.value,
        action: form.action.value,
        type: form.type.value,
        quantity: parseFloat(form.quantity.value),
        price: parseFloat(form.price.value),
        fees: form.fees.value ? parseFloat(form.fees.value) : 0,
        notes: form.notes.value || null,
        executed_at: form.executed_at.value ? new Date(form.executed_at.value).toISOString() : new Date().toISOString(),
        location: form.location.value.trim() || null
    };
    
    try {
        await api(`/transactions/portfolios/${currentPortfolio.id}/transactions`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        closeModal('addTransactionModal');
        renderTransactions();
    } catch (e) {
        alert('Failed to save transaction: ' + e.message);
    }
}

async function deleteTransaction(id) {
    if (!await confirmDialog('Delete this transaction?', { title: 'Delete Transaction', confirmText: 'Delete', danger: true })) return;
    try {
        await api(`/transactions/${id}`, { method: 'DELETE' });
        renderTransactions();
    } catch (e) {
        alert('Failed to delete: ' + e.message);
    }
}

async function deletePosition(id) {
    if (!await confirmDialog('Delete this position?', { title: 'Delete Position', confirmText: 'Delete', danger: true })) return;
    try {
        await api(`/portfolios/positions/${id}`, { method: 'DELETE' });
        await loadPortfolio();
    } catch (e) {
        alert(e.message);
    }
}

async function deleteWatchlistItem(id) {
    if (!await confirmDialog('Remove from watchlist?', { title: 'Remove Item', confirmText: 'Remove', danger: true })) return;
    try {
        await api(`/watchlists/items/${id}`, { method: 'DELETE' });
        await loadWatchlists();
    } catch (e) {
        alert(e.message);
    }
}

async function deleteAlert(id) {
    if (!await confirmDialog('Delete this price alert?', { title: 'Delete Alert', confirmText: 'Delete', danger: true })) return;
    try {
        await api(`/alerts/${id}`, { method: 'DELETE' });
        await renderAlerts();
    } catch (e) {
        alert('Failed to delete alert: ' + e.message);
    }
}

async function updateCashSetting() {
    if (!token || !portfolioId) return;
    let cash = parseFloat(document.getElementById('settingsCash').value) || 0;
    // Store cash in user's currency (no conversion) with currency tag
    try {
        await api(`/portfolios/${portfolioId}`, { method: 'PUT', body: JSON.stringify({ cash, cash_currency: userCurrency }) });
        showToast('Cash updated: ' + formatCurrency(cash, userCurrency), 'success');
    } catch (e) {
        console.error(e);
    }
}

// Feature 5: Duplicate portfolio
async function duplicatePortfolio() {
    if (!token || !portfolioId) { showToast('No portfolio selected', 'error'); return; }
    if (!await confirmDialog('Duplicate the current portfolio with all positions?', { title: 'Duplicate Portfolio', confirmText: 'Duplicate' })) return;
    try {
        const result = await api(`/portfolios/${portfolioId}/duplicate`, { method: 'POST' });
        showToast(`Portfolio duplicated as "${result.name}"`, 'success');
        await loadPortfolio();
        renderPositions();
    } catch (e) {
        showToast('Failed to duplicate: ' + e.message, 'error');
    }
}

