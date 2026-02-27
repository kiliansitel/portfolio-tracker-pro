// ============ ORACLE — VOICE INPUT ============
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
