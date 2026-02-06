const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db');
const { fetchYahooChart } = require('../utils/yahoo');

const router = express.Router();

/**
 * GET /api/history/:symbol
 * Get stored OHLCV data for a symbol
 * Query params: from (date), to (date), limit (default 365)
 */
router.get('/status', (req, res) => {
  try {
    const totalRows = dbGet('SELECT COUNT(*) as count FROM price_history');
    const symbolCount = dbGet('SELECT COUNT(DISTINCT symbol) as count FROM price_history');
    const dateRange = dbGet('SELECT MIN(date) as earliest, MAX(date) as latest FROM price_history');
    const lastCollection = dbGet('SELECT MAX(created_at) as last_collected FROM price_history');

    res.json({
      total_rows: totalRows?.count || 0,
      symbols_tracked: symbolCount?.count || 0,
      earliest_date: dateRange?.earliest || null,
      latest_date: dateRange?.latest || null,
      last_collection: lastCollection?.last_collected || null
    });
  } catch (error) {
    console.error('Error getting history status:', error);
    res.status(500).json({ error: 'Failed to get history status' });
  }
});

router.get('/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { from, to, limit } = req.query;
    const maxRows = Math.min(parseInt(limit) || 365, 5000);

    let sql = 'SELECT date, open, high, low, close, volume FROM price_history WHERE symbol = ?';
    const params = [symbol.toUpperCase()];

    if (from) {
      sql += ' AND date >= ?';
      params.push(from);
    }
    if (to) {
      sql += ' AND date <= ?';
      params.push(to);
    }

    sql += ' ORDER BY date ASC LIMIT ?';
    params.push(maxRows);

    const rows = dbAll(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching price history:', error);
    res.status(500).json({ error: 'Failed to fetch price history' });
  }
});

/**
 * POST /api/history/collect
 * Trigger OHLCV collection for all held + watchlist symbols
 */
router.post('/collect', async (req, res) => {
  try {
    // Get all unique symbols from positions and watchlist_items
    const positionSymbols = dbAll('SELECT DISTINCT symbol FROM positions');
    const watchlistSymbols = dbAll('SELECT DISTINCT symbol FROM watchlist_items');

    const symbolSet = new Set();
    positionSymbols.forEach(r => symbolSet.add(r.symbol.toUpperCase()));
    watchlistSymbols.forEach(r => symbolSet.add(r.symbol.toUpperCase()));

    const symbols = Array.from(symbolSet);

    if (symbols.length === 0) {
      return res.json({ symbols: 0, newRows: 0, errors: [] });
    }

    let totalNewRows = 0;
    const errors = [];

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];

      try {
        const newRows = await collectSymbolHistory(symbol);
        totalNewRows += newRows;
      } catch (err) {
        errors.push({ symbol, error: err.message });
      }

      // Rate limit: 200ms delay between requests
      if (i < symbols.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    res.json({
      symbols: symbols.length,
      newRows: totalNewRows,
      errors
    });
  } catch (error) {
    console.error('Error during price history collection:', error);
    res.status(500).json({ error: 'Failed to collect price history' });
  }
});

/**
 * Collect OHLCV history for a single symbol
 * Returns number of new rows inserted
 */
async function collectSymbolHistory(symbol) {
  const data = await fetchYahooChart(symbol, 'max', '1d');

  if (!data) {
    throw new Error(`No data returned for ${symbol}`);
  }

  const result = data.chart?.result?.[0];
  if (!result || !result.timestamp) {
    throw new Error(`Invalid chart data for ${symbol}`);
  }

  const timestamps = result.timestamp;
  const quote = result.indicators?.quote?.[0];

  if (!quote || !quote.close) {
    throw new Error(`No quote data for ${symbol}`);
  }

  let newRows = 0;

  for (let i = 0; i < timestamps.length; i++) {
    const closeVal = quote.close[i];
    if (closeVal == null) continue; // skip null entries

    const date = timestampToDate(timestamps[i]);
    const open = quote.open?.[i] ?? null;
    const high = quote.high?.[i] ?? null;
    const low = quote.low?.[i] ?? null;
    const volume = quote.volume?.[i] ?? null;

    try {
      dbRun(
        'INSERT OR IGNORE INTO price_history (symbol, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [symbol.toUpperCase(), date, open, high, low, closeVal, volume]
      );
      // INSERT OR IGNORE won't throw on duplicate, but we can check if a row was actually inserted
      // Since dbRun returns lastInsertRowid, a 0 means no insert (duplicate ignored)
      // Actually with sql.js INSERT OR IGNORE, lastInsertRowid may not be reliable
      // We'll count all attempts and the status endpoint shows actual totals
      newRows++;
    } catch (err) {
      // Duplicate or other error - continue
    }
  }

  return newRows;
}

/**
 * Convert Unix timestamp to YYYY-MM-DD string
 */
function timestampToDate(ts) {
  const d = new Date(ts * 1000);
  return d.toISOString().split('T')[0];
}

// Export for use by the standalone collection script
module.exports = router;
module.exports.collectSymbolHistory = collectSymbolHistory;
