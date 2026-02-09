/**
 * Auto-add symbols to the user's default watchlist when positions are created.
 */
const { dbRun, dbGet } = require('../db');
const { logger } = require('./logger');

function autoAddToWatchlist(userId, symbol, name) {
  try {
    const watchlist = dbGet('SELECT id FROM watchlists WHERE user_id = ? ORDER BY id LIMIT 1', [userId]);
    if (!watchlist) return;

    const existing = dbGet('SELECT id FROM watchlist_items WHERE watchlist_id = ? AND symbol = ?', [watchlist.id, symbol]);
    if (existing) return;

    dbRun(
      'INSERT INTO watchlist_items (watchlist_id, symbol, name, category) VALUES (?, ?, ?, ?)',
      [watchlist.id, symbol, name || symbol, 'general']
    );
    logger.info(`Auto-added ${symbol} to watchlist ${watchlist.id} for user ${userId}`);
  } catch (e) {
    logger.error(`Auto-add to watchlist failed for ${symbol}:`, e.message);
  }
}

module.exports = { autoAddToWatchlist };
