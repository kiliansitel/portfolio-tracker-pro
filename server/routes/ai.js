/**
 * AI Intelligence Layer Routes
 * Endpoints for provider management, chat, and analysis
 */

const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db');
const {
  AIProvider,
  PROVIDER_DEFS,
  encryptKey,
  decryptKey,
  buildPortfolioContext,
  buildWatchlistContext,
  buildMarketContext
} = require('../utils/ai-providers');
const { logger } = require('../utils/logger');

const router = express.Router();

// JWT_SECRET used for encrypting API keys
const crypto = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

// ─── Helper: get provider instance for user ────────────────────────

function getProviderForUser(userId, providerName) {
  if (!PROVIDER_DEFS[providerName]) {
    return null;
  }

  const row = dbGet(
    'SELECT * FROM ai_api_keys WHERE user_id = ? AND provider = ?',
    [userId, providerName]
  );

  const config = {
    model: row?.model_preference || null,
    baseUrl: row?.base_url || PROVIDER_DEFS[providerName].baseUrl
  };

  if (row?.encrypted_key) {
    try {
      config.apiKey = decryptKey(row.encrypted_key, JWT_SECRET);
    } catch (err) {
      logger.error(`Failed to decrypt API key for ${providerName}:`, err.message);
      return null;
    }
  }

  // Auto-detect OpenClaw gateway token from environment
  if (providerName === 'openclaw' && !config.apiKey && process.env.OPENCLAW_GATEWAY_TOKEN) {
    config.apiKey = process.env.OPENCLAW_GATEWAY_TOKEN;
    config.baseUrl = `http://127.0.0.1:${process.env.OPENCLAW_GATEWAY_PORT || 18789}/v1`;
  }

  return new AIProvider(providerName, config);
}

// ─── System prompt builder ─────────────────────────────────────────

function buildSystemPrompt(userId, context) {
  let systemContent = `You are an AI financial assistant integrated into Portfolio Tracker Pro. ` +
    `You help users analyze their investments, understand market trends, and make informed decisions. ` +
    `Be concise, data-driven, and specific. Always include relevant numbers when available. ` +
    `Keep responses under 500 words — use bullet points and tables for clarity. ` +
    `Only go longer if the user explicitly asks for a detailed/full analysis. ` +
    `Disclaimer: You provide analysis, not financial advice.\n\n` +
    `IMPORTANT: At the very end of every response, suggest 3 natural follow-up questions the user might ask next. ` +
    `Format them on the last line as: <<<Q1|||Q2|||Q3>>> ` +
    `Keep each question short (under 8 words). Make them contextual to what you just discussed. ` +
    `Example: <<<Should I rebalance?|||What's my risk exposure?|||Compare to S&P 500>>>\n\n`;

  if (!context || context === 'general') {
    return systemContent;
  }

  const contexts = context.split(',').map(c => c.trim());

  if (contexts.includes('portfolio')) {
    systemContent += buildPortfolioContext(userId, dbAll, dbGet) + '\n';
  }
  if (contexts.includes('watchlist')) {
    systemContent += buildWatchlistContext(userId, dbAll) + '\n';
  }
  if (contexts.includes('market')) {
    systemContent += buildMarketContext() + '\n';
  }

  return systemContent;
}

// ═══════════════════════════════════════════════════════════════════
// API Key Management
// ═══════════════════════════════════════════════════════════════════

// GET /providers — list providers with configuration status
router.get('/providers', (req, res) => {
  const userKeys = dbAll(
    'SELECT provider, model_preference, base_url, created_at FROM ai_api_keys WHERE user_id = ?',
    [req.user.id]
  );

  const keyMap = {};
  for (const k of userKeys) {
    keyMap[k.provider] = k;
  }

  // Auto-detect OpenClaw gateway
  const openclawDetected = !!process.env.OPENCLAW_GATEWAY_TOKEN;

  const providers = Object.entries(PROVIDER_DEFS).map(([id, def]) => ({
    id,
    name: def.name,
    description: def.description || null,
    configured: id === 'openclaw' ? (!!keyMap[id] || openclawDetected) : !!keyMap[id],
    autoDetected: id === 'openclaw' && openclawDetected && !keyMap[id],
    requiresKey: def.requiresKey,
    models: def.models,
    modelPreference: keyMap[id]?.model_preference || null,
    baseUrl: keyMap[id]?.base_url || def.baseUrl || null,
    configuredAt: keyMap[id]?.created_at || null
  }));

  res.json(providers);
});

// PUT /providers/:provider/key — save (or update) API key
router.put('/providers/:provider/key', (req, res) => {
  const { provider } = req.params;
  const { apiKey, model, baseUrl } = req.body;

  if (!PROVIDER_DEFS[provider]) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` });
  }

  if (PROVIDER_DEFS[provider].requiresKey && !apiKey) {
    return res.status(400).json({ error: 'API key is required for this provider' });
  }

  const encrypted = apiKey ? encryptKey(apiKey, JWT_SECRET) : '';

  // Upsert
  const existing = dbGet(
    'SELECT id FROM ai_api_keys WHERE user_id = ? AND provider = ?',
    [req.user.id, provider]
  );

  if (existing) {
    dbRun(
      'UPDATE ai_api_keys SET encrypted_key = ?, model_preference = ?, base_url = ? WHERE id = ?',
      [encrypted, model || null, baseUrl || null, existing.id]
    );
  } else {
    dbRun(
      'INSERT INTO ai_api_keys (user_id, provider, encrypted_key, model_preference, base_url) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, provider, encrypted, model || null, baseUrl || null]
    );
  }

  res.json({ message: `API key saved for ${PROVIDER_DEFS[provider].name}` });
});

// DELETE /providers/:provider/key — remove API key
router.delete('/providers/:provider/key', (req, res) => {
  const { provider } = req.params;

  if (!PROVIDER_DEFS[provider]) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` });
  }

  const existing = dbGet(
    'SELECT id FROM ai_api_keys WHERE user_id = ? AND provider = ?',
    [req.user.id, provider]
  );

  if (!existing) {
    return res.status(404).json({ error: 'No API key found for this provider' });
  }

  dbRun('DELETE FROM ai_api_keys WHERE id = ?', [existing.id]);
  res.json({ message: `API key removed for ${PROVIDER_DEFS[provider].name}` });
});

// GET /providers/:provider/test — test API key
router.get('/providers/:provider/test', async (req, res) => {
  const { provider } = req.params;

  if (!PROVIDER_DEFS[provider]) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` });
  }

  const instance = getProviderForUser(req.user.id, provider);
  if (!instance) {
    return res.status(400).json({ error: 'Provider not configured or key decryption failed' });
  }

  // Ollama doesn't need a key
  if (PROVIDER_DEFS[provider].requiresKey && !instance.apiKey) {
    return res.status(400).json({ error: 'No API key configured for this provider' });
  }

  try {
    const ok = await instance.testConnection();
    res.json({ success: ok, provider });
  } catch (err) {
    res.json({ success: false, provider, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Chat
// ═══════════════════════════════════════════════════════════════════

// POST /chat — send message, stream response via SSE
router.post('/chat', async (req, res) => {
  const { message, provider: providerName, model, context, conversationId } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Determine provider: explicit > first configured > error
  let selectedProvider = providerName;
  if (!selectedProvider) {
    const userKeys = dbAll(
      'SELECT provider FROM ai_api_keys WHERE user_id = ?',
      [req.user.id]
    );
    if (userKeys.length) {
      selectedProvider = userKeys[0].provider;
    } else {
      // Try ollama as fallback (no key needed)
      selectedProvider = 'ollama';
    }
  }

  if (!PROVIDER_DEFS[selectedProvider]) {
    return res.status(400).json({ error: `Unknown provider: ${selectedProvider}` });
  }

  const instance = getProviderForUser(req.user.id, selectedProvider);
  if (!instance) {
    return res.status(400).json({ error: 'Provider not configured' });
  }

  if (PROVIDER_DEFS[selectedProvider].requiresKey && !instance.apiKey) {
    return res.status(400).json({ error: `No API key configured for ${selectedProvider}. Add one in Settings → AI Providers.` });
  }

  const selectedModel = model || instance.getDefaultModel();

  // Build or resume conversation
  let convId = conversationId ? parseInt(conversationId) : null;
  let conversationMessages = [];

  if (convId) {
    // Verify ownership
    const conv = dbGet(
      'SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?',
      [convId, req.user.id]
    );
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    // Load previous messages
    const prevMsgs = dbAll(
      'SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY id',
      [convId]
    );
    // Keep last 20 messages to limit context size
    const recentMsgs = prevMsgs.slice(-20);
    conversationMessages = recentMsgs.map(m => ({ role: m.role, content: m.content }));
    // Update conversation timestamp
    dbRun('UPDATE ai_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [convId]);
  } else {
    // Create new conversation
    const title = message.slice(0, 100) + (message.length > 100 ? '...' : '');
    const result = dbRun(
      'INSERT INTO ai_conversations (user_id, title, context, provider, model) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, title, context || 'general', selectedProvider, selectedModel]
    );
    convId = result.lastInsertRowid;
  }

  // Build system prompt with context
  const systemContent = buildSystemPrompt(req.user.id, context);

  // Construct messages array
  const apiMessages = [
    { role: 'system', content: systemContent },
    ...conversationMessages,
    { role: 'user', content: message }
  ];

  // Save user message
  dbRun(
    'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
    [convId, 'user', message]
  );

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send conversation ID first
  res.write(`data: ${JSON.stringify({ type: 'meta', conversationId: convId })}\n\n`);

  let fullResponse = '';

  try {
    const stream = instance.chat(apiMessages, { model: selectedModel, maxTokens: 2048 });

    for await (const chunk of stream) {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    }

    // Save assistant message
    dbRun(
      'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [convId, 'assistant', fullResponse]
    );

    // Auto-rename conversation after first exchange (if title is just the user message)
    const msgCount = dbGet('SELECT COUNT(*) as cnt FROM ai_messages WHERE conversation_id = ?', [convId]);
    if (msgCount && msgCount.cnt <= 2) {
      // Generate a short title from the AI response
      const cleanResponse = fullResponse.replace(/<<<.*?>>>/g, '').trim();
      // Extract first heading, bold text, or first sentence
      const headingMatch = cleanResponse.match(/^#+\s+(.+)/m);
      const boldMatch = cleanResponse.match(/\*\*(.{5,60}?)\*\*/);
      const firstSentence = cleanResponse.split(/[.!?\n]/)[0]?.trim();
      let newTitle = headingMatch ? headingMatch[1] :
                     boldMatch ? boldMatch[1] :
                     firstSentence ? firstSentence.slice(0, 60) : null;
      if (newTitle && newTitle.length > 3) {
        // Strip markdown artifacts
        newTitle = newTitle.replace(/[#*_`]/g, '').trim().slice(0, 80);
        dbRun('UPDATE ai_conversations SET title = ? WHERE id = ?', [newTitle, convId]);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done', conversationId: convId })}\n\n`);
  } catch (err) {
    logger.error('AI chat error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
  }

  res.end();
});

// GET /conversations — list past conversations
router.get('/conversations', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  const conversations = dbAll(
    'SELECT * FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?',
    [req.user.id, limit, offset]
  );

  res.json(conversations);
});

// GET /conversations/:id — get conversation with messages
router.get('/conversations/:id', (req, res) => {
  const { id } = req.params;

  const conv = dbGet(
    'SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?',
    [id, req.user.id]
  );

  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const messages = dbAll(
    'SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY id',
    [id]
  );

  res.json({ ...conv, messages });
});

// DELETE /conversations/:id — delete conversation and its messages
router.delete('/conversations/:id', (req, res) => {
  const { id } = req.params;

  const conv = dbGet(
    'SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?',
    [id, req.user.id]
  );

  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  dbRun('DELETE FROM ai_messages WHERE conversation_id = ?', [id]);
  dbRun('DELETE FROM ai_conversations WHERE id = ?', [id]);

  res.json({ message: 'Conversation deleted' });
});

// ═══════════════════════════════════════════════════════════════════
// Analysis (pre-built prompts)
// ═══════════════════════════════════════════════════════════════════

// Helper: run analysis with a pre-built prompt
async function runAnalysis(req, res, systemExtra, userPrompt) {
  const { provider: providerName, model } = req.body;

  // Determine provider
  let selectedProvider = providerName;
  if (!selectedProvider) {
    const userKeys = dbAll(
      'SELECT provider FROM ai_api_keys WHERE user_id = ?',
      [req.user.id]
    );
    if (userKeys.length) {
      selectedProvider = userKeys[0].provider;
    } else {
      selectedProvider = 'ollama';
    }
  }

  if (!PROVIDER_DEFS[selectedProvider]) {
    return res.status(400).json({ error: `Unknown provider: ${selectedProvider}` });
  }

  const instance = getProviderForUser(req.user.id, selectedProvider);
  if (!instance) {
    return res.status(400).json({ error: 'Provider not configured' });
  }

  if (PROVIDER_DEFS[selectedProvider].requiresKey && !instance.apiKey) {
    return res.status(400).json({ error: `No API key configured for ${selectedProvider}` });
  }

  const selectedModel = model || instance.getDefaultModel();

  const systemContent = `You are an expert financial analyst integrated into Portfolio Tracker Pro. ` +
    `Provide thorough, data-driven analysis with specific numbers and actionable insights. ` +
    `Use markdown formatting for readability. Disclaimer: This is analysis, not financial advice.\n\n` +
    `IMPORTANT: At the very end of every response, suggest 3 natural follow-up questions the user might ask next. ` +
    `Format them on the last line as: <<<Q1|||Q2|||Q3>>> ` +
    `Keep each question short (under 8 words). Make them contextual to what you just discussed.\n\n` +
    systemExtra;

  const apiMessages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userPrompt }
  ];

  // Save as conversation
  const title = userPrompt.slice(0, 100);
  const result = dbRun(
    'INSERT INTO ai_conversations (user_id, title, context, provider, model) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, title, 'analysis', selectedProvider, selectedModel]
  );
  const convId = result.lastInsertRowid;

  dbRun(
    'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
    [convId, 'user', userPrompt]
  );

  // Stream SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'meta', conversationId: convId })}\n\n`);

  let fullResponse = '';

  try {
    const stream = instance.chat(apiMessages, { model: selectedModel, maxTokens: 2048 });

    for await (const chunk of stream) {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    }

    dbRun(
      'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [convId, 'assistant', fullResponse]
    );

    res.write(`data: ${JSON.stringify({ type: 'done', conversationId: convId })}\n\n`);
  } catch (err) {
    logger.error('AI analysis error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
  }

  res.end();
}

// POST /analyze/portfolio — full portfolio review
router.post('/analyze/portfolio', async (req, res) => {
  const portfolioData = buildPortfolioContext(req.user.id, dbAll, dbGet);
  const marketData = buildMarketContext();

  const userPrompt = `Please analyze my portfolio and provide:
1. **Diversification Assessment** — sector/asset allocation, concentration risk
2. **Risk Analysis** — volatility exposure, correlation concerns, drawdown potential
3. **Performance Review** — winners/losers, overall returns
4. **Suggestions** — rebalancing opportunities, potential gaps, actionable improvements

Be specific with numbers from my portfolio data.`;

  await runAnalysis(req, res, portfolioData + '\n' + marketData, userPrompt);
});

// POST /analyze/watchlist — watchlist entry/exit signals
router.post('/analyze/watchlist', async (req, res) => {
  const watchlistData = buildWatchlistContext(req.user.id, dbAll);
  const marketData = buildMarketContext();

  const userPrompt = `Analyze my watchlist items and provide for each:
1. **Current Assessment** — brief overview of each stock's situation
2. **Entry Signals** — what conditions might make it a good buy
3. **Risk Factors** — key concerns or red flags
4. **Priority Ranking** — rank the watchlist items by attractiveness

Consider current market conditions and be specific.`;

  await runAnalysis(req, res, watchlistData + '\n' + marketData, userPrompt);
});

// POST /analyze/position/:symbol — deep dive on specific position
router.post('/analyze/position/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase();

  // Find position data across all user's portfolios
  const positions = dbAll(`
    SELECT p.*, pf.name as portfolio_name
    FROM positions p
    JOIN portfolios pf ON p.portfolio_id = pf.id
    WHERE pf.user_id = ? AND p.symbol = ?
  `, [req.user.id, upperSymbol]);

  let positionContext = '';
  if (positions.length) {
    positionContext = `## Position Data for ${upperSymbol}\n\n`;
    for (const pos of positions) {
      const currentPrice = pos.current_price || pos.entry_price;
      const value = pos.quantity * currentPrice;
      const cost = pos.quantity * pos.entry_price;
      const pnl = value - cost;
      positionContext += `- **Portfolio:** ${pos.portfolio_name}\n`;
      positionContext += `  - Quantity: ${pos.quantity}\n`;
      positionContext += `  - Entry Price: $${pos.entry_price.toFixed(2)}\n`;
      positionContext += `  - Current Price: $${currentPrice.toFixed(2)}\n`;
      positionContext += `  - P&L: $${pnl.toFixed(2)} (${cost > 0 ? ((pnl / cost) * 100).toFixed(1) : '0.0'}%)\n`;
      positionContext += `  - Value: $${value.toFixed(2)}\n\n`;
    }
  } else {
    positionContext = `No position found for ${upperSymbol} in user's portfolios. Analyze based on general knowledge.\n`;
  }

  const marketData = buildMarketContext();

  const userPrompt = `Provide a deep-dive analysis of ${upperSymbol}:
1. **Position Summary** — current standing, profit/loss assessment
2. **Technical Outlook** — key levels, trend direction, momentum
3. **Fundamental Analysis** — valuation, growth prospects, competitive position
4. **Risk Assessment** — specific risks for this stock, worst-case scenarios
5. **Recommendation** — hold, add, trim, or exit — with reasoning

Be specific and reference the position data provided.`;

  await runAnalysis(req, res, positionContext + '\n' + marketData, userPrompt);
});

module.exports = router;
