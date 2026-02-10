/**
 * Scheduled Reports API Routes
 * GET/PUT settings, list reports, manual generate
 */

const express = require('express');
const { dbGet, dbRun, dbAll } = require('../db');
const { generateReport } = require('../utils/report-scheduler');
const { logger } = require('../utils/logger');

const router = express.Router();

// GET /settings — get auto-report settings
router.get('/settings', (req, res) => {
  const user = dbGet('SELECT settings FROM users WHERE id = ?', [req.user.id]);
  const settings = JSON.parse(user?.settings || '{}');
  
  const autoReports = settings.autoReports || {
    daily: { enabled: false, time: '09:00', timezone: 'America/New_York' },
    weekly: { enabled: false, day: 'monday', time: '09:00', timezone: 'America/New_York' }
  };

  res.json(autoReports);
});

// PUT /settings — update auto-report settings
router.put('/settings', (req, res) => {
  const { daily, weekly } = req.body;

  // Validate
  if (daily) {
    if (daily.time && !/^\d{2}:\d{2}$/.test(daily.time)) {
      return res.status(400).json({ error: 'Invalid time format (expected HH:MM)' });
    }
    if (daily.timezone && typeof daily.timezone !== 'string') {
      return res.status(400).json({ error: 'Invalid timezone' });
    }
  }
  if (weekly) {
    if (weekly.time && !/^\d{2}:\d{2}$/.test(weekly.time)) {
      return res.status(400).json({ error: 'Invalid time format (expected HH:MM)' });
    }
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (weekly.day && !validDays.includes(weekly.day.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid day of week' });
    }
  }

  const user = dbGet('SELECT settings FROM users WHERE id = ?', [req.user.id]);
  const settings = JSON.parse(user?.settings || '{}');

  // Merge settings, preserving lastGenerated
  if (!settings.autoReports) {
    settings.autoReports = {
      daily: { enabled: false, time: '09:00', timezone: 'America/New_York' },
      weekly: { enabled: false, day: 'monday', time: '09:00', timezone: 'America/New_York' }
    };
  }

  if (daily) {
    const lastGen = settings.autoReports.daily?.lastGenerated;
    settings.autoReports.daily = { ...settings.autoReports.daily, ...daily };
    if (lastGen) settings.autoReports.daily.lastGenerated = lastGen;
  }
  if (weekly) {
    const lastGen = settings.autoReports.weekly?.lastGenerated;
    settings.autoReports.weekly = { ...settings.autoReports.weekly, ...weekly };
    if (lastGen) settings.autoReports.weekly.lastGenerated = lastGen;
  }

  dbRun('UPDATE users SET settings = ? WHERE id = ?', [JSON.stringify(settings), req.user.id]);

  res.json({ message: 'Report settings updated', autoReports: settings.autoReports });
});

// GET / — list generated reports
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  const reports = dbAll(
    `SELECT * FROM ai_conversations 
     WHERE user_id = ? AND context LIKE 'report-%' 
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [req.user.id, limit, offset]
  );

  res.json(reports);
});

// POST /generate — manually trigger a report
router.post('/generate', async (req, res) => {
  const { type } = req.body;
  const reportType = type === 'weekly' ? 'weekly' : 'daily';

  try {
    const result = await generateReport(req.user.id, reportType);
    if (!result) {
      return res.status(500).json({ error: 'Report generation failed. Check AI provider configuration.' });
    }
    res.json({ message: `${reportType} report generated`, ...result });
  } catch (err) {
    logger.error('Manual report generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
