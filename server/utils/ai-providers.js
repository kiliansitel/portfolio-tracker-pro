/**
 * AI Provider Abstraction Layer
 * Supports: OpenAI, Anthropic, Google, Ollama, OpenRouter, Custom (OpenAI-compatible)
 * Uses built-in fetch (Node 22) — no extra dependencies
 */

const crypto = require('crypto');

// ─── Encryption helpers ────────────────────────────────────────────
const ALGORITHM = 'aes-256-cbc';

function encryptKey(plaintext, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptKey(encrypted, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const [ivHex, data] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ─── Provider definitions ──────────────────────────────────────────
const PROVIDER_DEFS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o1', name: 'o1' }
    ],
    requiresKey: true,
    description: 'Requires an API key from platform.openai.com'
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' }
    ],
    requiresKey: true,
    description: 'Requires an API key from console.anthropic.com (not setup-tokens)'
  },
  google: {
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }
    ],
    requiresKey: true
  },
  ollama: {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434',
    models: [
      { id: 'llama3', name: 'LLaMA 3' },
      { id: 'mistral', name: 'Mistral' }
    ],
    requiresKey: false
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'openai/gpt-4o', name: 'GPT-4o (via OpenRouter)' },
      { id: 'anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (via OpenRouter)' },
      { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (via OpenRouter)' }
    ],
    requiresKey: true
  },
  openclaw: {
    name: 'OpenClaw',
    baseUrl: `http://127.0.0.1:${process.env.OPENCLAW_GATEWAY_PORT || 18789}/v1`,
    models: [
      { id: 'openclaw', name: 'Default (Claude)' }
    ],
    requiresKey: true,
    description: 'Route through your local OpenClaw gateway — uses your existing AI subscription'
  },
  custom: {
    name: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    models: [],
    requiresKey: true
  }
};

// ─── Provider class ────────────────────────────────────────────────

class AIProvider {
  constructor(name, config = {}) {
    this.providerName = name;
    this.apiKey = config.apiKey || null;
    this.baseUrl = config.baseUrl || PROVIDER_DEFS[name]?.baseUrl || '';
    this.model = config.model || null;
  }

  getModels() {
    return PROVIDER_DEFS[this.providerName]?.models || [];
  }

  getDefaultModel() {
    const models = this.getModels();
    return this.model || (models[0]?.id) || null;
  }

  /**
   * Stream chat completion. Returns an async generator yielding text chunks.
   */
  async *chat(messages, options = {}) {
    const model = options.model || this.getDefaultModel();

    switch (this.providerName) {
      case 'openai':
      case 'openrouter':
      case 'openclaw':
      case 'custom':
        yield* this._chatOpenAICompatible(messages, model, options);
        break;
      case 'anthropic':
        yield* this._chatAnthropic(messages, model, options);
        break;
      case 'google':
        yield* this._chatGoogle(messages, model, options);
        break;
      case 'ollama':
        yield* this._chatOllama(messages, model, options);
        break;
      default:
        throw new Error(`Unsupported provider: ${this.providerName}`);
    }
  }

  /**
   * Test if the API key / connection works.
   */
  async testConnection() {
    try {
      switch (this.providerName) {
        case 'openai':
          return await this._testOpenAI();
        case 'anthropic':
          return await this._testAnthropic();
        case 'google':
          return await this._testGoogle();
        case 'ollama':
          return await this._testOllama();
        case 'openrouter':
          return await this._testOpenRouter();
        case 'openclaw':
          return await this._testOpenAI();
        case 'custom':
          return await this._testCustom();
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  // ─── OpenAI-compatible streaming (OpenAI, OpenRouter, Custom) ────

  async *_chatOpenAICompatible(messages, model, options) {
    const url = `${this.baseUrl}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // OpenRouter extra header
    if (this.providerName === 'openrouter') {
      headers['HTTP-Referer'] = 'https://portfolio-tracker-pro.app';
      headers['X-Title'] = 'Portfolio Tracker Pro';
    }

    const body = {
      model,
      messages,
      stream: true,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`${this.providerName} API error ${resp.status}: ${errText}`);
    }

    yield* this._parseSSEStream(resp.body);
  }

  async *_parseSSEStream(body) {
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // skip malformed JSON
        }
      }
    }
  }

  // ─── Anthropic streaming ─────────────────────────────────────────

  async *_chatAnthropic(messages, model, options) {
    const url = `${this.baseUrl}/messages`;

    // Anthropic uses a separate system param, not a system message
    let system = undefined;
    const filteredMessages = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        system = (system ? system + '\n\n' : '') + msg.content;
      } else {
        filteredMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const body = {
      model,
      messages: filteredMessages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      stream: true
    };
    if (system) body.system = system;

    const resp = await fetch(url, {
      method: 'POST',
      headers: this._anthropicHeaders(),
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Anthropic API error ${resp.status}: ${errText}`);
    }

    yield* this._parseAnthropicStream(resp.body);
  }

  async *_parseAnthropicStream(body) {
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield parsed.delta.text;
          }
        } catch {
          // skip
        }
      }
    }
  }

  // ─── Google Gemini streaming ─────────────────────────────────────

  async *_chatGoogle(messages, model, options) {
    const url = `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    // Convert messages to Gemini format
    let systemInstruction = undefined;
    const contents = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    const body = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Google API error ${resp.status}: ${errText}`);
    }

    yield* this._parseGoogleStream(resp.body);
  }

  async *_parseGoogleStream(body) {
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);

        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield text;
        } catch {
          // skip
        }
      }
    }
  }

  // ─── Ollama streaming ────────────────────────────────────────────

  async *_chatOllama(messages, model, options) {
    const url = `${this.baseUrl}/api/chat`;

    const body = {
      model,
      messages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens || 4096
      }
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Ollama API error ${resp.status}: ${errText}`);
    }

    yield* this._parseOllamaStream(resp.body);
  }

  async *_parseOllamaStream(body) {
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) yield parsed.message.content;
        } catch {
          // skip
        }
      }
    }
  }

  // ─── Connection tests ────────────────────────────────────────────

  async _testOpenAI() {
    const resp = await fetch(`${this.baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    return resp.ok;
  }

  _anthropicHeaders() {
    const headers = { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' };
    // Setup tokens (sk-ant-oat*) use Bearer auth; API keys use x-api-key
    if (this.apiKey.startsWith('sk-ant-oat')) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    } else {
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }

  async _testAnthropic() {
    const resp = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this._anthropicHeaders(),
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      })
    });
    return resp.status === 200;
  }

  async _testGoogle() {
    const resp = await fetch(
      `${this.baseUrl}/models?key=${this.apiKey}`
    );
    return resp.ok;
  }

  async _testOllama() {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`);
      return resp.ok;
    } catch {
      return false;
    }
  }

  async _testOpenRouter() {
    const resp = await fetch(`${this.baseUrl}/auth/key`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    return resp.ok;
  }

  async _testCustom() {
    if (!this.baseUrl) return false;
    const resp = await fetch(`${this.baseUrl}/models`, {
      headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}
    });
    return resp.ok;
  }
}

// ─── Context builders ──────────────────────────────────────────────

function buildPortfolioContext(userId, dbAll, dbGet) {
  const portfolios = dbAll('SELECT * FROM portfolios WHERE user_id = ? ORDER BY name', [userId]);

  if (!portfolios.length) {
    return 'The user has no portfolios yet.';
  }

  let md = '## User\'s Portfolio Data\n\n';

  for (const pf of portfolios) {
    md += `### ${pf.name} (Cash: $${(pf.cash || 0).toFixed(2)})\n`;
    const positions = dbAll(
      'SELECT * FROM positions WHERE portfolio_id = ? ORDER BY symbol',
      [pf.id]
    );

    if (!positions.length) {
      md += '_No positions._\n\n';
      continue;
    }

    md += '| Symbol | Qty | Entry Price | Current Price | P&L |\n';
    md += '|--------|-----|------------|---------------|-----|\n';

    let totalValue = pf.cash || 0;
    let totalCost = 0;

    for (const pos of positions) {
      const currentPrice = pos.current_price || pos.entry_price;
      const value = pos.quantity * currentPrice;
      const cost = pos.quantity * pos.entry_price;
      const pnl = value - cost;
      const pnlPct = cost > 0 ? ((pnl / cost) * 100).toFixed(1) : '0.0';

      md += `| ${pos.symbol} | ${pos.quantity} | $${pos.entry_price.toFixed(2)} | $${currentPrice.toFixed(2)} | $${pnl.toFixed(2)} (${pnlPct}%) |\n`;

      totalValue += value;
      totalCost += cost;
    }

    const totalPnL = totalValue - totalCost - (pf.cash || 0);
    md += `\n**Total Value:** $${totalValue.toFixed(2)} | **Total P&L:** $${totalPnL.toFixed(2)}\n\n`;
  }

  return md;
}

function buildWatchlistContext(userId, dbAll) {
  const watchlists = dbAll('SELECT * FROM watchlists WHERE user_id = ? ORDER BY name', [userId]);

  if (!watchlists.length) {
    return 'The user has no watchlists yet.';
  }

  let md = '## User\'s Watchlists\n\n';

  for (const wl of watchlists) {
    md += `### ${wl.name}\n`;
    const items = dbAll(
      'SELECT * FROM watchlist_items WHERE watchlist_id = ? ORDER BY symbol',
      [wl.id]
    );

    if (!items.length) {
      md += '_Empty watchlist._\n\n';
      continue;
    }

    for (const item of items) {
      md += `- **${item.symbol}**`;
      if (item.notes) md += ` — ${item.notes}`;
      if (item.alert_above) md += ` (alert above: $${item.alert_above})`;
      if (item.alert_below) md += ` (alert below: $${item.alert_below})`;
      md += '\n';
    }
    md += '\n';
  }

  return md;
}

function buildMarketContext() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const hour = now.getUTCHours();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isUSMarketHours = !isWeekend && hour >= 14 && hour < 21; // 9:30 AM - 4 PM ET ≈ 14:30 - 21:00 UTC

  return `## Market Context\n\n` +
    `- **Date:** ${now.toISOString().slice(0, 10)}\n` +
    `- **Time (UTC):** ${now.toISOString().slice(11, 16)}\n` +
    `- **US Markets:** ${isUSMarketHours ? 'Open' : isWeekend ? 'Closed (Weekend)' : 'Closed'}\n` +
    `\n_Note: Real-time price data may not be available. Base analysis on positions shown._\n`;
}

// ─── Exports ───────────────────────────────────────────────────────

module.exports = {
  AIProvider,
  PROVIDER_DEFS,
  encryptKey,
  decryptKey,
  buildPortfolioContext,
  buildWatchlistContext,
  buildMarketContext
};
