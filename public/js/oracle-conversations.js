// ============ ORACLE — CONVERSATIONS PANEL ============
function openAiConversations() {
    closeAiSettings();
    document.getElementById('aiPanelOverlay').classList.add('show');
    document.getElementById('aiConversationPanel').classList.add('show');
    loadAiConversations();
}

function closeAiConversations() {
    document.getElementById('aiPanelOverlay').classList.remove('show');
    document.getElementById('aiConversationPanel').classList.remove('show');
}

async function loadAiConversations() {
    const container = document.getElementById('aiConversationList');
    try {
        aiConversations = await api('/ai/conversations');
    } catch (e) {
        container.innerHTML = '<div style="padding:16px;color:var(--text-secondary);font-size:0.85rem;">Failed to load conversations</div>';
        return;
    }

    if (!aiConversations.length) {
        container.innerHTML = '<div style="padding:16px;color:var(--text-secondary);font-size:0.85rem;text-align:center;">No conversations yet.<br>Start chatting!</div>';
        return;
    }

    let html = '';
    for (const conv of aiConversations) {
        const date = new Date(conv.updated_at || conv.created_at);
        const timeStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const isActive = conv.id === aiCurrentConversationId;
        const isReport = conv.context && conv.context.startsWith('report-');
        const contextBadge = isReport 
            ? `<span style="font-size:0.7rem;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:1px 6px;border-radius:8px;">📊 ${conv.context === 'report-daily' ? 'Daily' : 'Weekly'}</span>`
            : (conv.context && conv.context !== 'general' ?
            `<span style="font-size:0.7rem;background:var(--bg-tertiary);padding:1px 6px;border-radius:8px;">${conv.context}</span>` : '');

        html += `<div class="ai-conv-item ${isActive ? 'active' : ''}" onclick="loadAiConversation(${conv.id})">
            <div style="overflow:hidden;">
                <div class="ai-conv-title">${(conv.title || 'Untitled').replace(/</g, '&lt;')}</div>
                <div class="ai-conv-meta">${timeStr} ${contextBadge}</div>
            </div>
            <button class="ai-conv-delete" onclick="event.stopPropagation();deleteAiConversation(${conv.id})" title="Delete">🗑️</button>
        </div>`;
    }

    container.innerHTML = html;
}

async function loadAiConversation(convId) {
    try {
        const conv = await api(`/ai/conversations/${convId}`);
        aiCurrentConversationId = convId;

        // Clear messages
        const container = document.getElementById('aiMessages');
        container.innerHTML = '';

        // Render messages
        if (conv.messages && conv.messages.length) {
            for (const msg of conv.messages) {
                appendAiMessage(msg.content, msg.role);
            }
        }

        // Hide welcome and quick actions
        const welcome = document.getElementById('aiWelcome');
        if (welcome) welcome.style.display = 'none';
        const qa = document.getElementById('aiQuickActions');
        if (qa) qa.style.display = 'none';

        closeAiConversations();
    } catch (e) {
        showToast('Failed to load conversation: ' + e.message, 'error');
    }
}
