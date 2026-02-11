/**
 * Report Scheduler — runs periodic AI reports for users
 * Checks every minute if any user has a scheduled report due
 */

const cron = require('node-cron');
const { dbAll, dbGet, dbRun } = require('../db');
const { AIProvider, PROVIDER_DEFS, encryptKey, decryptKey, buildPortfolioContext, buildWatchlistContext, buildMarketContext } = require('./ai-providers');
const { logger } = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

// Track last report times to avoid duplicates (userId -> { daily: timestamp, weekly: timestamp })
const lastReportTimes = {};

function getProviderForUser(userId) {
  // Find first configured provider
  const userKeys = dbAll('SELECT * FROM ai_api_keys WHERE user_id = ?', [userId]);
  
  let providerName = null;
  let row = null;
  
  if (userKeys.length) {
    row = userKeys[0];
    providerName = row.provider;
  } else if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    providerName = 'openclaw';
  } else if (PROVIDER_DEFS.ollama && !PROVIDER_DEFS.ollama.requiresKey) {
    providerName = 'ollama';
  }

  if (!providerName || !PROVIDER_DEFS[providerName]) return null;

  const config = {
    model: row?.model_preference || null,
    baseUrl: row?.base_url || PROVIDER_DEFS[providerName].baseUrl,
    contextLength: row?.context_length || null
  };

  if (row?.encrypted_key && row.encrypted_key !== 'auto-detected') {
    try {
      config.apiKey = decryptKey(row.encrypted_key, JWT_SECRET);
    } catch (err) {
      logger.error(`Report scheduler: failed to decrypt key for ${providerName}:`, err.message);
      return null;
    }
  }

  // Auto-detect OpenClaw
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
      logger.error('Report scheduler: failed to read OpenClaw token:', err.message);
    }
  }

  return { instance: new AIProvider(providerName, config), providerName, model: config.model };
}

/**
 * Generate a report for a user
 * @param {number} userId 
 * @param {'daily'|'weekly'} reportType 
 * @returns {object|null} The created conversation, or null on failure
 */
async function generateReport(userId, reportType) {
  logger.info(`Generating ${reportType} report for user ${userId}`);

  const provider = getProviderForUser(userId);
  if (!provider) {
    logger.warn(`Report scheduler: no AI provider for user ${userId}, skipping`);
    return null;
  }

  const { instance, providerName, model: modelPref } = provider;
  const selectedModel = modelPref || instance.getDefaultModel();

  // Build context
  const portfolioData = await buildPortfolioContext(userId, dbAll, dbGet);
  const watchlistData = await buildWatchlistContext(userId, dbAll);
  const marketData = buildMarketContext(dbAll);

  let userPrompt, systemExtra;

  if (reportType === 'daily') {
    userPrompt = `Generate my daily portfolio report:

1. **Portfolio Summary** — total value, daily change, cash position
2. **P&L Overview** — today's winners and losers with specific numbers
3. **Notable Movers** — any positions that moved more than 3%
4. **Alert Status** — any alerts triggered or close to triggering
5. **Market Context** — key market moves affecting my portfolio
6. **Quick Take** — one sentence overall assessment

Be concise and data-driven. This is a daily check-in, not a deep dive.`;
  } else {
    userPrompt = `Generate my weekly portfolio digest:

1. **Week in Review** — portfolio performance over the past week
2. **Top Performers** — best 3 positions this week with % gains
3. **Bottom Performers** — worst 3 positions this week with % losses
4. **Portfolio Changes** — any significant allocation shifts
5. **Market Recap** — key market events that affected my portfolio
6. **Watchlist Highlights** — notable moves on watchlist items
7. **Recommendations** — 2-3 actionable suggestions for the coming week
8. **Risk Check** — any emerging concentration or correlation risks

Provide a comprehensive but readable weekly summary.`;
  }

  systemExtra = `You are Oracle, generating a scheduled ${reportType} report for the user.\n` +
    `This is an automated report — be direct and data-focused.\n` +
    `Use markdown formatting with bold for key numbers.\n` +
    `Do NOT include follow-up suggestions (<<<...>>>) in scheduled reports.\n\n` +
    portfolioData + '\n' + watchlistData + '\n' + marketData;

  const systemContent = `You are Oracle, an expert financial analyst built into Portfolio Tracker Pro.\n\n` +
    `## Report Guidelines\n` +
    `- Provide data-driven analysis with specific numbers.\n` +
    `- Use markdown tables for data, bold for key takeaways.\n` +
    `- Be concise and actionable.\n` +
    `- This is a scheduled ${reportType} report.\n\n` +
    systemExtra;

  const apiMessages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userPrompt }
  ];

  // Create conversation with report type markers
  const title = reportType === 'daily' 
    ? `📊 Daily Report — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : `📊 Weekly Digest — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const result = dbRun(
    'INSERT INTO ai_conversations (user_id, title, context, provider, model) VALUES (?, ?, ?, ?, ?)',
    [userId, title, `report-${reportType}`, providerName, selectedModel]
  );
  const convId = result.lastInsertRowid;

  dbRun(
    'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
    [convId, 'user', userPrompt]
  );

  try {
    const stream = instance.chat(apiMessages, { model: selectedModel, maxTokens: 4096 });
    let fullResponse = '';

    for await (const chunk of stream) {
      fullResponse += chunk;
    }

    dbRun(
      'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [convId, 'assistant', fullResponse]
    );

    logger.info(`${reportType} report generated for user ${userId}, conversation ${convId}, length=${fullResponse.length}`);

    // Update last report time in user settings
    const user = dbGet('SELECT settings FROM users WHERE id = ?', [userId]);
    const settings = JSON.parse(user?.settings || '{}');
    if (!settings.autoReports) settings.autoReports = {};
    if (!settings.autoReports[reportType]) settings.autoReports[reportType] = {};
    settings.autoReports[reportType].lastGenerated = new Date().toISOString();
    dbRun('UPDATE users SET settings = ? WHERE id = ?', [JSON.stringify(settings), userId]);

    return { conversationId: convId, title, length: fullResponse.length };
  } catch (err) {
    logger.error(`Report generation failed for user ${userId}:`, err.message);
    // Clean up failed conversation
    dbRun('DELETE FROM ai_messages WHERE conversation_id = ?', [convId]);
    dbRun('DELETE FROM ai_conversations WHERE id = ?', [convId]);
    return null;
  }
}

/**
 * Check if a report is due for the given schedule config
 */
function isReportDue(scheduleConfig, reportType, userId) {
  if (!scheduleConfig?.enabled) return false;

  const tz = scheduleConfig.timezone || 'UTC';
  const targetTime = scheduleConfig.time || '09:00';
  const [targetHour, targetMin] = targetTime.split(':').map(Number);

  // Get current time in the user's timezone
  let now;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric', minute: 'numeric', hour12: false,
      weekday: 'long'
    });
    const parts = formatter.formatToParts(new Date());
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() || '';
    now = { hour, minute, weekday };
  } catch (e) {
    // Fallback to UTC
    const d = new Date();
    now = { hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() };
  }

  // Check if current time matches (within 1-minute window)
  if (now.hour !== targetHour || now.minute !== targetMin) return false;

  // For weekly reports, check day of week
  if (reportType === 'weekly') {
    const targetDay = (scheduleConfig.day || 'monday').toLowerCase();
    if (now.weekday !== targetDay) return false;
  }

  // Prevent duplicate reports (check if already generated within the last hour)
  const key = `${userId}-${reportType}`;
  const lastTime = lastReportTimes[key];
  if (lastTime && (Date.now() - lastTime) < 3600000) return false; // 1 hour cooldown

  return true;
}

/**
 * Main check — called every minute
 */
async function checkScheduledReports() {
  try {
    const users = dbAll('SELECT id, settings FROM users');

    for (const user of users) {
      const settings = JSON.parse(user.settings || '{}');
      const autoReports = settings.autoReports;
      if (!autoReports) continue;

      // Check daily
      if (isReportDue(autoReports.daily, 'daily', user.id)) {
        const key = `${user.id}-daily`;
        lastReportTimes[key] = Date.now();
        generateReport(user.id, 'daily').catch(err => {
          logger.error(`Daily report error for user ${user.id}:`, err.message);
        });
      }

      // Check weekly
      if (isReportDue(autoReports.weekly, 'weekly', user.id)) {
        const key = `${user.id}-weekly`;
        lastReportTimes[key] = Date.now();
        generateReport(user.id, 'weekly').catch(err => {
          logger.error(`Weekly report error for user ${user.id}:`, err.message);
        });
      }
    }
  } catch (err) {
    logger.error('Report scheduler check error:', err.message);
  }
}

/**
 * Start the report scheduler
 */
function startReportScheduler() {
  // Run every minute
  cron.schedule('* * * * *', () => {
    checkScheduledReports();
  });
  logger.info('📊 Report scheduler started (checking every minute)');
}

module.exports = { startReportScheduler, generateReport };
