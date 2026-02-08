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

// Find the first configured/available provider for a user
function findDefaultProvider(userId) {
  // 1. User's own API keys
  const userKeys = dbAll('SELECT provider FROM ai_api_keys WHERE user_id = ?', [userId]);
  if (userKeys.length) return userKeys[0].provider;
  // 2. OpenClaw gateway (preferred — uses existing AI subscription)
  if (process.env.OPENCLAW_GATEWAY_TOKEN) return 'openclaw';
  // 3. Ollama (local, no key needed)
  if (PROVIDER_DEFS.ollama && !PROVIDER_DEFS.ollama.requiresKey) return 'ollama';
  return null;
}

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

  // Auto-detect OpenClaw: read Anthropic API key from OpenClaw's auth profile
  if (providerName === 'openclaw' && !config.apiKey && process.env.OPENCLAW_GATEWAY_TOKEN) {
    try {
      const fs = require('fs');
      const homeDir = require('os').homedir();
      const authPath = require('path').join(homeDir, '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
      const authData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
      const anthropicProfile = authData?.profiles?.['anthropic:default'];
      if (anthropicProfile?.token) {
        config.apiKey = anthropicProfile.token;
        config.baseUrl = 'https://api.anthropic.com';
      }
    } catch (err) {
      logger.error('Failed to read OpenClaw Anthropic token:', err.message);
    }
  }

  return new AIProvider(providerName, config);
}

// ─── System prompt builder ─────────────────────────────────────────

async function buildSystemPrompt(userId, context) {
  let systemContent = `You are Oracle, a sharp financial assistant built into Portfolio Tracker Pro. ` +
    `You help users analyze investments, understand markets, and make informed decisions.\n\n` +
    `## Style Guidelines\n` +
    `- Be concise and data-driven. Lead with the most important insight.\n` +
    `- Use tables for comparisons and bullet points for lists.\n` +
    `- Default to ~300-500 words. Go longer ONLY for explicit deep-dive or analysis requests.\n` +
    `- For simple questions (greetings, yes/no, definitions), keep it under 50 words.\n` +
    `- Use bold for key numbers and takeaways.\n` +
    `- Be direct and opinionated — don't hedge everything. If the data says something, say it.\n` +
    `- Reference the user's actual portfolio data when available — generic advice is useless.\n` +
    `- End with a clear takeaway or action item when relevant.\n` +
    `- Disclaimer: You provide analysis, not financial advice.\n\n` +
    `## Actions\n` +
    `You can suggest portfolio actions that the user can execute with one click.\n` +
    `Include action tags INLINE in your response where relevant (not at the end):\n` +
    `- Set price alert: [[[ACTION:alert:SYMBOL:PRICE:above]]] or [[[ACTION:alert:SYMBOL:PRICE:below]]]\n` +
    `- Add to watchlist: [[[ACTION:watchlist:SYMBOL]]]\n` +
    `- Add position: [[[ACTION:position:SYMBOL:QUANTITY:PRICE]]]\n` +
    `Example: "I'd recommend setting an alert for TSLA at $420 [[[ACTION:alert:TSLA:420:above]]] to catch the breakout."\n` +
    `Only suggest actions that make sense in context. Don't force them.\n\n` +
    `## Onboarding\n` +
    `If the user asks you to help build their first portfolio or says they're new:\n` +
    `1. Start by welcoming them warmly. Ask about their investment goals (growth/income/preservation/speculation) and risk tolerance (conservative/moderate/aggressive).\n` +
    `2. After they answer, ask about their time horizon and how much cash they want to invest.\n` +
    `3. Then ask about any convictions — sectors, themes, or specific stocks/crypto they like.\n` +
    `4. Keep it conversational — ask 2-3 questions at a time max, not all at once.\n` +
    `5. After gathering enough info, suggest a COMPLETE portfolio (8-15 positions) with specific allocations.\n` +
    `   Use [[[ACTION:position:SYMBOL:QUANTITY:PRICE]]] for EACH suggested position so they can add with one click.\n` +
    `   Include a diversified mix appropriate to their profile. Use current market prices from context.\n` +
    `   Show a summary table with ticker, name, allocation %, quantity, and price.\n\n` +
    `## Follow-up Suggestions\n` +
    `At the very end of every response, suggest 3 follow-up questions on the LAST line.\n` +
    `Format: <<<Q1|||Q2|||Q3>>>\n` +
    `Rules: under 8 words each, specific to what you just discussed, actionable.\n` +
    `Example: <<<Should I trim my BTC?|||Compare to S&P 500|||Set alerts for NVDA>>>\n` +
    `For simple responses (greetings, etc.), suggest getting-started questions instead.\n\n`;

  if (!context || context === 'general') {
    return systemContent;
  }

  const contexts = context.split(',').map(c => c.trim());

  // Handle analysis follow-ups: rebuild the same context the analysis had
  // 'analysis' (legacy) falls back to portfolio+market context
  if (contexts.includes('analysis') || contexts.includes('analysis-portfolio') || contexts.includes('analysis-watchlist') || contexts.includes('analysis-news') || contexts.includes('analysis-rebalance') || contexts.some(c => c.startsWith('analysis-position:'))) {
    // Switch to analysis-style system prompt for continuity
    systemContent = `You are Oracle, an expert financial analyst built into Portfolio Tracker Pro.\n\n` +
      `## Analysis Guidelines\n` +
      `- Provide data-driven analysis with specific numbers and actionable conclusions.\n` +
      `- Use markdown tables for data, bold for key takeaways.\n` +
      `- Be opinionated — give a clear verdict (buy/hold/sell/avoid) with reasoning.\n` +
      `- Reference the user's actual position data and cost basis when available.\n` +
      `- Keep it focused. Quality over quantity.\n` +
      `- Disclaimer: Analysis, not financial advice.\n\n` +
      `## Follow-up Suggestions\n` +
      `Last line of every response: <<<Q1|||Q2|||Q3>>> (under 8 words each, specific and actionable)\n\n`;

    if (contexts.includes('analysis-portfolio') || contexts.includes('analysis')) {
      // 'analysis' (legacy) defaults to portfolio+market for backwards compat
      systemContent += await buildPortfolioContext(userId, dbAll, dbGet) + '\n';
      systemContent += buildMarketContext() + '\n';
    }
    if (contexts.includes('analysis-watchlist')) {
      systemContent += await buildWatchlistContext(userId, dbAll) + '\n';
      systemContent += buildMarketContext() + '\n';
    }
    if (contexts.includes('analysis-news')) {
      systemContent += await buildPortfolioContext(userId, dbAll, dbGet) + '\n';
      systemContent += buildMarketContext() + '\n';
    }
    if (contexts.includes('analysis-rebalance')) {
      systemContent += await buildPortfolioContext(userId, dbAll, dbGet) + '\n';
      systemContent += await buildWatchlistContext(userId, dbAll) + '\n';
      systemContent += buildMarketContext() + '\n';
    }
    const posContext = contexts.find(c => c.startsWith('analysis-position:'));
    if (posContext) {
      const symbol = posContext.split(':')[1];
      if (symbol) {
        // Rebuild position context
        const positions = dbAll(`
          SELECT p.*, pf.name as portfolio_name
          FROM positions p
          JOIN portfolios pf ON p.portfolio_id = pf.id
          WHERE pf.user_id = ? AND p.symbol = ?
        `, [userId, symbol.toUpperCase()]);

        let positionData = '';
        if (positions.length) {
          positionData = `## Position Data for ${symbol.toUpperCase()}\n\n`;
          for (const pos of positions) {
            const currentPrice = pos.current_price || pos.entry_price;
            const value = pos.quantity * currentPrice;
            const cost = pos.quantity * pos.entry_price;
            const pnl = value - cost;
            positionData += `- **Portfolio:** ${pos.portfolio_name}\n`;
            positionData += `  - Quantity: ${pos.quantity}\n`;
            positionData += `  - Entry Price: $${pos.entry_price.toFixed(2)}\n`;
            positionData += `  - Current Price: $${currentPrice.toFixed(2)}\n`;
            positionData += `  - P&L: $${pnl.toFixed(2)} (${cost > 0 ? ((pnl / cost) * 100).toFixed(1) : '0.0'}%)\n`;
            positionData += `  - Value: $${value.toFixed(2)}\n\n`;
          }
        }
        systemContent += positionData;
        systemContent += buildMarketContext() + '\n';
      }
    }
    return systemContent;
  }

  if (contexts.includes('portfolio')) {
    systemContent += await buildPortfolioContext(userId, dbAll, dbGet) + '\n';
  }
  if (contexts.includes('watchlist')) {
    systemContent += await buildWatchlistContext(userId, dbAll) + '\n';
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
    selectedProvider = findDefaultProvider(req.user.id);
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
  let effectiveContext = context || 'general';

  if (convId) {
    // Verify ownership
    const conv = dbGet(
      'SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?',
      [convId, req.user.id]
    );
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    // Use stored conversation context for continuity (e.g. analysis-portfolio)
    // This ensures follow-up messages in an analysis conversation get the same context
    if (conv.context) {
      effectiveContext = conv.context;
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
      [req.user.id, title, effectiveContext, selectedProvider, selectedModel]
    );
    convId = result.lastInsertRowid;
  }

  // Build system prompt with context (uses stored context for resumed conversations)
  const systemContent = await buildSystemPrompt(req.user.id, effectiveContext);

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
  const startTime = Date.now();

  try {
    const stream = instance.chat(apiMessages, { model: selectedModel, maxTokens: 4096 });

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

    // Build done event with usage info
    const durationMs = Date.now() - startTime;
    const usage = instance.lastUsage || {
      input: Math.round(apiMessages.map(m => m.content).join('').length / 4),
      output: Math.round(fullResponse.length / 4)
    };
    res.write(`data: ${JSON.stringify({ type: 'done', conversationId: convId, model: selectedModel, durationMs, usage })}\n\n`);
  } catch (err) {
    console.error('AI CHAT ERROR:', err.message, err.cause?.message || err.cause, err.code);
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
async function runAnalysis(req, res, systemExtra, userPrompt, analysisContext) {
  const { provider: providerName, model } = req.body;

  // Determine provider
  let selectedProvider = providerName;
  if (!selectedProvider) {
    selectedProvider = findDefaultProvider(req.user.id);
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

  const systemContent = `You are Oracle, an expert financial analyst built into Portfolio Tracker Pro.\n\n` +
    `## Analysis Guidelines\n` +
    `- Provide data-driven analysis with specific numbers and actionable conclusions.\n` +
    `- Use markdown tables for data, bold for key takeaways.\n` +
    `- Be opinionated — give a clear verdict (buy/hold/sell/avoid) with reasoning.\n` +
    `- Reference the user's actual position data and cost basis when available.\n` +
    `- For portfolio reviews: highlight concentration risk, top movers, and ONE actionable suggestion.\n` +
    `- For position deep dives: include technical levels, fundamental value, and a clear recommendation.\n` +
    `- Keep it focused — aim for 800-1200 words max. Quality over quantity.\n` +
    `- Disclaimer: Analysis, not financial advice.\n\n` +
    `## Actions\n` +
    `You can suggest portfolio actions that the user can execute with one click.\n` +
    `Include action tags INLINE in your response where relevant (not at the end):\n` +
    `- Set price alert: [[[ACTION:alert:SYMBOL:PRICE:above]]] or [[[ACTION:alert:SYMBOL:PRICE:below]]]\n` +
    `- Add to watchlist: [[[ACTION:watchlist:SYMBOL]]]\n` +
    `- Add position: [[[ACTION:position:SYMBOL:QUANTITY:PRICE]]]\n` +
    `Example: "I'd recommend setting an alert for TSLA at $420 [[[ACTION:alert:TSLA:420:above]]] to catch the breakout."\n` +
    `Only suggest actions that make sense in context. Don't force them.\n\n` +
    `## Follow-up Suggestions\n` +
    `Last line of every response: <<<Q1|||Q2|||Q3>>> (under 8 words each, specific and actionable)\n\n` +
    systemExtra;

  const apiMessages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userPrompt }
  ];

  // Save as conversation with specific analysis context for follow-up continuity
  const title = userPrompt.slice(0, 100);
  const result = dbRun(
    'INSERT INTO ai_conversations (user_id, title, context, provider, model) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, title, analysisContext || 'analysis', selectedProvider, selectedModel]
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
  const startTime = Date.now();

  try {
    console.log(`ANALYZE: provider=${selectedProvider} model=${selectedModel} baseUrl=${instance.baseUrl} hasKey=${!!instance.apiKey}`);
    const stream = instance.chat(apiMessages, { model: selectedModel, maxTokens: 4096 });

    for await (const chunk of stream) {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    }

    console.log(`ANALYZE: done, response length=${fullResponse.length}`);
    dbRun(
      'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [convId, 'assistant', fullResponse]
    );

    // Build done event with usage info
    const durationMs = Date.now() - startTime;
    const usage = instance.lastUsage || {
      input: Math.round(apiMessages.map(m => m.content).join('').length / 4),
      output: Math.round(fullResponse.length / 4)
    };
    res.write(`data: ${JSON.stringify({ type: 'done', conversationId: convId, model: selectedModel, durationMs, usage })}\n\n`);
  } catch (err) {
    console.error('AI ANALYSIS ERROR:', err.message, err.cause?.message || err.cause, err.code);
    console.error('AI ANALYSIS STACK:', err.stack);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
  }

  res.end();
}

// POST /analyze/portfolio — full portfolio review
router.post('/analyze/portfolio', async (req, res) => {
  const portfolioData = await buildPortfolioContext(req.user.id, dbAll, dbGet);
  const marketData = buildMarketContext();

  const userPrompt = `Please analyze my portfolio and provide:
1. **Diversification Assessment** — sector/asset allocation, concentration risk
2. **Risk Analysis** — volatility exposure, correlation concerns, drawdown potential
3. **Performance Review** — winners/losers, overall returns
4. **Suggestions** — rebalancing opportunities, potential gaps, actionable improvements

Be specific with numbers from my portfolio data.`;

  await runAnalysis(req, res, portfolioData + '\n' + marketData, userPrompt, 'analysis-portfolio');
});

// POST /analyze/watchlist — watchlist entry/exit signals
router.post('/analyze/watchlist', async (req, res) => {
  const watchlistData = await buildWatchlistContext(req.user.id, dbAll);
  const marketData = buildMarketContext();

  const userPrompt = `Analyze my watchlist and provide actionable entry/exit signals:

1. **Signal Summary Table** — for each watchlist item, show:
   | Ticker | Signal | Price Target | Confidence | Timeframe |
   (Signal = Strong Buy / Buy / Hold / Sell / Strong Sell)

2. **Top 3 Entry Opportunities** — the best buys right now:
   - Entry price zone (specific range)
   - Stop-loss level
   - Target price (with upside %)
   - Catalyst or reason to act NOW

3. **Avoid / Exit Warnings** — any watchlist items showing red flags:
   - What's wrong (technical breakdown, fundamental deterioration)
   - If already held, suggested exit strategy

4. **Key Levels to Watch** — for each ticker, the ONE price level that matters most right now (support to buy, resistance to sell)

Be specific with price levels and percentages. No vague "might go up" — give concrete numbers.`;

  await runAnalysis(req, res, watchlistData + '\n' + marketData, userPrompt, 'analysis-watchlist');
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

  // Fetch live Yahoo price for this symbol
  let livePrice = null;
  try {
    const { fetchYahooPrice } = require('../utils/yahoo');
    const priceData = await fetchYahooPrice(upperSymbol);
    if (priceData?.price) livePrice = priceData.price;
  } catch (e) { /* fallback to DB price */ }

  let positionContext = '';
  if (positions.length) {
    positionContext = `## Position Data for ${upperSymbol}\n\n`;
    for (const pos of positions) {
      const currentPrice = livePrice || pos.current_price || pos.entry_price;
      const value = pos.quantity * currentPrice;
      const cost = pos.quantity * pos.entry_price;
      const pnl = value - cost;
      positionContext += `- **Portfolio:** ${pos.portfolio_name}\n`;
      positionContext += `  - Quantity: ${pos.quantity}\n`;
      positionContext += `  - Entry Price: $${pos.entry_price.toFixed(2)}\n`;
      positionContext += `  - Current Price: $${currentPrice.toFixed(2)}${livePrice ? ' (live)' : ' (last known)'}\n`;
      positionContext += `  - P&L: $${pnl.toFixed(2)} (${cost > 0 ? ((pnl / cost) * 100).toFixed(1) : '0.0'}%)\n`;
      positionContext += `  - Value: $${value.toFixed(2)}\n\n`;
    }
  } else {
    positionContext = `No position found for ${upperSymbol} in user's portfolios. Analyze based on general knowledge and current market data.\n`;
  }

  const marketData = buildMarketContext();

  const userPrompt = `Provide a deep-dive analysis of ${upperSymbol}:
1. **Position Summary** — current standing, profit/loss assessment
2. **Technical Outlook** — key levels, trend direction, momentum
3. **Fundamental Analysis** — valuation, growth prospects, competitive position
4. **Risk Assessment** — specific risks for this stock, worst-case scenarios
5. **Recommendation** — hold, add, trim, or exit — with reasoning

Be specific and reference the position data provided.`;

  await runAnalysis(req, res, positionContext + '\n' + marketData, userPrompt, `analysis-position:${upperSymbol}`);
});

// POST /analyze/news — AI-powered news digest for holdings
router.post('/analyze/news', async (req, res) => {
  // Get user's position symbols
  const positions = dbAll(`
    SELECT DISTINCT p.symbol FROM positions p
    JOIN portfolios pf ON p.portfolio_id = pf.id
    WHERE pf.user_id = ?
    ORDER BY p.quantity * COALESCE(p.current_price, p.entry_price) DESC
    LIMIT 10
  `, [req.user.id]);

  const symbols = positions.map(p => p.symbol);

  // Fetch news from Yahoo for top holdings
  let newsContext = '## Recent News for Your Holdings\n\n';

  if (symbols.length === 0) {
    newsContext += 'No positions found. Add some positions first.\n';
  } else {
    try {
      const { fetchYahooNews } = require('../utils/yahoo');
      const newsResults = await Promise.allSettled(
        symbols.slice(0, 5).map(sym => fetchYahooNews(sym))
      );

      for (let i = 0; i < newsResults.length; i++) {
        const result = newsResults[i];
        const sym = symbols[i];
        if (result.status === 'fulfilled' && result.value?.length > 0) {
          newsContext += `### ${sym}\n`;
          for (const article of result.value.slice(0, 3)) {
            newsContext += `- **${article.title}** (${article.publisher || 'Unknown'}, ${article.date || 'recent'})\n`;
          }
          newsContext += '\n';
        }
      }
    } catch (e) {
      newsContext += 'Unable to fetch news at this time.\n';
    }
  }

  const portfolioData = await buildPortfolioContext(req.user.id, dbAll, dbGet);

  const userPrompt = `Based on the recent news for my holdings, provide:
1. **Key Headlines** — what happened and why it matters for my portfolio
2. **Impact Assessment** — which positions are most affected (positive or negative)
3. **Action Items** — any immediate concerns or opportunities
4. **Market Mood** — overall sentiment for my holdings

Be concise and focus on what's actionable.`;

  await runAnalysis(req, res, newsContext + '\n' + portfolioData, userPrompt, 'analysis-news');
});

// POST /analyze/rebalance — rebalancing suggestions with concrete targets
router.post('/analyze/rebalance', async (req, res) => {
  const portfolioData = await buildPortfolioContext(req.user.id, dbAll, dbGet);
  const watchlistData = await buildWatchlistContext(req.user.id, dbAll);
  const marketData = buildMarketContext();

  const userPrompt = `Analyze my current portfolio allocation and provide a concrete rebalancing plan:

1. **Current Allocation** — show my current asset class/sector weights as a table
2. **Target Allocation** — propose a target allocation with specific percentages, tailored to my portfolio size and existing positions
3. **Specific Trades** — list exact trades to execute:
   - What to sell (symbol, quantity or %, dollar amount)
   - What to buy (symbol, quantity or %, dollar amount)
   - Priority order (do this first, then this)
4. **Rationale** — why these changes improve the portfolio
5. **Risk Impact** — how the rebalanced portfolio compares to current (volatility, max drawdown, correlation)

Consider my watchlist items as potential buy candidates. Be specific with numbers — no vague suggestions.`;

  await runAnalysis(req, res, portfolioData + '\n' + watchlistData + '\n' + marketData, userPrompt, 'analysis-rebalance');
});

// ═══════════════════════════════════════════════════════════════════
// Action Execution (AI-suggested inline actions)
// ═══════════════════════════════════════════════════════════════════

router.post('/action', async (req, res) => {
  const { type, params } = req.body;
  logger.info('AI action request', { type, params, userId: req.user?.id, username: req.user?.username });

  if (!type || !Array.isArray(params)) {
    return res.status(400).json({ error: 'Missing type or params' });
  }

  try {
    switch (type) {
      case 'alert': {
        const [symbol, price, direction] = params;
        if (!symbol || !price) {
          return res.status(400).json({ error: 'Missing symbol or price for alert' });
        }
        // Schema: alerts(user_id, symbol, condition, value, is_active)
        // condition maps to direction (above/below)
        dbRun(
          'INSERT INTO alerts (user_id, symbol, condition, value, is_active) VALUES (?, ?, ?, ?, 1)',
          [req.user.id, symbol.toUpperCase(), direction || 'above', parseFloat(price)]
        );
        return res.json({ success: true, message: `Alert set: ${symbol.toUpperCase()} ${direction || 'above'} $${price}` });
      }
      case 'watchlist': {
        const [symbol] = params;
        if (!symbol) {
          return res.status(400).json({ error: 'Missing symbol for watchlist' });
        }
        // Get or create default watchlist
        let watchlist = dbGet('SELECT id FROM watchlists WHERE user_id = ? ORDER BY id LIMIT 1', [req.user.id]);
        if (!watchlist) {
          const result = dbRun('INSERT INTO watchlists (user_id, name) VALUES (?, ?)', [req.user.id, 'My Watchlist']);
          watchlist = { id: result.lastInsertRowid };
        }
        // Check if already exists (UNIQUE constraint on watchlist_id, symbol)
        const existing = dbGet('SELECT id FROM watchlist_items WHERE watchlist_id = ? AND symbol = ?', [watchlist.id, symbol.toUpperCase()]);
        if (existing) {
          return res.json({ success: true, message: `${symbol.toUpperCase()} is already on your watchlist` });
        }
        dbRun('INSERT INTO watchlist_items (watchlist_id, symbol) VALUES (?, ?)', [watchlist.id, symbol.toUpperCase()]);
        return res.json({ success: true, message: `${symbol.toUpperCase()} added to watchlist` });
      }
      case 'position': {
        const [symbol, quantity, price] = params;
        if (!symbol || !quantity || !price) {
          return res.status(400).json({ error: 'Missing symbol, quantity, or price for position' });
        }
        // Get first portfolio
        const portfolio = dbGet('SELECT id FROM portfolios WHERE user_id = ? ORDER BY id LIMIT 1', [req.user.id]);
        if (!portfolio) {
          return res.status(400).json({ error: 'No portfolio found. Create one first.' });
        }
        // Schema: positions(portfolio_id, symbol, quantity, entry_price, type)
        // Check for existing position (UNIQUE on portfolio_id, symbol)
        const existingPos = dbGet('SELECT id, quantity, entry_price FROM positions WHERE portfolio_id = ? AND symbol = ?', [portfolio.id, symbol.toUpperCase()]);
        const parsedQty = parseFloat(quantity);
        const parsedPrice = parseFloat(price);
        const upperSymbol = symbol.toUpperCase();

        if (existingPos) {
          // Update: average in the new position
          const totalQty = existingPos.quantity + parsedQty;
          const avgPrice = ((existingPos.quantity * existingPos.entry_price) + (parsedQty * parsedPrice)) / totalQty;
          dbRun(
            'UPDATE positions SET quantity = ?, entry_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [totalQty, avgPrice, existingPos.id]
          );
          // Also create a buy transaction for history
          dbRun(
            `INSERT INTO transactions (portfolio_id, symbol, type, action, quantity, price, fees, executed_at, notes, source)
             VALUES (?, ?, 'stock', 'buy', ?, ?, 0, datetime('now'), 'Added via Oracle AI', 'ai')`,
            [portfolio.id, upperSymbol, parsedQty, parsedPrice]
          );
          // Auto-add to default watchlist if not already there
          try {
            const watchlist = dbGet('SELECT id FROM watchlists WHERE user_id = ? ORDER BY id LIMIT 1', [req.user.id]);
            if (watchlist) {
              const existingWl = dbGet('SELECT id FROM watchlist_items WHERE watchlist_id = ? AND symbol = ?', [watchlist.id, upperSymbol]);
              if (!existingWl) {
                dbRun('INSERT INTO watchlist_items (watchlist_id, symbol, name, category) VALUES (?, ?, ?, ?)',
                  [watchlist.id, upperSymbol, upperSymbol, 'general']);
                logger.info(`Auto-added ${upperSymbol} to watchlist ${watchlist.id} for user ${req.user.id}`);
              }
            }
          } catch (wlErr) {
            logger.error('Auto-add to watchlist failed:', wlErr.message);
          }

          return res.json({ success: true, message: `Updated ${upperSymbol}: now ${totalQty} shares @ $${avgPrice.toFixed(2)} avg` });
        }
        dbRun(
          'INSERT INTO positions (portfolio_id, symbol, quantity, entry_price, type) VALUES (?, ?, ?, ?, ?)',
          [portfolio.id, upperSymbol, parsedQty, parsedPrice, 'stock']
        );
        // Create a buy transaction for history
        dbRun(
          `INSERT INTO transactions (portfolio_id, symbol, type, action, quantity, price, fees, executed_at, notes, source)
           VALUES (?, ?, 'stock', 'buy', ?, ?, 0, datetime('now'), 'Added via Oracle AI', 'ai')`,
          [portfolio.id, upperSymbol, parsedQty, parsedPrice]
        );

        // Auto-add to default watchlist if not already there
        try {
          const watchlist = dbGet('SELECT id FROM watchlists WHERE user_id = ? ORDER BY id LIMIT 1', [req.user.id]);
          if (watchlist) {
            const existingWl = dbGet('SELECT id FROM watchlist_items WHERE watchlist_id = ? AND symbol = ?', [watchlist.id, upperSymbol]);
            if (!existingWl) {
              dbRun('INSERT INTO watchlist_items (watchlist_id, symbol, name, category) VALUES (?, ?, ?, ?)',
                [watchlist.id, upperSymbol, upperSymbol, 'general']);
              logger.info(`Auto-added ${upperSymbol} to watchlist ${watchlist.id} for user ${req.user.id}`);
            }
          }
        } catch (wlErr) {
          logger.error('Auto-add to watchlist failed:', wlErr.message);
        }

        return res.json({ success: true, message: `Added ${quantity} ${upperSymbol} @ $${price}` });
      }
      default:
        return res.status(400).json({ error: `Unknown action type: ${type}` });
    }
  } catch (err) {
    logger.error('AI action error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
