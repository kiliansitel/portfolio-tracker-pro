const express = require('express');
const { getDb, replaceDb } = require('../db');
const { logger } = require('../utils/logger');

const router = express.Router();

// Download full database backup
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const data = db.export();
    const buffer = Buffer.from(data);

    const date = new Date().toISOString().split('T')[0];
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="portfolio-backup-${date}.db"`);
    res.set('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    logger.error('Backup export error:', error);
    res.status(500).json({ error: 'Failed to export database backup' });
  }
});

// Restore database from uploaded backup
router.post('/restore', express.raw({ type: 'application/octet-stream', limit: '100mb' }), (req, res) => {
  try {
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: 'No file data received' });
    }

    const uint8Array = new Uint8Array(req.body);
    const tableNames = replaceDb(uint8Array);

    logger.info(`Database restored by user ${req.user.id}. Tables: ${tableNames.join(', ')}`);
    res.json({ 
      message: 'Database restored successfully', 
      tables: tableNames 
    });
  } catch (error) {
    logger.error('Backup restore error:', error);
    if (error.message && error.message.includes('Invalid backup')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to restore database. The file may not be a valid SQLite database.' });
  }
});

module.exports = router;
