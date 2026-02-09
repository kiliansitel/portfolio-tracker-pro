// ============ CHANGE PASSWORD ============
async function changePassword() {
    const currentPassword = document.getElementById('currentPasswordInput').value;
    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('Please fill in all password fields', 'error');
        return;
    }
    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }
    if (newPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        showToast('Password needs uppercase, lowercase, and a number', 'error');
        return;
    }

    try {
        const res = await api('/auth/password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword })
        });
        showToast(res.message || 'Password changed successfully', 'success');
        document.getElementById('currentPasswordInput').value = '';
        document.getElementById('newPasswordInput').value = '';
        document.getElementById('confirmPasswordInput').value = '';
    } catch (err) {
        showToast(err.message || 'Failed to change password', 'error');
    }
}

// ============ EDIT EMAIL ============
function startEditEmail() {
    const currentEmail = document.getElementById('settingsEmail').textContent;
    document.getElementById('emailEditInput').value = currentEmail === '--' ? '' : currentEmail;
    document.getElementById('emailDisplay').style.display = 'none';
    document.getElementById('emailEditForm').style.display = 'block';
    document.getElementById('emailEditInput').focus();
}

function cancelEditEmail() {
    document.getElementById('emailDisplay').style.display = '';
    document.getElementById('emailEditForm').style.display = 'none';
}

async function saveEmail() {
    const email = document.getElementById('emailEditInput').value.trim();
    if (!email) {
        showToast('Email cannot be empty', 'error');
        return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast('Invalid email format', 'error');
        return;
    }

    try {
        const res = await api('/auth/email', {
            method: 'PUT',
            body: JSON.stringify({ email })
        });
        document.getElementById('settingsEmail').textContent = res.email || email;
        cancelEditEmail();
        showToast(res.message || 'Email updated successfully', 'success');
    } catch (err) {
        showToast(err.message || 'Failed to update email', 'error');
    }
}

// ============ BACKUP & RESTORE ============
async function downloadBackup() {
    try {
        showToast('Preparing backup...', 'info');
        const response = await fetch('/api/backup', {
            headers: token ? { 'Authorization': 'Bearer ' + token } : {},
            credentials: 'include'
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Backup failed');
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().split('T')[0];
        a.download = `portfolio-backup-${date}.db`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Backup downloaded!', 'success');
    } catch (err) {
        showToast(err.message || 'Failed to download backup', 'error');
    }
}

async function restoreBackup(input) {
    const file = input.files[0];
    if (!file) return;

    // Reset file input so same file can be selected again
    input.value = '';

    if (!confirm('⚠️ This will replace ALL data in the database. Are you sure you want to restore from this backup?')) {
        return;
    }

    try {
        showToast('Restoring backup...', 'info');
        const arrayBuffer = await file.arrayBuffer();
        const response = await fetch('/api/backup/restore', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                ...(token ? { 'Authorization': 'Bearer ' + token } : {})
            },
            credentials: 'include',
            body: arrayBuffer
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Restore failed');
        }
        const result = await response.json();
        showToast(result.message || 'Database restored! Reloading...', 'success');
        setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
        showToast(err.message || 'Failed to restore backup', 'error');
    }
}

// ============ PUSH NOTIFICATIONS ============
let pushSubscription = null;

async function togglePushNotifications() {
    const btn = document.getElementById('pushToggle');
    const status = document.getElementById('pushStatus');
    
    if (pushSubscription) {
        // Unsubscribe
        try {
            await pushSubscription.unsubscribe();
            await api('/push/unsubscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: pushSubscription.endpoint }) });
            pushSubscription = null;
            btn.textContent = '🔔 Enable';
            btn.classList.remove('active');
            status.textContent = 'Get browser alerts when price targets are hit';
            showToast('Push notifications disabled', 'info');
        } catch(e) {
            console.error('Failed to unsubscribe:', e);
        }
    } else {
        // Subscribe
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                showToast('Notification permission denied', 'error');
                return;
            }
            
            const reg = await navigator.serviceWorker.ready;
            const keyRes = await fetch('/api/push/vapid-public-key').then(r => r.json());
            
            pushSubscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey)
            });
            
            await api('/push/subscribe', { method: 'POST', body: JSON.stringify(pushSubscription) });
            
            btn.textContent = '🔕 Disable';
            btn.classList.add('active');
            status.textContent = '✅ Push notifications active';
            showToast('Push notifications enabled!', 'success');
        } catch(e) {
            console.error('Failed to subscribe:', e);
            showToast('Failed to enable notifications: ' + e.message, 'error');
        }
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function initPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        const btn = document.getElementById('pushToggle');
        if (btn) { btn.textContent = '🔒 Requires HTTPS'; btn.disabled = true; btn.style.fontSize = '0.75rem'; btn.style.opacity = '0.6'; }
        const status = document.getElementById('pushStatus');
        if (status) status.textContent = 'Push notifications require HTTPS. Use your SSL domain.';
        return;
    }
    try {
        await navigator.serviceWorker.register('/sw.js');
        const reg = await navigator.serviceWorker.ready;
        pushSubscription = await reg.pushManager.getSubscription();
        if (pushSubscription) {
            const btn = document.getElementById('pushToggle');
            if (btn) { btn.textContent = '🔕 Disable'; btn.classList.add('active'); }
            const status = document.getElementById('pushStatus');
            if (status) status.textContent = '✅ Push notifications active';
        }
    } catch(e) {
        console.warn('Service worker registration failed:', e);
    }
}

// Edit mode state (must be declared before render functions)
let editingPositionId = null;
let editingWatchlistItemId = null;

// Build Yahoo option ticker symbol
// Format: QQQ270617C00800000 (underlying + YYMMDD + C/P + strike*1000 padded to 8)
function buildOptionSymbol(underlying, expiryDate, strike, isCall = true) {
    if (!underlying || !expiryDate || !strike) return null;
    const d = new Date(expiryDate);
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const cp = isCall ? 'C' : 'P';
    const strikeStr = String(Math.round(strike * 1000)).padStart(8, '0');
    return `${underlying.toUpperCase()}${yy}${mm}${dd}${cp}${strikeStr}`;
}

// ============ APP UPDATES ============
let updateState = { updateAvailable: false, channel: 'beta' };

async function initUpdateSection() {
    try {
        const status = await api('/updates/status');
        updateState = { ...updateState, ...status };
        
        document.getElementById('updateCurrentVersion').textContent = status.currentVersion;
        document.getElementById('updateCommitHash').textContent = status.commitHash ? `(${status.commitHash})` : '';
        
        // Set channel dropdown
        const channelSelect = document.getElementById('updateChannel');
        if (channelSelect) channelSelect.value = status.settings?.channel || status.channel || 'beta';

        // Auto-update toggle
        const autoBtn = document.getElementById('autoUpdateToggle');
        const isAutoOn = !!status.settings?.autoUpdate;
        autoBtn.checked = isAutoOn;
        autoBtn.closest('.toggle-switch').classList.toggle('active', isAutoOn);

        // Last check time
        if (status.lastCheckTime) {
            updateLastCheckedDisplay(status.lastCheckTime);
        }

        // If we have cached check result, show it
        if (status.lastCheckResult) {
            renderUpdateResult(status.lastCheckResult);
        }
    } catch (e) {
        console.warn('Failed to load update status:', e);
    }
}

function renderUpdateResult(result) {
    const latestEl = document.getElementById('updateLatestVersion');
    const badgeEl = document.getElementById('updateStatusBadge');
    const applyBtn = document.getElementById('applyUpdateBtn');
    const channel = result.channel || 'beta';
    
    const latestVer = channel === 'beta' ? result.latestBeta : result.latestMain;
    latestEl.textContent = latestVer || result.currentVersion;
    
    if (result.updateAvailable) {
        const commits = result.commitsAhead ? ` (${result.commitsAhead} commits)` : '';
        badgeEl.innerHTML = `<span style="color: var(--accent-green); font-weight: 600;">⬆️ Update Available${commits}</span>`;
        if (result.isDocker) {
            applyBtn.style.display = 'none';
            badgeEl.innerHTML += `<div style="margin-top:8px;font-size:0.8rem;color:var(--text-secondary);background:var(--bg-secondary);padding:8px 12px;border-radius:8px;">
                🐳 Docker install — update via:<br>
                <code style="font-size:0.75rem;">docker pull kiliansitel/portfolio-tracker-pro:latest</code>
            </div>`;
        } else {
            applyBtn.style.display = '';
        }
        updateState.updateAvailable = true;
    } else {
        badgeEl.innerHTML = '<span style="color: var(--accent-green);">✅ Up to date</span>';
        applyBtn.style.display = 'none';
        updateState.updateAvailable = false;
    }
}

function updateLastCheckedDisplay(isoTime) {
    const el = document.getElementById('updateLastChecked');
    if (!isoTime) { el.textContent = 'Last checked: never'; return; }
    const diff = Date.now() - new Date(isoTime).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) el.textContent = 'Last checked: just now';
    else if (mins < 60) el.textContent = `Last checked: ${mins} minute${mins > 1 ? 's' : ''} ago`;
    else {
        const hrs = Math.floor(mins / 60);
        el.textContent = `Last checked: ${hrs} hour${hrs > 1 ? 's' : ''} ago`;
    }
}

async function checkForUpdates() {
    const btn = document.getElementById('checkUpdatesBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Checking...';
    try {
        const result = await api('/updates/check');
        renderUpdateResult(result);
        updateLastCheckedDisplay(result.checkedAt);
        if (result.updateAvailable) {
            showToast('Update available! 🎉', 'success');
        } else {
            showToast('You\'re up to date ✅', 'info');
        }
    } catch (e) {
        showToast('Failed to check for updates', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Check for Updates';
    }
}

async function applyUpdate() {
    const btn = document.getElementById('applyUpdateBtn');
    const channel = document.getElementById('updateChannel').value;
    
    if (!confirm(`Apply update from the "${channel}" channel? The app will restart.`)) return;
    
    btn.disabled = true;
    btn.textContent = '⏳ Updating...';
    btn.style.opacity = '0.7';
    
    try {
        const resp = await fetch('/api/updates/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ channel })
        });
        const data = await resp.json();
        if (data.isDocker) {
            btn.disabled = false;
            btn.textContent = '⬆️ Apply Update';
            btn.style.opacity = '1';
            showToast('🐳 Docker install — run: docker pull kiliansitel/portfolio-tracker-pro:latest', 'info');
            return;
        }
        if (resp.ok && !data.success) throw new Error(data.error || 'Update failed');
    } catch (e) {
        // Connection errors are EXPECTED — server restarted mid-response
        // Update request ended (expected during restart)
    }
    
    btn.textContent = '🔄 Restarting...';
    showToast('Update applied! Waiting for restart...', 'success');
    
    // Wait for server to come back, then reload
    setTimeout(() => {
        const checkReady = setInterval(async () => {
            try {
                const r = await fetch('/api/info');
                if (r.ok) {
                    clearInterval(checkReady);
                    window.location.reload();
                }
            } catch (e) { /* server still restarting */ }
        }, 2000);
        // Give up after 60 seconds
        setTimeout(() => {
            clearInterval(checkReady);
            btn.textContent = '⚠️ Restart taking long — refresh manually';
            btn.disabled = false;
        }, 60000);
    }, 2000);
}

async function toggleAutoUpdate() {
    const cb = document.getElementById('autoUpdateToggle');
    const label = cb.closest('.toggle-switch');
    const isOn = cb.checked;
    label.classList.toggle('active', isOn);
    try {
        await api('/updates/settings', {
            method: 'POST',
            body: JSON.stringify({ autoUpdate: isOn })
        });
        showToast(isOn ? 'Auto-update enabled' : 'Auto-update disabled', isOn ? 'success' : 'info');
    } catch (e) {
        cb.checked = !isOn;
        label.classList.toggle('active', !isOn);
        showToast('Failed to update setting', 'error');
    }
}

async function changeUpdateChannel() {
    const channel = document.getElementById('updateChannel').value;
    try {
        await api('/updates/settings', {
            method: 'POST',
            body: JSON.stringify({ channel })
        });
        showToast(`Channel set to ${channel}`, 'info');
    } catch (e) {
        showToast('Failed to change channel', 'error');
    }
}

