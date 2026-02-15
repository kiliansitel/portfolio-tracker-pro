/**
 * Daily portfolio snapshot collection
 * Calculates current portfolio value and stores a snapshot
 */

const { dbRun, dbGet, dbAll } = require('../db');
const { fetchYahooPrice } = require('./yahoo');
const { fetchExchangeRates, convertCurrency } = require('./currency');

/**
 * Collect a daily snapshot for a portfolio
 * @param {number} portfolioId
 * @returns {object} snapshot data
 */
async function collectDailySnapshot(portfolioId) {
  // Get portfolio
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ?', [portfolioId]);
  if (!portfolio) {
    throw new Error(`Portfolio ${portfolioId} not found`);
  }

  // Get all positions
  const positions = dbAll('SELECT * FROM positions WHERE portfolio_id = ?', [portfolioId]);

  // Fetch current prices and calculate positions value
  let positionsValue = 0;
  const priceResults = [];
  let pricedPositions = 0; // Track how many positions got a real price

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const mult = pos.multiplier || 1;

    try {
      const priceData = await fetchYahooPrice(pos.symbol);
      const price = priceData?.price || (pos.entry_price > 0 ? pos.entry_price : 0);
      const value = pos.quantity * price * mult;
      positionsValue += value;
      if (priceData?.price) pricedPositions++;

      priceResults.push({
        symbol: pos.symbol,
        quantity: pos.quantity,
        price,
        multiplier: mult,
        value
      });
    } catch (err) {
      // Fallback to entry price (skip if $0 — wallet-synced with no cost basis)
      const fallbackPrice = pos.entry_price > 0 ? pos.entry_price : 0;
      const value = pos.quantity * fallbackPrice * mult;
      positionsValue += value;
      priceResults.push({
        symbol: pos.symbol,
        quantity: pos.quantity,
        price: fallbackPrice,
        multiplier: mult,
        value,
        error: err.message,
        noCostBasis: pos.entry_price <= 0
      });
    }

    // Rate limit between price fetches
    if (i < positions.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // Convert cash from its stored currency to USD for snapshot consistency
  const rawCash = portfolio.cash || 0;
  const cashCurrency = portfolio.cash_currency || 'USD';
  let cash = rawCash;
  if (cashCurrency !== 'USD' && rawCash > 0) {
    try {
      const rates = await fetchExchangeRates();
      cash = convertCurrency(rawCash, cashCurrency, 'USD', rates);
    } catch (e) {
      console.warn(`Failed to convert cash from ${cashCurrency} to USD, using raw value`);
    }
  }
  const totalValue = cash + positionsValue;
  const today = new Date().toISOString().split('T')[0];

  // Guard: if we have positions but couldn't price ANY of them, skip snapshot
  // to avoid storing cash-only values that misrepresent portfolio worth
  if (positions.length > 0 && pricedPositions === 0 && positionsValue === 0) {
    console.warn(`Skipping snapshot for portfolio ${portfolioId}: ${positions.length} positions but no prices obtained`);
    return {
      portfolio_id: portfolioId,
      portfolio_name: portfolio.name,
      date: today,
      total_value: totalValue,
      cash,
      positions_value: positionsValue,
      skipped: true,
      reason: 'No prices obtained for any position',
      positions: priceResults
    };
  }

  // Get previous snapshot for daily change calculation
  const prevSnapshot = dbGet(
    'SELECT total_value FROM portfolio_snapshots WHERE portfolio_id = ? AND date < ? ORDER BY date DESC LIMIT 1',
    [portfolioId, today]
  );

  const dailyChange = prevSnapshot ? totalValue - prevSnapshot.total_value : 0;
  const dailyChangePct = prevSnapshot && prevSnapshot.total_value > 0
    ? ((totalValue - prevSnapshot.total_value) / prevSnapshot.total_value) * 100
    : 0;

  // Upsert snapshot for today
  const existing = dbGet(
    'SELECT id FROM portfolio_snapshots WHERE portfolio_id = ? AND date = ?',
    [portfolioId, today]
  );

  if (existing) {
    dbRun(
      'UPDATE portfolio_snapshots SET total_value = ?, cash = ?, positions_value = ?, daily_change = ?, daily_change_pct = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?',
      [totalValue, cash, positionsValue, dailyChange, dailyChangePct, existing.id]
    );
  } else {
    dbRun(
      'INSERT INTO portfolio_snapshots (portfolio_id, date, total_value, cash, positions_value, daily_change, daily_change_pct) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [portfolioId, today, totalValue, cash, positionsValue, dailyChange, dailyChangePct]
    );
  }

  return {
    portfolio_id: portfolioId,
    portfolio_name: portfolio.name,
    date: today,
    total_value: totalValue,
    cash,
    positions_value: positionsValue,
    daily_change: dailyChange,
    daily_change_pct: dailyChangePct,
    positions: priceResults
  };
}

module.exports = { collectDailySnapshot };
