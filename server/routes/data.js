const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db');
const { fetchYahooPrice, fetchHistoricalPrice } = require('../utils/yahoo');
const { collectDailySnapshot } = require('../utils/snapshots');

const router = express.Router();

// Record a portfolio snapshot
router.post('/portfolios/:id/snapshot', (req, res) => {
  const { id } = req.params;
  const { total_value, cash, positions_value } = req.body;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  const today = new Date().toISOString().split('T')[0];

  // Validate: positions_value should be > 0 if portfolio has positions
  // This prevents saving cash-only snapshots when prices haven't loaded yet
  const positionCount = dbGet('SELECT COUNT(*) as cnt FROM positions WHERE portfolio_id = ?', [id]);
  if (positionCount && positionCount.cnt > 0 && (!positions_value || positions_value <= 0)) {
    return res.status(400).json({ error: 'Snapshot rejected: portfolio has positions but positions_value is 0 (prices not loaded?)' });
  }

  // Get yesterday's snapshot for daily change calculation
  const yesterday = dbGet(
    'SELECT total_value FROM portfolio_snapshots WHERE portfolio_id = ? AND date < ? ORDER BY date DESC LIMIT 1',
    [id, today]
  );
  
  const dailyChange = yesterday ? total_value - yesterday.total_value : 0;
  const dailyChangePct = yesterday && yesterday.total_value > 0 
    ? ((total_value - yesterday.total_value) / yesterday.total_value) * 100 
    : 0;
  
  // Upsert snapshot (update if exists for today)
  const existing = dbGet('SELECT id FROM portfolio_snapshots WHERE portfolio_id = ? AND date = ?', [id, today]);
  
  if (existing) {
    dbRun(
      'UPDATE portfolio_snapshots SET total_value = ?, cash = ?, positions_value = ?, daily_change = ?, daily_change_pct = ? WHERE id = ?',
      [total_value, cash, positions_value, dailyChange, dailyChangePct, existing.id]
    );
  } else {
    dbRun(
      'INSERT INTO portfolio_snapshots (portfolio_id, date, total_value, cash, positions_value, daily_change, daily_change_pct) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, today, total_value, cash, positions_value, dailyChange, dailyChangePct]
    );
  }
  
  res.json({ message: 'Snapshot recorded', date: today, total_value, daily_change: dailyChange });
});

// Get portfolio performance history
router.get('/portfolios/:id/performance', (req, res) => {
  const { id } = req.params;
  const { days } = req.query;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  let sql = 'SELECT * FROM portfolio_snapshots WHERE portfolio_id = ? ORDER BY date ASC';
  const params = [id];
  
  if (days) {
    sql = 'SELECT * FROM portfolio_snapshots WHERE portfolio_id = ? AND date >= date(?, ?) ORDER BY date ASC';
    params.push('now', `-${parseInt(days)} days`);
  }
  
  const snapshots = dbAll(sql, params);
  
  // Use first and last snapshots for summary (matches what the chart shows)
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const startValue = first?.total_value || 0;
  const currentValue = last?.total_value || 0;
  
  const totalReturn = currentValue - startValue;
  const totalReturnPct = startValue > 0 
    ? ((currentValue - startValue) / startValue) * 100 
    : 0;
  
  res.json({
    snapshots: snapshots,
    summary: {
      total_return: totalReturn,
      total_return_pct: totalReturnPct,
      start_value: startValue,
      current_value: currentValue,
      days: snapshots.length
    }
  });
});

// Reconstruct historical portfolio value from transactions
router.post('/portfolios/:id/reconstruct', async (req, res) => {
  const { id } = req.params;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  // Get all transactions ordered by date
  const transactions = dbAll(
    'SELECT * FROM transactions WHERE portfolio_id = ? ORDER BY executed_at ASC',
    [id]
  );
  
  // Get current positions as fallback
  const currentPositions = dbAll(
    'SELECT * FROM positions WHERE portfolio_id = ?',
    [id]
  );
  
  if (transactions.length === 0 && currentPositions.length === 0) {
    return res.json({ message: 'No transactions or positions to reconstruct from', snapshots: 0 });
  }
  
  // If no transactions but have positions, create snapshots from position dates
  if (transactions.length === 0) {
    const positionDates = new Set();
    const today = new Date().toISOString().split('T')[0];
    
    for (const pos of currentPositions) {
      const date = pos.created_at?.split('T')[0] || today;
      positionDates.add(date);
    }
    
    // Always add today
    positionDates.add(today);
    
    // If only one date (today), add yesterday as a baseline
    if (positionDates.size === 1) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      positionDates.add(yesterday.toISOString().split('T')[0]);
    }
    
    const sortedDates = Array.from(positionDates).sort();
    let snapshotsCreated = 0;
    const cash = portfolio.cash || 0;
    
    for (const date of sortedDates) {
      let positionsValue = 0;
      const today = new Date().toISOString().split('T')[0];
      
      for (const pos of currentPositions) {
        const posDate = pos.created_at?.split('T')[0] || today;
        // Only include positions that existed by this date
        if (posDate <= date) {
          let price;
          const mult = pos.multiplier || 1;
          
          if (date === today) {
            const current = await fetchYahooPrice(pos.symbol);
            price = current?.price || pos.entry_price;
          } else {
            price = await fetchHistoricalPrice(pos.symbol, date);
            if (!price) price = pos.entry_price;
          }
          
          positionsValue += pos.quantity * price * mult;
        }
      }
      
      const totalValue = cash + positionsValue;
      
      // Check if snapshot exists
      const existing = dbGet('SELECT id FROM portfolio_snapshots WHERE portfolio_id = ? AND date = ?', [id, date]);
      
      // Only create snapshot if we actually priced some positions (positionsValue > 0)
      // This prevents creating cash-only snapshots when price fetches fail
      if (!existing && totalValue > 0 && positionsValue > 0) {
        const prev = dbGet(
          'SELECT total_value FROM portfolio_snapshots WHERE portfolio_id = ? AND date < ? ORDER BY date DESC LIMIT 1',
          [id, date]
        );
        
        const dailyChange = prev ? totalValue - prev.total_value : 0;
        const dailyChangePct = prev && prev.total_value > 0 
          ? ((totalValue - prev.total_value) / prev.total_value) * 100 
          : 0;
        
        dbRun(
          'INSERT INTO portfolio_snapshots (portfolio_id, date, total_value, cash, positions_value, daily_change, daily_change_pct) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, date, totalValue, cash, positionsValue, dailyChange, dailyChangePct]
        );
        snapshotsCreated++;
      }
    }
    
    return res.json({ message: `Reconstructed ${snapshotsCreated} snapshots from positions`, snapshots: snapshotsCreated });
  }
  
  // Full transaction-based reconstruction
  const positions = {};
  let cash = portfolio.cash || 0;
  
  // Group transactions by date
  const txByDate = {};
  transactions.forEach(tx => {
    const date = tx.executed_at?.split('T')[0] || tx.executed_at;
    if (!txByDate[date]) txByDate[date] = [];
    txByDate[date].push(tx);
  });
  
  // Get unique dates and create weekly samples
  const dates = Object.keys(txByDate).sort();
  const startDate = new Date(dates[0]);
  const endDate = new Date();
  const sampleDates = new Set(dates);
  
  // Add weekly samples
  let current = new Date(startDate);
  while (current <= endDate) {
    sampleDates.add(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 7);
  }
  // Add today
  sampleDates.add(endDate.toISOString().split('T')[0]);
  
  const sortedDates = Array.from(sampleDates).sort();
  let snapshotsCreated = 0;
  
  for (const date of sortedDates) {
    // Apply all transactions up to this date
    for (const d of dates) {
      if (d > date) break;
      if (!txByDate[d]) continue;
      
      for (const tx of txByDate[d]) {
        const sym = tx.symbol;
        if (!positions[sym]) positions[sym] = { quantity: 0, totalCost: 0 };
        
        if (tx.type === 'buy') {
          positions[sym].quantity += tx.quantity;
          positions[sym].totalCost += tx.quantity * tx.price;
        } else if (tx.type === 'sell') {
          positions[sym].quantity -= tx.quantity;
          if (positions[sym].quantity <= 0) {
            positions[sym] = { quantity: 0, totalCost: 0 };
          }
        }
      }
      delete txByDate[d];
    }
    
    // Calculate portfolio value
    let positionsValue = 0;
    const symbols = Object.keys(positions).filter(s => positions[s].quantity > 0);
    
    for (const sym of symbols) {
      const pos = positions[sym];
      let price;
      
      if (date === endDate.toISOString().split('T')[0]) {
        const current = await fetchYahooPrice(sym);
        price = current?.price;
      } else {
        price = await fetchHistoricalPrice(sym, date);
      }
      
      if (price) {
        positionsValue += pos.quantity * price;
      } else {
        positionsValue += pos.quantity * (pos.totalCost / pos.quantity);
      }
    }
    
    const totalValue = cash + positionsValue;
    
    const existing = dbGet('SELECT id FROM portfolio_snapshots WHERE portfolio_id = ? AND date = ?', [id, date]);
    
    // Require positionsValue > 0 when there are active positions to avoid cash-only snapshots
    if (!existing && totalValue > 0 && (symbols.length === 0 || positionsValue > 0)) {
      const prev = dbGet(
        'SELECT total_value FROM portfolio_snapshots WHERE portfolio_id = ? AND date < ? ORDER BY date DESC LIMIT 1',
        [id, date]
      );
      
      const dailyChange = prev ? totalValue - prev.total_value : 0;
      const dailyChangePct = prev && prev.total_value > 0 
        ? ((totalValue - prev.total_value) / prev.total_value) * 100 
        : 0;
      
      dbRun(
        'INSERT INTO portfolio_snapshots (portfolio_id, date, total_value, cash, positions_value, daily_change, daily_change_pct) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, date, totalValue, cash, positionsValue, dailyChange, dailyChangePct]
      );
      snapshotsCreated++;
    }
  }
  
  res.json({ message: `Reconstructed ${snapshotsCreated} snapshots`, snapshots: snapshotsCreated });
});

// Automatic daily snapshot collection (for cron/scripts)
router.post('/portfolios/:id/snapshot/auto', async (req, res) => {
  const { id } = req.params;

  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }

  try {
    const snapshot = await collectDailySnapshot(parseInt(id));
    res.json({ message: 'Snapshot collected', snapshot });
  } catch (error) {
    console.error('Error collecting auto snapshot:', error);
    res.status(500).json({ error: 'Failed to collect snapshot', details: error.message });
  }
});

module.exports = router;