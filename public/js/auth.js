// ============ AUTH ============
document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.onclick = () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`${tab.dataset.form}Form`).classList.add('active');
        document.getElementById('authError').classList.remove('show');
    };
});

// Session timeout now handled by scheduleSessionWarning() at bottom of file
function setupSessionTimeout(jwt) { /* no-op, handled globally */ }

document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
        const data = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ login: form.login.value, password: form.password.value })
        });
        token = data.token;
        user = data.user;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        setupSessionTimeout(token);
        hideAuth();
        initApp();
    } catch (err) {
        showAuthError(err.message);
    }
};

document.getElementById('registerForm').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
        const data = await api('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username: form.username.value, email: form.email.value, password: form.password.value })
        });
        token = data.token;
        user = data.user;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        setupSessionTimeout(token);
        hideAuth();
        initApp();
    } catch (err) {
        showAuthError(err.message);
    }
};

function showAuthError(msg) {
    const el = document.getElementById('authError');
    el.textContent = msg;
    el.classList.add('show');
}

function showToast(message, type = 'info') {
    // Create toast element if it doesn't exist
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            pointer-events: none;
        `;
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px;
        pointer-events: auto;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        max-width: 300px;
        word-wrap: break-word;
    `;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.style.transform = 'translateX(0)', 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 3000);
}

function hideAuth() {
    document.getElementById('authOverlay').classList.add('hidden');
}

function showAuth() {
    document.getElementById('authOverlay').classList.remove('hidden');
}

function continueAsGuest() {
    hideAuth();
    user = { username: 'Guest' };
    initApp();
}

function logout() {
    token = null;
    user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    positions = [];
    watchlist = [];
    showAuth();
}

