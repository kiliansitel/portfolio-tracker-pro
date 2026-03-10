// ============ ORACLE — AI SETTINGS PANEL ============
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
            html += `<select class="ai-provider-input" id="ai-model-${p.id}" data-selected-model="${p.modelPreference || ''}">`;
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

    // For Ollama: if models are still loading (disabled), wait for them first
    if (providerId === 'ollama' && modelSelect && modelSelect.disabled) {
        await new Promise(resolve => {
            const check = setInterval(() => {
                if (!modelSelect.disabled) { clearInterval(check); resolve(); }
            }, 100);
            setTimeout(() => { clearInterval(check); resolve(); }, 5000); // max 5s wait
        });
    }

    const body = {};
    if (keyInput && keyInput.value && !keyInput.value.startsWith('••')) {
        body.apiKey = keyInput.value;
    }
    if (urlInput) body.baseUrl = urlInput.value;
    if (modelSelect && modelSelect.value) body.model = modelSelect.value;
    if (providerId === 'custom' && customModelInput) body.model = customModelInput.value;
    const ctxInput = document.getElementById(`ai-ctx-${providerId}`);
    if (ctxInput && ctxInput.value) body.contextLength = parseInt(ctxInput.value);

    try {
        await api(`/ai/providers/${providerId}/key`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        showToast(`${providerId} provider saved!`, 'success');
        // Update selected model in state if this is the active provider
        if (body.model && aiSelectedProvider === providerId) {
            aiSelectedModel = body.model;
            localStorage.setItem('aiModel', aiSelectedModel);
        }
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
    if (!await confirmDialog(`Remove API key for ${providerId}?`, { title: 'Remove API Key', confirmText: 'Remove', danger: true })) return;
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
    
    // Select saved modelPreference if available, otherwise keep current selection, otherwise first model
    const ollamaProvider = aiProviders && aiProviders.find(p => p.id === 'ollama');
    const preferred = ollamaProvider && ollamaProvider.modelPreference;
    const currentValue = modelSelect.dataset.selectedModel || modelSelect.value;
    if (preferred && models.some(m => m.id === preferred)) {
        modelSelect.value = preferred;
    } else if (currentValue && models.some(m => m.id === currentValue)) {
        modelSelect.value = currentValue;
    } else if (models.length > 0) {
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

