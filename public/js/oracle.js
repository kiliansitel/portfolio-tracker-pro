// ============ AI ORACLE ============
let aiProviders = [];
let aiSelectedProvider = localStorage.getItem('aiProvider') || '';
let aiSelectedModel = localStorage.getItem('aiModel') || '';
let aiCurrentConversationId = null;
let aiIsStreaming = false;
let aiActiveContexts = ['general'];
let aiConversations = [];
let aiOnboardingChecked = false;

// ============ VOICE INPUT ============
let voiceRecognition = null;
let voiceIsListening = false;

function initVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = document.getElementById('aiVoiceBtn');
    if (!SpeechRecognition || !btn) {
        if (btn) btn.style.display = 'none';
        return;
    }
    btn.style.display = 'flex';
    voiceRecognition = new SpeechRecognition();
    voiceRecognition.continuous = false;
    voiceRecognition.interimResults = true;
    voiceRecognition.lang = 'en-US';

    voiceRecognition.onresult = (event) => {
        const input = document.getElementById('aiInput');
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        if (input) {
            input.value = transcript;
            aiInputAutoResize(input);
        }
    };
    voiceRecognition.onend = () => stopVoiceVisual();
    voiceRecognition.onerror = (e) => {
        console.warn('Voice input error:', e.error);
        stopVoiceVisual();
        if (e.error === 'not-allowed') {
            if (typeof showToast === 'function') showToast('Microphone access denied', 'error');
        }
    };
}

function toggleVoiceInput() {
    if (!voiceRecognition) return;
    if (voiceIsListening) {
        voiceRecognition.stop();
        stopVoiceVisual();
    } else {
        voiceRecognition.start();
        voiceIsListening = true;
        const btn = document.getElementById('aiVoiceBtn');
        if (btn) btn.classList.add('voice-listening');
    }
}

function stopVoiceVisual() {
    voiceIsListening = false;
    const btn = document.getElementById('aiVoiceBtn');
    if (btn) btn.classList.remove('voice-listening');
}

// Check if user needs onboarding (no positions in any portfolio)
async function checkOnboardingNeeded() {
    try {
        const resp = await fetch(`${API_BASE}/portfolios`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const portfolios = await resp.json();
        console.log('[ONBOARD] portfolios:', portfolios.length);
        if (!portfolios.length) return true;
        for (const pf of portfolios) {
            const posResp = await fetch(`${API_BASE}/portfolios/${pf.id}/positions`, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const positions = await posResp.json();
            console.log('[ONBOARD] portfolio', pf.id, 'positions:', positions.length);
            if (Array.isArray(positions) && positions.length > 0) return false;
        }
        return true;
    } catch (e) {
        console.log('[ONBOARD] error:', e.message);
        return true; // Assume onboarding needed if check fails
    }
}

// Update the welcome screen based on onboarding state
function updateWelcomeForOnboarding(needsOnboarding) {
    const welcome = document.getElementById('aiWelcome');
    const qa = document.getElementById('aiQuickActions');

    // Always add "Build My Portfolio" to quick actions (for all users)
    if (qa && !qa.querySelector('.ai-onboard-btn')) {
        const onboardBtn = document.createElement('button');
        onboardBtn.className = 'ai-quick-btn' + (needsOnboarding ? ' ai-onboard-btn' : '');
        onboardBtn.textContent = '🚀 Build My Portfolio';
        onboardBtn.onclick = () => aiQuickAction('onboarding');
        if (needsOnboarding) {
            qa.prepend(onboardBtn); // First position + pulsing glow for empty portfolios
        } else {
            qa.appendChild(onboardBtn); // Last position, normal style for existing users
        }
    }

    // Update welcome message for empty portfolios
    if (welcome && needsOnboarding) {
        welcome.innerHTML = `
            <div class="ai-welcome-icon">🚀</div>
            <h3>Welcome to Oracle!</h3>
            <p>Let's build your first portfolio! Tell me your goals and budget, and I'll suggest a personalized portfolio you can add with one click. Or explore any of the actions below.</p>
        `;
    }
}

// Initialize AI when page is shown
async function initAi() {
    initVoiceInput();
    try {
        aiProviders = await api('/ai/providers');
        updateAiProviderBadge();
    } catch (e) {
        console.warn('AI init failed, retrying:', e);
        // Retry once after delay
        try {
            await new Promise(r => setTimeout(r, 1500));
            aiProviders = await api('/ai/providers');
            updateAiProviderBadge();
        } catch (e2) {
            console.warn('AI init retry failed:', e2);
        }
    }
    // Check onboarding once per session — always add Build Portfolio button
    if (!aiOnboardingChecked) {
        aiOnboardingChecked = true;
        const needsOnboarding = await checkOnboardingNeeded();
        console.log('[ONBOARD] needsOnboarding:', needsOnboarding, 'providers:', aiProviders?.length);
        updateWelcomeForOnboarding(needsOnboarding);
    }
}

function updateAiProviderBadge() {
    const badge = document.getElementById('aiProviderBadge');
    if (!badge) return;

    const configured = aiProviders.filter(p => p.configured);
    const available = aiProviders.filter(p => p.configured || !p.requiresKey);
    if (!available.length) {
        badge.textContent = 'No provider';
        badge.style.color = 'var(--accent-red)';
        return;
    }

    // Always auto-select a configured provider — never stay on "No provider"
    const cachedProvider = available.find(p => p.id === aiSelectedProvider);
    const cachedIsConfigured = cachedProvider && cachedProvider.configured;
    if (!aiSelectedProvider || !cachedIsConfigured) {
        // Prefer actually configured providers (e.g. openclaw auto-detected)
        const best = configured[0] || available[0];
        aiSelectedProvider = best.id;
        aiSelectedModel = best.modelPreference || (best.models[0]?.id) || '';
        localStorage.setItem('aiProvider', aiSelectedProvider);
        localStorage.setItem('aiModel', aiSelectedModel);
    }

    // Validate cached model exists in the selected provider's model list
    const p = aiProviders.find(p => p.id === aiSelectedProvider);
    if (p && p.models?.length && aiSelectedModel && !p.models.find(m => m.id === aiSelectedModel)) {
        // Don't auto-correct for Ollama — its models are dynamically discovered, hardcoded list is just defaults
        if (p.id !== 'ollama') {
            aiSelectedModel = p.modelPreference || p.models[0]?.id || '';
            localStorage.setItem('aiModel', aiSelectedModel);
        }
    }
    const modelName = aiSelectedModel ?
        (p?.models?.find(m => m.id === aiSelectedModel)?.name || aiSelectedModel.split('/').pop()) :
        'default';
    badge.textContent = `${p?.name || aiSelectedProvider} · ${modelName}`;
    badge.style.color = '';
}

function toggleAiModelDropdown() {
    const dd = document.getElementById('aiModelDropdown');
    if (dd.classList.contains('show')) {
        dd.classList.remove('show');
        return;
    }

    let html = '';
    const configured = aiProviders.filter(p => p.configured || !p.requiresKey);

    for (const provider of configured) {
        html += `<div class="ai-model-dropdown-section">${provider.name}</div>`;
        let models = provider.models || [];
        // For Ollama, fetch dynamic models and update dropdown async
        if (provider.id === 'ollama' && provider.baseUrl) {
            const ollamaSectionId = 'ollama-header-models';
            html += `<div id="${ollamaSectionId}"><div class="ai-model-dropdown-item" style="opacity:0.5;">🔄 Loading models...</div></div>`;
            (async () => {
                try {
                    const resp = await api(`/ai/models/ollama?baseUrl=${encodeURIComponent(provider.baseUrl)}`);
                    const el = document.getElementById(ollamaSectionId);
                    if (!el) return;
                    const fetchedModels = resp.models?.length ? resp.models : (provider.models || []);
                    let mhtml = '';
                    for (const m of fetchedModels) {
                        const isActive = aiSelectedProvider === 'ollama' && aiSelectedModel === m.id;
                        mhtml += `<div class="ai-model-dropdown-item ${isActive ? 'active' : ''}"
                            onclick="selectAiModel('ollama', '${m.id.replace(/'/g, "\\'")}')">
                            <span>${m.name}</span>
                            ${isActive ? '<span style="color:var(--accent-green);">✓</span>' : ''}
                        </div>`;
                    }
                    el.innerHTML = mhtml;
                } catch(e) { console.error('Header Ollama fetch failed:', e); }
            })();
            continue;
        }
        if (!models.length && provider.id === 'custom') {
            const modelName = provider.modelPreference || 'custom-model';
            const isActive = aiSelectedProvider === provider.id;
            html += `<div class="ai-model-dropdown-item ${isActive ? 'active' : ''}"
                onclick="selectAiModel('${provider.id}', '${modelName}')">
                <span>${modelName}</span>
                ${isActive ? '<span style="color:var(--accent-green);">✓</span>' : ''}
            </div>`;
        }
        for (const model of models) {
            const isActive = aiSelectedProvider === provider.id && aiSelectedModel === model.id;
            html += `<div class="ai-model-dropdown-item ${isActive ? 'active' : ''}"
                onclick="selectAiModel('${provider.id}', '${model.id}')">
                <span>${model.name}</span>
                ${isActive ? '<span style="color:var(--accent-green);">✓</span>' : ''}
            </div>`;
        }
    }

    if (!configured.length) {
        html = '<div style="padding:16px;text-align:center;color:var(--text-secondary);font-size:0.85rem;">No providers configured. Click ⚙️ to set up.</div>';
    }

    dd.innerHTML = html;
    dd.classList.add('show');

    // Close on outside click
    setTimeout(() => {
        const handler = (e) => {
            if (!dd.contains(e.target) && e.target.id !== 'aiProviderBadge') {
                dd.classList.remove('show');
                document.removeEventListener('click', handler);
            }
        };
        document.addEventListener('click', handler);
    }, 10);
}

function selectAiModel(provider, model) {
    aiSelectedProvider = provider;
    aiSelectedModel = model;
    localStorage.setItem('aiProvider', provider);
    localStorage.setItem('aiModel', model);
    updateAiProviderBadge();
    document.getElementById('aiModelDropdown').classList.remove('show');
}

// Context chips
function toggleAiContext(chip) {
    const ctx = chip.dataset.context;
    if (ctx === 'general') {
        // General is exclusive — deselect others
        aiActiveContexts = ['general'];
        document.querySelectorAll('.ai-context-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        return;
    }

    // Deselect general if selecting something else
    const generalChip = document.querySelector('.ai-context-chip[data-context="general"]');
    if (generalChip) generalChip.classList.remove('active');
    aiActiveContexts = aiActiveContexts.filter(c => c !== 'general');

    if (chip.classList.contains('active')) {
        chip.classList.remove('active');
        aiActiveContexts = aiActiveContexts.filter(c => c !== ctx);
        // If nothing selected, revert to general
        if (!aiActiveContexts.length) {
            aiActiveContexts = ['general'];
            if (generalChip) generalChip.classList.add('active');
        }
    } else {
        chip.classList.add('active');
        aiActiveContexts.push(ctx);
    }
}

function getAiContextString() {
    return aiActiveContexts.join(',');
}

// ─── Action tag parsing ────────────────────────────────
function parseActions(text) {
    const actions = [];
    const cleanText = text.replace(/\[\[\[ACTION:(.*?)\]\]\]/g, (match, actionStr) => {
        const parts = actionStr.split(':');
        const type = parts[0];
        const params = parts.slice(1);
        let label = '';
        let icon = '';
        switch (type) {
            case 'alert':
                icon = '⚡'; label = `Set ${params[0]} alert at $${params[1]} (${params[2] || 'above'})`;
                break;
            case 'watchlist':
                icon = '👁️'; label = `Add ${params[0]} to watchlist`;
                break;
            case 'position':
                icon = '➕'; label = `Add ${params[1]} ${params[0]} @ $${params[2]}`;
                break;
            default:
                return '';
        }
        actions.push({ type, params, label, icon });
        return '';
    });
    return { cleanText, actions };
}

function createActionButtons(actions) {
    if (!actions.length) return null;
    const container = document.createElement('div');
    container.style.cssText = 'margin-top: 8px; display: flex; flex-wrap: wrap;';
    for (const action of actions) {
        const btn = document.createElement('button');
        btn.className = 'ai-action-btn';
        btn.innerHTML = `${action.icon} ${action.label}`;
        btn.onclick = async () => {
            console.log('[AI-ACTION] Button clicked:', action.type, action.params);
            if (btn.classList.contains('executed')) return;
            btn.disabled = true;
            btn.innerHTML = `⏳ ${action.label}`;
            try {
                console.log('[AI-ACTION] Sending fetch to', `${API_BASE}/ai/action`, { type: action.type, params: action.params });
                const resp = await fetch(`${API_BASE}/ai/action`, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: action.type, params: action.params })
                });
                const data = await resp.json();
                console.log('[AI-ACTION] Response:', data);
                if (data.success) {
                    btn.innerHTML = `✅ ${data.message}`;
                    btn.classList.add('executed');
                    showToast(data.message, 'success');
                    // Refresh relevant data so it appears immediately in the UI
                    if (action.type === 'position') await loadPortfolio();
                    if (action.type === 'watchlist') await loadWatchlists();
                    if (action.type === 'alert') await loadAlerts();
                } else {
                    btn.innerHTML = `❌ ${data.error || 'Failed'}`;
                    showToast(data.error || 'Action failed', 'error');
                }
            } catch (e) {
                console.error('[AI-ACTION] Error:', e);
                btn.innerHTML = `❌ Error`;
                showToast('Action failed', 'error');
            }
            btn.disabled = false;
        };
        container.appendChild(btn);
    }
    return container;
}

// Message rendering
function renderAiMarkdown(text) {
    if (!text) return '';
    let html = text;

    // Code blocks (``` ... ```)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
    });

    // Inline code (escape HTML inside)
    html = html.replace(/`([^`]+)`/g, (_, code) => {
        const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        return `<code>${escaped}</code>`;
    });

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Tables (simple markdown tables)
    html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm, (_, header, sep, body) => {
        const ths = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
        const rows = body.trim().split('\n').map(row => {
            const tds = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
            return `<tr>${tds}</tr>`;
        }).join('');
        return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    });

    // Unordered lists
    html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Line breaks (double newline = paragraph)
    html = html.replace(/\n\n/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');

    // Clean up extra <br> around block elements
    html = html.replace(/<br>(<\/?(?:h[1-3]|ul|ol|li|pre|table|thead|tbody|tr|th|td)>)/g, '$1');
    html = html.replace(/(<\/?(?:h[1-3]|ul|ol|li|pre|table|thead|tbody|tr|th|td)>)<br>/g, '$1');

    // Sanitize final HTML with DOMPurify
    if (typeof DOMPurify !== 'undefined') {
        html = DOMPurify.sanitize(html, { ADD_TAGS: ['h1', 'h2', 'h3'], ADD_ATTR: ['class'] });
    }

    return html;
}

function appendAiMessage(content, role, isStreaming = false) {
    const container = document.getElementById('aiMessages');
    const welcome = document.getElementById('aiWelcome');
    if (welcome) welcome.style.display = 'none';

    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-message ${role}`;
    msgDiv.dataset.role = role;

    const avatar = document.createElement('div');
    avatar.className = 'ai-message-avatar';
    avatar.textContent = role === 'assistant' ? '🧠' : '👤';

    const bubble = document.createElement('div');
    bubble.className = 'ai-message-bubble';

    if (role === 'assistant' && isStreaming) {
        bubble.innerHTML = '<div class="ai-typing"><div class="ai-typing-dot"></div><div class="ai-typing-dot"></div><div class="ai-typing-dot"></div></div>';
        msgDiv.dataset.streaming = 'true';
    } else if (role === 'assistant') {
        const { cleanText, actions: msgActions } = parseActions(content);
        bubble.innerHTML = renderAiMarkdown(cleanText);
        if (msgActions.length > 0) {
            const actionEl = createActionButtons(msgActions);
            actionEl.className = 'ai-action-container';
            bubble.appendChild(actionEl);
        }
    } else {
        bubble.innerHTML = content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;

    return msgDiv;
}

function createMessageActions(rawMarkdown) {
    const actions = document.createElement('div');
    actions.className = 'ai-message-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'ai-message-action-btn';
    copyBtn.innerHTML = '📋 Copy';
    copyBtn.onclick = async () => {
        try {
            // clipboard API requires HTTPS — fallback for HTTP
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(rawMarkdown);
            } else {
                const ta = document.createElement('textarea');
                ta.value = rawMarkdown;
                ta.style.cssText = 'position:fixed;left:-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            copyBtn.innerHTML = '✅ Copied';
            setTimeout(() => copyBtn.innerHTML = '📋 Copy', 2000);
        } catch { showToast('Failed to copy', 'error'); }
    };
    actions.appendChild(copyBtn);

    {
        const pdfBtn = document.createElement('button');
        pdfBtn.className = 'ai-message-action-btn';
        pdfBtn.innerHTML = '📄 PDF';
        pdfBtn.onclick = () => exportAiResponseAsPdf(rawMarkdown);
        actions.appendChild(pdfBtn);
    }

    {
        const shareBtn = document.createElement('button');
        shareBtn.className = 'ai-message-action-btn';
        shareBtn.innerHTML = '📤 Share';
        shareBtn.onclick = async () => {
            try {
                if (navigator.share) {
                    await navigator.share({ title: 'Oracle Analysis', text: rawMarkdown });
                } else {
                    // Fallback: copy and notify
                    const ta = document.createElement('textarea');
                    ta.value = rawMarkdown;
                    ta.style.cssText = 'position:fixed;left:-9999px';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    showToast('Copied to clipboard — paste to share!', 'success');
                }
            } catch (e) { if (e.name !== 'AbortError') showToast('Share failed', 'error'); }
        };
        actions.appendChild(shareBtn);
    }

    return actions;
}

function appendMessageActions(aiMessage) {
    const cleanMarkdown = aiMessage.replace(/\[\[\[ACTION:.*?\]\]\]/g, '').replace(/<<<.*?>>>/gs, '').trim();
    const container = document.getElementById('aiMessages');
    const msgs = container.querySelectorAll('.ai-message.assistant');
    const lastAssistant = msgs[msgs.length - 1];
    if (lastAssistant) {
        const bubble = lastAssistant.querySelector('.ai-message-bubble');
        if (bubble && !bubble.querySelector('.ai-message-actions')) {
            bubble.appendChild(createMessageActions(cleanMarkdown));
        }
    }
}

function updateLastAiMessage(content) {
    const container = document.getElementById('aiMessages');
    const msgs = container.querySelectorAll('.ai-message.assistant');
    const lastMsg = msgs[msgs.length - 1];
    if (!lastMsg) return;

    const bubble = lastMsg.querySelector('.ai-message-bubble');
    const { cleanText, actions } = parseActions(content);
    bubble.innerHTML = renderAiMarkdown(cleanText);
    // Re-add action buttons on each update (streaming adds content incrementally)
    const existingActions = bubble.querySelector('.ai-action-container');
    if (existingActions) existingActions.remove();
    if (actions.length > 0) {
        const actionEl = createActionButtons(actions);
        actionEl.className = 'ai-action-container';
        bubble.appendChild(actionEl);
    }
    lastMsg.dataset.streaming = '';
    container.scrollTop = container.scrollHeight;
}

function appendAiError(message) {
    const container = document.getElementById('aiMessages');
    const welcome = document.getElementById('aiWelcome');
    if (welcome) welcome.style.display = 'none';

    const msgDiv = document.createElement('div');
    msgDiv.className = 'ai-message assistant error';

    const avatar = document.createElement('div');
    avatar.className = 'ai-message-avatar';
    avatar.textContent = '⚠️';

    const bubble = document.createElement('div');
    bubble.className = 'ai-message-bubble';
    bubble.textContent = message;

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function appendAiUsageInfo(data) {
    if (!data.model && !data.durationMs) return;
    const container = document.getElementById('aiMessages');
    const msgs = container.querySelectorAll('.ai-message.assistant');
    const lastMsg = msgs[msgs.length - 1];
    if (!lastMsg) return;
    const info = document.createElement('div');
    info.className = 'ai-usage-info';
    let text = '';
    if (data.model) text += data.model.replace('anthropic/', '').replace('claude-', 'Claude ').replace(/-/g, ' ');
    if (data.durationMs) text += ` · ${(data.durationMs / 1000).toFixed(1)}s`;
    if (data.usage) text += ` · ~${((data.usage.input || 0) + (data.usage.output || 0)).toLocaleString()} tokens`;
    info.textContent = text;
    lastMsg.after(info);
}

// Send message
async function sendAiChatMessage() {
    const input = document.getElementById('aiInput');
    const message = input.value.trim();
    if (!message || aiIsStreaming) return;

    input.value = '';
    aiInputAutoResize(input);

    // Check provider — retry if not loaded
    if (!(await ensureAiProvider())) {
        showToast('No AI provider configured. Open settings to add one.', 'error');
        return;
    }

    appendAiMessage(message, 'user');
    // Show typing indicator immediately (before API call)
    const thinkingMsg = appendAiMessage('', 'assistant', true);
    aiIsStreaming = true;
    updateAiSendButton();

    // Hide quick actions and suggestions while streaming
    const qa = document.getElementById('aiQuickActions');
    if (qa) qa.style.display = 'none';
    const sugBar = document.getElementById('aiSuggestions');
    if (sugBar) sugBar.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/ai/chat`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                context: getAiContextString(),
                conversationId: aiCurrentConversationId,
                provider: aiSelectedProvider,
                model: aiSelectedModel
            })
        });

        if (!response.ok) {
            let errMsg = 'Request failed';
            try {
                const errData = await response.json();
                errMsg = errData.error || errMsg;
            } catch {}
            if (thinkingMsg) thinkingMsg.remove();
            appendAiError(errMsg);
            aiIsStreaming = false;
            updateAiSendButton();
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiMessage = '';
        let streamingStarted = false;
        let sseBuffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;

                try {
                    const data = JSON.parse(trimmed.slice(6));

                    if (data.type === 'meta' && data.conversationId) {
                        aiCurrentConversationId = data.conversationId;
                    }

                    if (data.type === 'chunk' && data.content) {
                        streamingStarted = true;
                        aiMessage += data.content;
                        // Reuse the thinking bubble (already showing dots)
                        updateLastAiMessage(aiMessage);
                    }

                    if (data.type === 'error') {
                        if (!streamingStarted) {
                            // Replace thinking dots with error
                            if (thinkingMsg) thinkingMsg.remove();
                            appendAiError(data.error || 'An error occurred');
                        } else {
                            aiMessage += '\n\n⚠️ ' + (data.error || 'Stream error');
                            updateLastAiMessage(aiMessage);
                        }
                    }

                    if (data.type === 'done') {
                        appendAiUsageInfo(data);
                    }
                } catch (e) {
                    // Skip malformed SSE lines
                }
            }
        }

        // If nothing was streamed at all
        if (!streamingStarted && !aiMessage) {
            if (thinkingMsg) thinkingMsg.remove();
            appendAiError('No response received from AI provider.');
        }

        // Parse and show dynamic suggestions
        parseSuggestions(aiMessage);
        appendMessageActions(aiMessage);
        // Refresh conversation sidebar (new or continued conversation)
        loadAiConversations();

    } catch (e) {
        appendAiError('Failed to connect: ' + e.message);
    }

    aiIsStreaming = false;
    updateAiSendButton();
}

function parseSuggestions(text) {
    const sugBar = document.getElementById('aiSuggestions');
    const defaultBar = document.getElementById('aiQuickActions');
    if (!sugBar) return;

    // Parse <<<Q1|||Q2|||Q3>>> from end of response
    const match = text.match(/<<<(.+?)>>>/);
    if (match) {
        const questions = match[1].split('|||').map(q => q.trim()).filter(q => q);
        if (questions.length > 0) {
            sugBar.innerHTML = questions.map(q =>
                `<button class="ai-quick-btn" onclick="askSuggestion(this)">${q}</button>`
            ).join('');
            sugBar.style.display = 'flex';
            if (defaultBar) defaultBar.style.display = 'none';

            // Also strip the suggestion line from the displayed message
            const lastBubble = document.querySelector('#aiMessages .ai-message.assistant:last-child .ai-message-bubble');
            if (lastBubble) {
                lastBubble.innerHTML = lastBubble.innerHTML.replace(/&lt;&lt;&lt;.+?&gt;&gt;&gt;/g, '').replace(/<<<.+?>>>/g, '');
            }
            return;
        }
    }
    // No suggestions parsed — keep showing defaults if no conversation yet
}

function askSuggestion(btn) {
    const question = btn.textContent.trim();
    const input = document.getElementById('aiInput');
    if (input) {
        input.value = question;
        sendAiChatMessage();
    }
}

function updateAiSendButton() {
    const btn = document.getElementById('aiSendBtn');
    if (btn) btn.disabled = aiIsStreaming;
}

// Ensure AI provider is loaded — retry if initial fetch failed
async function ensureAiProvider() {
    if (aiSelectedProvider) return true;
    try {
        aiProviders = await api('/ai/providers');
        updateAiProviderBadge();
    } catch (e) { /* ignore */ }
    return !!aiSelectedProvider;
}

// Quick actions
async function aiQuickAction(type) {
    if (aiIsStreaming) return;

    // Check provider — retry if not loaded
    if (!(await ensureAiProvider())) {
        showToast('No AI provider configured. Open settings to add one.', 'error');
        return;
    }

    const welcome = document.getElementById('aiWelcome');
    if (welcome) welcome.style.display = 'none';

    let endpoint = '';
    let userLabel = '';

    switch (type) {
        case 'portfolio':
            endpoint = '/ai/analyze/portfolio';
            userLabel = '📊 Review my portfolio';
            break;
        case 'watchlist':
            endpoint = '/ai/analyze/watchlist';
            userLabel = '🎯 Analyze my watchlist signals';
            break;
        case 'rebalance':
            endpoint = '/ai/analyze/rebalance';
            userLabel = '⚖️ Rebalance my portfolio';
            break;
        case 'news':
            endpoint = '/ai/analyze/news';
            userLabel = '📰 News digest for my holdings';
            break;
        case 'strategy':
            endpoint = '/ai/analyze/strategy';
            userLabel = '🎯 Suggest trading strategies';
            // Auto-enable Portfolio context chip
            aiActiveContexts = [];
            document.querySelectorAll('.ai-context-chip').forEach(c => c.classList.remove('active'));
            ['portfolio'].forEach(ctx => {
                const chip = document.querySelector(`.ai-context-chip[data-context="${ctx}"]`);
                if (chip) { chip.classList.add('active'); aiActiveContexts.push(ctx); }
            });
            break;
        case 'risk':
            endpoint = '/ai/analyze/risk';
            userLabel = '🛡️ Analyze portfolio risk';
            // Auto-enable Portfolio context chip
            aiActiveContexts = [];
            document.querySelectorAll('.ai-context-chip').forEach(c => c.classList.remove('active'));
            ['portfolio'].forEach(ctx => {
                const chip = document.querySelector(`.ai-context-chip[data-context="${ctx}"]`);
                if (chip) { chip.classList.add('active'); aiActiveContexts.push(ctx); }
            });
            break;
        case 'position':
            openTickerSearchModal();
            return;
        case 'onboarding':
            // Send onboarding message via regular chat with portfolio+market context
            {
                const onboardingMessage = `I'm new here and need help building my first portfolio. Walk me through it step by step — ask me about my goals, risk tolerance, timeline, and budget. Then suggest a complete portfolio I can add with one click.`;
                // Activate portfolio + market context chips
                aiActiveContexts = [];
                document.querySelectorAll('.ai-context-chip').forEach(c => c.classList.remove('active'));
                ['portfolio', 'market'].forEach(ctx => {
                    const chip = document.querySelector(`.ai-context-chip[data-context="${ctx}"]`);
                    if (chip) { chip.classList.add('active'); aiActiveContexts.push(ctx); }
                });
                const qa = document.getElementById('aiQuickActions');
                if (qa) qa.style.display = 'none';
                const input = document.getElementById('aiInput');
                if (input) {
                    input.value = onboardingMessage;
                    sendAiChatMessage();
                }
            }
            return;
        default:
            return;
    }

    appendAiMessage(userLabel, 'user');
    // Show thinking dots immediately
    const thinkingMsg = appendAiMessage('', 'assistant', true);
    aiIsStreaming = true;
    updateAiSendButton();

    // Hide quick actions
    const qa = document.getElementById('aiQuickActions');
    if (qa) qa.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                provider: aiSelectedProvider,
                model: aiSelectedModel
            })
        });

        if (!response.ok) {
            let errMsg = 'Request failed';
            try { const ed = await response.json(); errMsg = ed.error || errMsg; } catch {}
            if (thinkingMsg) thinkingMsg.remove();
            appendAiError(errMsg);
            aiIsStreaming = false;
            updateAiSendButton();
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiMessage = '';
        let streamingStarted = false;
        let sseBuffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;

                try {
                    const data = JSON.parse(trimmed.slice(6));

                    if (data.type === 'meta' && data.conversationId) {
                        aiCurrentConversationId = data.conversationId;
                    }

                    if (data.type === 'chunk' && data.content) {
                        streamingStarted = true;
                        aiMessage += data.content;
                        updateLastAiMessage(aiMessage);
                    }

                    if (data.type === 'error') {
                        if (!streamingStarted) {
                            if (thinkingMsg) thinkingMsg.remove();
                            appendAiError(data.error || 'An error occurred');
                        } else {
                            aiMessage += '\n\n⚠️ ' + (data.error || 'Stream error');
                            updateLastAiMessage(aiMessage);
                        }
                    }

                    if (data.type === 'done') {
                        appendAiUsageInfo(data);
                    }
                } catch (e) {}
            }
        }

        if (!streamingStarted && !aiMessage) {
            if (thinkingMsg) thinkingMsg.remove();
            appendAiError('No response received from AI provider.');
        }

        parseSuggestions(aiMessage);
        appendMessageActions(aiMessage);
        // Refresh conversation sidebar so analysis appears
        loadAiConversations();

    } catch (e) {
        appendAiError('Failed to connect: ' + e.message);
    }

    aiIsStreaming = false;
    updateAiSendButton();
}

// Input handling
let aiTickerTimeout = null;
let aiTickerSelected = -1;

function aiInputKeydown(e) {
    const dd = document.getElementById('aiTickerDropdown');
    const items = dd ? dd.querySelectorAll('.autocomplete-item') : [];

    // Handle autocomplete navigation
    if (items.length && !dd.classList.contains('hidden')) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            aiTickerSelected = Math.min(aiTickerSelected + 1, items.length - 1);
            items.forEach((it, i) => it.classList.toggle('selected', i === aiTickerSelected));
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            aiTickerSelected = Math.max(aiTickerSelected - 1, 0);
            items.forEach((it, i) => it.classList.toggle('selected', i === aiTickerSelected));
            return;
        }
        if ((e.key === 'Tab' || e.key === 'Enter') && aiTickerSelected >= 0) {
            e.preventDefault();
            const sym = items[aiTickerSelected].dataset.symbol;
            insertAiTicker(sym);
            return;
        }
        if (e.key === 'Escape') {
            dd.classList.add('hidden');
            return;
        }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAiChatMessage();
    }
}

function aiTickerAutocomplete(el) {
    const dd = document.getElementById('aiTickerDropdown');
    if (!dd) return;

    const val = el.value;
    const cursor = el.selectionStart;
    // Find the $WORD at cursor position
    const before = val.slice(0, cursor);
    const match = before.match(/\$([A-Za-z]{1,10})$/);

    if (!match || match[1].length < 1) {
        dd.classList.add('hidden');
        aiTickerSelected = -1;
        return;
    }

    const query = match[1];
    if (aiTickerTimeout) clearTimeout(aiTickerTimeout);

    aiTickerTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`/api/tickers/search?q=${encodeURIComponent(query)}`);
            if (!res.ok) return;
            const tickers = await res.json();
            const results = tickers.slice(0, 6);

            if (!results.length) {
                dd.classList.add('hidden');
                return;
            }

            aiTickerSelected = -1;
            dd.innerHTML = results.map((t, i) => `
                <div class="autocomplete-item" data-symbol="${t.symbol}" 
                     onmousedown="event.preventDefault(); insertAiTicker('${t.symbol}')">
                    <span class="autocomplete-symbol">${t.symbol}</span>
                    <span class="autocomplete-name">${t.name}</span>
                </div>
            `).join('');
            dd.classList.remove('hidden');
        } catch (e) { dd.classList.add('hidden'); }
    }, 200);
}

function insertAiTicker(symbol) {
    const input = document.getElementById('aiInput');
    const dd = document.getElementById('aiTickerDropdown');
    const cursor = input.selectionStart;
    const before = input.value.slice(0, cursor);
    const after = input.value.slice(cursor);
    // Replace $PARTIAL with $FULL
    const newBefore = before.replace(/\$[A-Za-z]*$/, '$' + symbol + ' ');
    input.value = newBefore + after;
    input.selectionStart = input.selectionEnd = newBefore.length;
    input.focus();
    if (dd) dd.classList.add('hidden');
    aiTickerSelected = -1;
}

// ─── Ticker Search Modal ───────────────────────────────
let tickerSearchTimeout = null;
let tickerSearchSelected = -1;

function openTickerSearchModal() {
    const input = document.getElementById('tickerSearchInput');
    const dd = document.getElementById('tickerSearchDropdown');
    input.value = '';
    dd.innerHTML = '';
    dd.classList.add('hidden');
    tickerSearchSelected = -1;
    showModal('tickerSearchModal');
    setTimeout(() => input.focus(), 100);
}

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('tickerSearchInput');
    if (!input) return;

    input.addEventListener('input', () => {
        const query = input.value.trim().replace(/^\$/, '');
        const dd = document.getElementById('tickerSearchDropdown');
        if (query.length < 1) { dd.classList.add('hidden'); tickerSearchSelected = -1; return; }

        if (tickerSearchTimeout) clearTimeout(tickerSearchTimeout);
        tickerSearchTimeout = setTimeout(async () => {
            try {
                const res = await fetch(`/api/tickers/search?q=${encodeURIComponent(query)}`);
                if (!res.ok) return;
                const tickers = await res.json();
                const results = tickers.slice(0, 8);
                if (!results.length) { dd.classList.add('hidden'); return; }

                tickerSearchSelected = 0;
                dd.innerHTML = results.map((t, i) => `
                    <div class="autocomplete-item${i === 0 ? ' selected' : ''}" data-symbol="${t.symbol}"
                         onmousedown="event.preventDefault(); selectTickerSearch('${t.symbol}')">
                        <span class="autocomplete-symbol">${t.symbol}</span>
                        <span class="autocomplete-name">${t.name || ''}</span>
                    </div>
                `).join('');
                dd.classList.remove('hidden');
            } catch { dd.classList.add('hidden'); }
        }, 150);
    });

    input.addEventListener('keydown', (e) => {
        const dd = document.getElementById('tickerSearchDropdown');
        const items = dd.querySelectorAll('.autocomplete-item');

        if (items.length && !dd.classList.contains('hidden')) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                tickerSearchSelected = Math.min(tickerSearchSelected + 1, items.length - 1);
                items.forEach((it, i) => it.classList.toggle('selected', i === tickerSearchSelected));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                tickerSearchSelected = Math.max(tickerSearchSelected - 1, 0);
                items.forEach((it, i) => it.classList.toggle('selected', i === tickerSearchSelected));
                return;
            }
            if (e.key === 'Tab' && tickerSearchSelected >= 0) {
                e.preventDefault();
                selectTickerSearch(items[tickerSearchSelected].dataset.symbol);
                return;
            }
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (tickerSearchSelected >= 0 && items.length && !dd.classList.contains('hidden')) {
                selectTickerSearch(items[tickerSearchSelected].dataset.symbol);
            } else {
                confirmTickerSearch();
            }
        }
        if (e.key === 'Escape') {
            closeModal('tickerSearchModal');
        }
    });
});

function selectTickerSearch(symbol) {
    const input = document.getElementById('tickerSearchInput');
    const dd = document.getElementById('tickerSearchDropdown');
    input.value = symbol;
    dd.classList.add('hidden');
    tickerSearchSelected = -1;
    input.focus();
}

function confirmTickerSearch() {
    const input = document.getElementById('tickerSearchInput');
    const sym = input.value.trim().replace(/^\$/, '').toUpperCase();
    if (!sym) return;
    closeModal('tickerSearchModal');
    runQuickAnalysis('position-confirmed', sym);
}

async function runQuickAnalysis(type, symbol) {
    const welcome = document.getElementById('aiWelcome');
    if (welcome) welcome.style.display = 'none';

    const userLabel = `🔍 Deep-dive analysis of ${symbol}`;
    const endpoint = `/ai/analyze/position/${symbol}`;

    appendAiMessage(userLabel, 'user');
    // Show thinking dots immediately
    const thinkingMsg = appendAiMessage('', 'assistant', true);
    aiIsStreaming = true;
    updateAiSendButton();

    const qa = document.getElementById('aiQuickActions');
    if (qa) qa.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                provider: aiSelectedProvider,
                model: aiSelectedModel
            })
        });

        if (!response.ok) {
            let errMsg = 'Request failed';
            try { const ed = await response.json(); errMsg = ed.error || errMsg; } catch {}
            if (thinkingMsg) thinkingMsg.remove();
            appendAiError(errMsg);
            aiIsStreaming = false;
            updateAiSendButton();
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiMessage = '';
        let streamingStarted = false;
        let sseBuffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                try {
                    const data = JSON.parse(trimmed.slice(6));
                    if (data.type === 'meta' && data.conversationId) {
                        aiCurrentConversationId = data.conversationId;
                        loadAiConversations();
                    }
                    if (data.type === 'chunk' && data.content) {
                        streamingStarted = true;
                        aiMessage += data.content;
                        updateLastAiMessage(aiMessage);
                    }
                    if (data.type === 'error') {
                        if (!streamingStarted) {
                            if (thinkingMsg) thinkingMsg.remove();
                            appendAiError(data.error || 'An error occurred');
                        } else {
                            aiMessage += '\n\n⚠️ ' + (data.error || 'Stream error');
                            updateLastAiMessage(aiMessage);
                        }
                    }
                    if (data.type === 'done') {
                        appendAiUsageInfo(data);
                    }
                } catch {}
            }
        }

        if (!streamingStarted && !aiMessage) {
            appendAiError('No response received from AI provider.');
        }

        parseSuggestions(aiMessage);
        appendMessageActions(aiMessage);

    } catch (err) {
        appendAiError('Failed to connect: ' + err.message);
    }

    aiIsStreaming = false;
    updateAiSendButton();
}

function aiInputAutoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// New chat
async function newAiChat() {
    aiCurrentConversationId = null;
    const container = document.getElementById('aiMessages');
    container.innerHTML = '';

    // Rebuild default welcome
    container.innerHTML = `<div class="ai-welcome" id="aiWelcome">
        <div class="ai-welcome-icon">🧠</div>
        <h3>Oracle AI Assistant</h3>
        <p>Ask me about your portfolio, market trends, or investment strategies. Select context chips above to include your data.</p>
    </div>`;

    const qa = document.getElementById('aiQuickActions');
    if (qa) {
        qa.style.display = '';
        // Remove previous onboarding buttons (will be re-added by updateWelcomeForOnboarding)
        qa.querySelectorAll('.ai-onboard-btn').forEach(b => b.remove());
        // Also remove non-pulsing build buttons
        qa.querySelectorAll('.ai-quick-btn').forEach(b => {
            if (b.textContent.includes('Build My Portfolio')) b.remove();
        });
    }
    const sug = document.getElementById('aiSuggestions');
    if (sug) { sug.style.display = 'none'; sug.innerHTML = ''; }

    // Reset context to general
    aiActiveContexts = ['general'];
    document.querySelectorAll('.ai-context-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.context === 'general');
    });

    // Re-check onboarding state — always add Build Portfolio option
    const needsOnboarding = await checkOnboardingNeeded();
    updateWelcomeForOnboarding(needsOnboarding);
}

// Settings panel
function openAiSettings() {
    closeAiConversations();
    document.getElementById('aiPanelOverlay').classList.add('show');
    document.getElementById('aiSettingsPanel').classList.add('show');
    renderAiProviderSettings();
}

function closeAiSettings() {
    document.getElementById('aiPanelOverlay').classList.remove('show');
    document.getElementById('aiSettingsPanel').classList.remove('show');
}

function closeAiPanels() {
    closeAiSettings();
    closeAiConversations();
}

async function renderAiProviderSettings() {
    const container = document.getElementById('aiProvidersList');
    try {
        aiProviders = await api('/ai/providers');
    } catch (e) {
        // Retry once after 1 second
        try {
            await new Promise(r => setTimeout(r, 1000));
            aiProviders = await api('/ai/providers');
        } catch (e2) {
            container.innerHTML = '<div style="color:var(--accent-red);">Failed to load providers. <a href="#" onclick="renderAiProviderSettings();return false;" style="color:var(--accent-blue);">Retry</a></div>';
            return;
        }
    }

    let html = '';
    for (const p of aiProviders) {
        const statusIcon = p.configured ? '✅' : (p.requiresKey ? '❌' : '⚡');
        const statusTitle = p.configured ? 'Configured' : (p.requiresKey ? 'Not configured' : 'No key needed');

        html += `<div class="ai-provider-card" id="ai-provider-${p.id}">
            <div class="ai-provider-card-header">
                <div class="ai-provider-name">
                    <span class="ai-provider-status" title="${statusTitle}">${statusIcon}</span>
                    ${p.name}
                </div>
            </div>
            <div class="ai-provider-fields">`;

        if (p.requiresKey) {
            html += `<input type="password" class="ai-provider-input" id="ai-key-${p.id}"
                placeholder="API Key" value="${p.configured ? '••••••••' : ''}">`;
        }

        if (p.id === 'ollama' || p.id === 'custom') {
            const onchangeAttr = p.id === 'ollama' ? `onchange="fetchOllamaModels('${p.id}')" onblur="fetchOllamaModels('${p.id}')"` : '';
            html += `<input type="text" class="ai-provider-input" id="ai-url-${p.id}"
                placeholder="Base URL (e.g., http://localhost:11434)" value="${p.baseUrl || ''}" ${onchangeAttr}>`;
        }

        if (p.id === 'custom') {
            html += `<input type="text" class="ai-provider-input" id="ai-model-custom"
                placeholder="Model name" value="${p.modelPreference || ''}">`;
        }

        if (p.models && p.models.length > 0) {
            html += `<select class="ai-provider-input" id="ai-model-${p.id}">`;
            for (const m of p.models) {
                const sel = m.id === p.modelPreference ? 'selected' : '';
                html += `<option value="${m.id}" ${sel}>${m.name}</option>`;
            }
            html += `</select>`;
        }

        if (p.id === 'ollama') {
            html += `<input type="number" class="ai-provider-input" id="ai-ctx-${p.id}"
                placeholder="Context window (e.g. 8192)" value="${p.contextLength || ''}" min="256" step="256">`;
        }

        html += `</div>
            <div class="ai-provider-actions">
                <button class="ai-btn-sm primary" onclick="saveAiProvider('${p.id}')">💾 Save</button>
                <button class="ai-btn-sm" onclick="testAiProvider('${p.id}')">🧪 Test</button>
                ${p.configured ? `<button class="ai-btn-sm danger" onclick="removeAiProvider('${p.id}')">🗑️ Remove</button>` : ''}
            </div>
        </div>`;
    }

    container.innerHTML = html;
    
    // Auto-fetch Ollama models if URL is already configured
    const ollamaProvider = aiProviders.find(p => p.id === 'ollama');
    if (ollamaProvider && ollamaProvider.baseUrl) {
        // Small delay to ensure DOM is ready
        setTimeout(() => fetchOllamaModels('ollama'), 100);
    }
}

async function saveAiProvider(providerId) {
    const keyInput = document.getElementById(`ai-key-${providerId}`);
    const urlInput = document.getElementById(`ai-url-${providerId}`);
    const modelSelect = document.getElementById(`ai-model-${providerId}`);
    const customModelInput = document.getElementById('ai-model-custom');

    const body = {};
    if (keyInput && keyInput.value && !keyInput.value.startsWith('••')) {
        body.apiKey = keyInput.value;
    }
    if (urlInput) body.baseUrl = urlInput.value;
    if (modelSelect) body.model = modelSelect.value;
    if (providerId === 'custom' && customModelInput) body.model = customModelInput.value;
    const ctxInput = document.getElementById(`ai-ctx-${providerId}`);
    if (ctxInput && ctxInput.value) body.contextLength = parseInt(ctxInput.value);

    try {
        await api(`/ai/providers/${providerId}/key`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        showToast(`${providerId} provider saved!`, 'success');
        aiProviders = await api('/ai/providers');
        await renderAiProviderSettings();
        updateAiProviderBadge();
    } catch (e) {
        showToast('Failed to save: ' + e.message, 'error');
    }
}

async function testAiProvider(providerId) {
    try {
        showToast(`Testing ${providerId}...`, 'info');
        const result = await api(`/ai/providers/${providerId}/test`);
        if (result.success) {
            showToast(`✅ ${providerId} connection successful!`, 'success');
        } else {
            showToast(`❌ ${providerId} test failed: ${result.error || 'Unknown error'}`, 'error');
        }
    } catch (e) {
        showToast(`❌ Test failed: ${e.message}`, 'error');
    }
}

async function removeAiProvider(providerId) {
    if (!confirm(`Remove API key for ${providerId}?`)) return;
    try {
        await api(`/ai/providers/${providerId}/key`, { method: 'DELETE' });
        showToast(`${providerId} key removed`, 'info');
        aiProviders = await api('/ai/providers');
        await renderAiProviderSettings();
        updateAiProviderBadge();
    } catch (e) {
        showToast('Failed to remove: ' + e.message, 'error');
    }
}

// Ollama model auto-detection
let ollamaModelFetchTimeout = null;

async function fetchOllamaModels(providerId) {
    if (providerId !== 'ollama') return;
    
    const urlInput = document.getElementById(`ai-url-${providerId}`);
    const modelSelect = document.getElementById(`ai-model-${providerId}`);
    
    if (!urlInput || !modelSelect) return;
    
    const baseUrl = urlInput.value.trim();
    if (!baseUrl) {
        // Reset to default hardcoded models if URL is empty
        resetOllamaModelsToDefault(modelSelect);
        return;
    }
    
    // Debounce the API call to avoid spamming while user types
    clearTimeout(ollamaModelFetchTimeout);
    ollamaModelFetchTimeout = setTimeout(async () => {
        await performOllamaModelFetch(baseUrl, modelSelect);
    }, 1000);
}

async function performOllamaModelFetch(baseUrl, modelSelect) {
    // Show loading state
    const originalHTML = modelSelect.innerHTML;
    modelSelect.innerHTML = '<option value="">🔄 Fetching models...</option>';
    modelSelect.disabled = true;
    
    try {
        const response = await api(`/ai/models/ollama?baseUrl=${encodeURIComponent(baseUrl)}`);
        
        if (response.models && response.models.length > 0) {
            // Update dropdown with fetched models
            updateOllamaModelDropdown(modelSelect, response.models);
        } else {
            throw new Error('No models found');
        }
    } catch (error) {
        console.error('Failed to fetch Ollama models:', error);
        
        // Fallback to hardcoded defaults
        resetOllamaModelsToDefault(modelSelect);
        
        // Only show error if it's not a network timeout/server offline
        if (!error.message.includes('fetch')) {
            showToast('Failed to fetch models from server, using defaults', 'warning');
        }
    }
    
    modelSelect.disabled = false;
}

function updateOllamaModelDropdown(modelSelect, models) {
    // Clear existing options
    modelSelect.innerHTML = '';
    
    // Add fetched models
    for (const model of models) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        modelSelect.appendChild(option);
    }
    
    // Select saved modelPreference if available, otherwise first model
    const ollamaProvider = aiProviders && aiProviders.find(p => p.id === 'ollama');
    const preferred = ollamaProvider && ollamaProvider.modelPreference;
    if (preferred && models.some(m => m.id === preferred)) {
        modelSelect.value = preferred;
    } else if (models.length > 0 && !modelSelect.value) {
        modelSelect.value = models[0].id;
    }
}

function resetOllamaModelsToDefault(modelSelect) {
    // Fallback to hardcoded default models from PROVIDER_DEFS
    const defaultModels = [
        { id: 'llama3', name: 'LLaMA 3' },
        { id: 'mistral', name: 'Mistral' }
    ];
    
    updateOllamaModelDropdown(modelSelect, defaultModels);
}

// Conversations panel
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

// ─── Export AI Response as PDF ─────────────────────────
function exportAiResponseAsPdf(markdown) {
    const html = renderAiMarkdown(markdown);
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Pop-up blocked — please allow pop-ups for this site', 'error');
        return;
    }

    printWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Portfolio Pro — AI Analysis</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; }
  .pdf-header { border-bottom: 2px solid #2962ff; padding-bottom: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: baseline; }
  .pdf-header h1 { font-size: 20px; color: #2962ff; }
  .pdf-header .date { font-size: 12px; color: #666; }
  .pdf-content h1 { font-size: 18px; margin: 16px 0 8px; color: #131722; }
  .pdf-content h2 { font-size: 16px; margin: 14px 0 6px; color: #131722; }
  .pdf-content h3 { font-size: 14px; margin: 12px 0 4px; color: #131722; }
  .pdf-content p, .pdf-content li { font-size: 13px; margin-bottom: 4px; }
  .pdf-content ul, .pdf-content ol { padding-left: 20px; margin-bottom: 8px; }
  .pdf-content table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
  .pdf-content th, .pdf-content td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  .pdf-content th { background: #f0f0f0; font-weight: 600; }
  .pdf-content pre { background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; padding: 10px; overflow-x: auto; font-size: 12px; margin: 8px 0; }
  .pdf-content code { font-family: 'SF Mono', Consolas, monospace; font-size: 12px; background: #f0f0f0; padding: 1px 4px; border-radius: 3px; }
  .pdf-content pre code { background: none; padding: 0; }
  .pdf-content strong { font-weight: 600; }
  .pdf-footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #999; text-align: center; }
  @media print {
    body { padding: 20px; }
    @page { margin: 1.5cm; }
  }
</style></head><body>
  <div class="pdf-header">
    <h1>🧠 Portfolio Pro — AI Analysis</h1>
    <span class="date">${dateStr}</span>
  </div>
  <div class="pdf-content">${html}</div>
  <div class="pdf-footer">Generated by Portfolio Pro Oracle · ${dateStr}</div>
  <script>window.onload=function(){window.print();}<\/script>
</body></html>`);
    printWindow.document.close();
}

function exportFullConversationAsPdf() {
    const container = document.getElementById('aiMessages');
    if (!container) return;
    const messages = container.querySelectorAll('.ai-message');
    if (!messages.length) { showToast('No conversation to export', 'info'); return; }

    let contentHtml = '';
    messages.forEach(msg => {
        const role = msg.dataset.role;
        const bubble = msg.querySelector('.ai-message-bubble');
        if (!bubble) return;
        // Clone and strip action buttons
        const clone = bubble.cloneNode(true);
        clone.querySelectorAll('.ai-message-actions, .ai-action-container').forEach(el => el.remove());
        const label = role === 'user' ? '👤 You' : '🧠 Oracle';
        contentHtml += `<div style="margin-bottom:16px;"><strong style="color:${role === 'user' ? '#2962ff' : '#26a69a'}">${label}</strong><div style="margin-top:4px;">${clone.innerHTML}</div></div>`;
    });

    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const printWindow = window.open('', '_blank');
    if (!printWindow) { showToast('Pop-up blocked — please allow pop-ups', 'error'); return; }

    printWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Portfolio Pro — Conversation Export</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; }
  .pdf-header { border-bottom: 2px solid #2962ff; padding-bottom: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: baseline; }
  .pdf-header h1 { font-size: 20px; color: #2962ff; }
  .pdf-header .date { font-size: 12px; color: #666; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f0f0f0; font-weight: 600; }
  pre { background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; padding: 10px; overflow-x: auto; font-size: 12px; margin: 8px 0; }
  code { font-family: 'SF Mono', Consolas, monospace; font-size: 12px; }
  .pdf-footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #999; text-align: center; }
  @media print { body { padding: 20px; } @page { margin: 1.5cm; } }
</style></head><body>
  <div class="pdf-header">
    <h1>🧠 Portfolio Pro — Conversation</h1>
    <span class="date">${dateStr}</span>
  </div>
  ${contentHtml}
  <div class="pdf-footer">Generated by Portfolio Pro Oracle · ${dateStr}</div>
  <script>window.onload=function(){window.print();}<\/script>
</body></html>`);
    printWindow.document.close();
}

async function deleteAiConversation(convId) {
    if (!confirm('Delete this conversation?')) return;
    try {
        await api(`/ai/conversations/${convId}`, { method: 'DELETE' });
        if (aiCurrentConversationId === convId) {
            newAiChat();
        }
        loadAiConversations();
    } catch (e) {
        showToast('Failed to delete: ' + e.message, 'error');
    }
}

