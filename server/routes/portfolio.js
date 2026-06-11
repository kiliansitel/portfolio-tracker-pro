const express = require('express');
const { dbRun, dbGet, dbAll, runTransaction } = require('../db');
const { createPortfolioValidation, positionValidation, idParamValidation } = require('../validators/portfolio');
const { strictLimiter } = require('../middleware/security');
const { autoAddToWatchlist } = require('../utils/watchlist-sync');
const { fetchYahooPrice, fetchQuoteInfo } = require('../utils/yahoo');
const { fetchExchangeRates, convertCurrency } = require('../utils/currency');

const router = express.Router();

// Get all portfolios
router.get('/', (req, res) => {
  const portfolios = dbAll('SELECT * FROM portfolios WHERE user_id = ? ORDER BY name', [req.user.id]);
  res.json(portfolios);
});

// Create portfolio
router.post('/', createPortfolioValidation, (req, res) => {
  const { name, cash } = req.body;
  
  const result = dbRun('INSERT INTO portfolios (user_id, name, cash) VALUES (?, ?, ?)', 
    [req.user.id, name, cash || 0]);
  
  res.json({ id: result.lastInsertRowid, user_id: req.user.id, name, cash: cash || 0 });
});

// Update portfolio
router.put('/:id', idParamValidation, (req, res) => {
  const { id } = req.params;
  const { name, cash, cash_currency } = req.body;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  dbRun('UPDATE portfolios SET name = ?, cash = ?, cash_currency = ? WHERE id = ?', 
    [name || portfolio.name, cash ?? portfolio.cash, cash_currency || portfolio.cash_currency || 'USD', id]);
  
  res.json({ message: 'Portfolio updated' });
});

// Duplicate portfolio
router.post('/:id/duplicate', idParamValidation, (req, res) => {
  const { id } = req.params;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  const newName = `Copy of ${portfolio.name}`;
  const result = dbRun('INSERT INTO portfolios (user_id, name, cash) VALUES (?, ?, ?)', 
    [req.user.id, newName, portfolio.cash || 0]);
  const newPortfolioId = result.lastInsertRowid;
  
  // Copy all positions from source
  const positions = dbAll('SELECT * FROM positions WHERE portfolio_id = ?', [id]);
  for (const pos of positions) {
    dbRun(
      `INSERT INTO positions (portfolio_id, symbol, quantity, entry_price, type, notes, source, location, multiplier, strike_price, expiry_date, currency) 
       VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?)`,
      [newPortfolioId, pos.symbol, pos.quantity, pos.entry_price, pos.type || 'stock', pos.notes, pos.location, pos.multiplier || 1, pos.strike_price, pos.expiry_date, pos.currency || 'USD']
    );
  }
  
  res.json({ id: newPortfolioId, user_id: req.user.id, name: newName, cash: portfolio.cash || 0 });
});

// Delete portfolio
router.delete('/:id', idParamValidation, (req, res) => {
  const { id } = req.params;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  dbRun('DELETE FROM positions WHERE portfolio_id = ?', [id]);
  dbRun('DELETE FROM portfolios WHERE id = ?', [id]);
  
  res.json({ message: 'Portfolio deleted' });
});

// Get positions for a portfolio
router.get('/:id/positions', (req, res) => {
  const { id } = req.params;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  const positions = dbAll('SELECT * FROM positions WHERE portfolio_id = ? ORDER BY symbol', [id]);
  res.json(positions);
});

// Add position
router.post('/:id/positions', positionValidation, async (req, res) => {
  try {
    const { id } = req.params;
    const { symbol, quantity, avg_cost, entry_price, location, name, type, entry_date, notes, strike_price, expiry_date, multiplier, current_price, currency, source, affects_cash } = req.body;

    const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const price = entry_price || avg_cost; // Support both field names

    if (!symbol || !quantity || !price) {
      return res.status(400).json({ error: 'Symbol, quantity, and price required' });
    }

    const sym = symbol.toUpperCase();
    const posSource = source || 'manual';
    // Default affects_cash: true for manual, false for wallet
    const shouldAffectCash = affects_cash !== undefined ? !!affects_cash : (posSource !== 'wallet');
    const mult = multiplier || 1;
    const fees = req.body.fees || 0;
    let cashImpact = 0;

    // Look up ANY existing position for this symbol, including a previously closed
    // one. UNIQUE(portfolio_id, symbol) covers closed rows too, so re-buying a closed
    // symbol must reopen the existing row rather than INSERT a duplicate — the old
    // code excluded closed rows and the duplicate INSERT threw, crashing the server.
    const existingPosition = dbGet('SELECT * FROM positions WHERE portfolio_id = ? AND symbol = ?', [id, sym]);
    const isReopen = existingPosition && existingPosition.status === 'closed';

    // Currency conversion needs an await, so compute cash impact before opening the txn.
    if (shouldAffectCash && price > 0) {
      const cost = quantity * price * mult + fees;
      const posCurrency = currency || existingPosition?.currency || 'USD';
      const cashCurrency = portfolio.cash_currency || 'USD';
      if (posCurrency !== cashCurrency) {
        const rates = await fetchExchangeRates();
        cashImpact = convertCurrency(cost, posCurrency, cashCurrency, rates);
      } else {
        cashImpact = cost;
      }
    }

    let positionId;
    runTransaction(() => {
      if (existingPosition && !isReopen) {
        // Add to an existing open position (weighted-average cost)
        const newQuantity = existingPosition.quantity + quantity;
        const newAvgCost = ((existingPosition.quantity * existingPosition.entry_price) + (quantity * price)) / newQuantity;

        const updateFields = ['quantity = ?', 'entry_price = ?', 'updated_at = CURRENT_TIMESTAMP'];
        const updateParams = [newQuantity, newAvgCost];
        if (location !== undefined) { updateFields.push('location = ?'); updateParams.push(location || null); }
        if (type) { updateFields.push('type = ?'); updateParams.push(type); }
        if (entry_date) { updateFields.push('entry_date = ?'); updateParams.push(entry_date); }
        if (notes !== undefined) { updateFields.push('notes = ?'); updateParams.push(notes || null); }
        if (currency) { updateFields.push('currency = ?'); updateParams.push(currency); }
        updateParams.push(existingPosition.id);
        dbRun(`UPDATE positions SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
        positionId = existingPosition.id;
      } else if (isReopen) {
        // Reopen a previously closed position as a fresh lot
        dbRun(
          `UPDATE positions SET quantity = ?, entry_price = ?, status = 'open', closed_at = NULL, close_price = NULL, realized_pnl = NULL,
             source = ?, location = ?, name = ?, type = ?, entry_date = ?, notes = ?, strike_price = ?, expiry_date = ?, multiplier = ?, current_price = ?, currency = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [quantity, price, posSource, location || null, name || null, type || 'stock', entry_date || null, notes || null, strike_price || null, expiry_date || null, mult, current_price || null, currency || existingPosition.currency || 'USD', existingPosition.id]
        );
        positionId = existingPosition.id;
      } else {
        // Create new position
        const result = dbRun(
          `INSERT INTO positions (portfolio_id, symbol, quantity, entry_price, source, location, name, type, entry_date, notes, strike_price, expiry_date, multiplier, current_price, currency, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
          [id, sym, quantity, price, posSource, location || null, name || null, type || 'stock', entry_date || null, notes || null, strike_price || null, expiry_date || null, mult, current_price || null, currency || 'USD']);
        positionId = result.lastInsertRowid;
      }

      // Cash impact + buy transaction (atomic with the position write)
      if (shouldAffectCash && price > 0 && cashImpact !== null) {
        dbRun('UPDATE portfolios SET cash = cash - ? WHERE id = ?', [cashImpact, id]);
        dbRun(
          'INSERT INTO transactions (portfolio_id, symbol, type, action, quantity, price, fees, executed_at, source, affects_cash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, sym, type || 'stock', 'buy', quantity, price, fees, entry_date || new Date().toISOString().split('T')[0], posSource, 1]
        );
      }
    });

    const savedPosition = dbGet('SELECT * FROM positions WHERE id = ?', [positionId]);
    const updatedPortfolio = dbGet('SELECT cash FROM portfolios WHERE id = ?', [id]);

    // Auto-add to watchlist regardless of new/existing
    autoAddToWatchlist(req.user.id, sym);

    res.json({ ...savedPosition, cash: updatedPortfolio.cash, cash_impact: cashImpact });
  } catch (err) {
    console.error('POST /:id/positions error:', err.message);
    res.status(500).json({ error: 'Failed to add position' });
  }
});

// Update position
router.put('/positions/:id', idParamValidation, async (req, res) => {
  try {
  const { id } = req.params;
  const { symbol, quantity, avg_cost, entry_price, location, name, type, entry_date, notes, strike_price, expiry_date, multiplier, current_price, currency } = req.body;
  
  const position = dbGet(`
    SELECT p.*, pf.id as pf_id FROM positions p 
    JOIN portfolios pf ON p.portfolio_id = pf.id 
    WHERE p.id = ? AND pf.user_id = ?
  `, [id, req.user.id]);
  
  if (!position) {
    return res.status(404).json({ error: 'Position not found' });
  }
  
  const price = entry_price || avg_cost || position.entry_price;
  const newQty = quantity ?? position.quantity;
  const newMult = multiplier || position.multiplier || 1;
  const posCurrency = currency || position.currency || 'USD';
  
  // Check if there's a cash-affecting buy transaction for this position
  const cashTx = dbGet(
    `SELECT * FROM transactions WHERE portfolio_id = ? AND symbol = ? AND action = 'buy' AND affects_cash = 1 ORDER BY id DESC LIMIT 1`,
    [position.portfolio_id, position.symbol]
  );
  
  let cashAdjustment = 0;
  if (cashTx && (newQty !== position.quantity || price !== position.entry_price)) {
    const oldCost = position.quantity * position.entry_price * (position.multiplier || 1) + (cashTx.fees || 0);
    const newCost = newQty * price * newMult + (cashTx.fees || 0);
    const costDiff = newCost - oldCost;
    
    const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ?', [position.portfolio_id]);
    const cashCurrency = portfolio.cash_currency || 'USD';
    
    if (posCurrency !== cashCurrency) {
      const rates = await fetchExchangeRates();
      cashAdjustment = convertCurrency(costDiff, posCurrency, cashCurrency, rates);
    } else {
      cashAdjustment = costDiff;
    }

    if (cashAdjustment !== null) {
      dbRun('UPDATE portfolios SET cash = cash - ? WHERE id = ?', [cashAdjustment, position.portfolio_id]);
    }
  }
  
  dbRun(`UPDATE positions SET symbol = ?, quantity = ?, entry_price = ?, location = ?, 
    name = ?, type = ?, entry_date = ?, notes = ?, strike_price = ?, expiry_date = ?, 
    multiplier = ?, current_price = ?, currency = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
    [
      symbol?.toUpperCase() || position.symbol, 
      newQty, 
      price, 
      location !== undefined ? (location || null) : position.location,
      name !== undefined ? (name || null) : position.name,
      type || position.type || 'stock',
      entry_date !== undefined ? (entry_date || null) : position.entry_date,
      notes !== undefined ? (notes || null) : position.notes,
      strike_price !== undefined ? (strike_price || null) : position.strike_price,
      expiry_date !== undefined ? (expiry_date || null) : position.expiry_date,
      newMult,
      current_price !== undefined ? (current_price || null) : position.current_price,
      posCurrency,
      id
    ]);
  
  const updatedPortfolio = dbGet('SELECT cash FROM portfolios WHERE id = ?', [position.portfolio_id]);
  res.json({ message: 'Position updated', cash: updatedPortfolio.cash, cash_adjustment: cashAdjustment });
  } catch (err) {
    console.error('PUT /positions/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update position', detail: err.message });
  }
});

// Delete position
router.delete('/positions/:id', idParamValidation, async (req, res) => {
  try {
  const { id } = req.params;
  
  const position = dbGet(`
    SELECT p.* FROM positions p 
    JOIN portfolios pf ON p.portfolio_id = pf.id 
    WHERE p.id = ? AND pf.user_id = ?
  `, [id, req.user.id]);
  
  if (!position) {
    return res.status(404).json({ error: 'Position not found' });
  }
  
  // Reverse the NET cash flow of this position's cash-affecting transactions. Buys
  // debited cash (reverse by adding it back); sells credited cash (reverse by removing
  // it). The old code only reversed buys, so deleting a position that had already been
  // (partially) closed re-credited the buy cost on top of the proceeds already
  // credited at close time — a double credit.
  const cashTxs = dbAll(
    `SELECT * FROM transactions WHERE portfolio_id = ? AND symbol = ? AND affects_cash = 1`,
    [position.portfolio_id, position.symbol]
  );

  let cashReversed = 0;
  if (cashTxs.length > 0) {
    let netCostInPosCurrency = 0;
    for (const tx of cashTxs) {
      const gross = tx.quantity * tx.price * (position.multiplier || 1);
      if (tx.action === 'sell') {
        netCostInPosCurrency -= (gross - (tx.fees || 0));
      } else {
        netCostInPosCurrency += gross + (tx.fees || 0);
      }
    }

    const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ?', [position.portfolio_id]);
    const cashCurrency = portfolio.cash_currency || 'USD';
    const posCurrency = position.currency || 'USD';

    if (posCurrency !== cashCurrency) {
      const rates = await fetchExchangeRates();
      cashReversed = convertCurrency(netCostInPosCurrency, posCurrency, cashCurrency, rates);
    } else {
      cashReversed = netCostInPosCurrency;
    }
  }

  runTransaction(() => {
    if (cashReversed !== null && cashReversed !== 0) {
      dbRun('UPDATE portfolios SET cash = cash + ? WHERE id = ?', [cashReversed, position.portfolio_id]);
    }
    dbRun('DELETE FROM transactions WHERE portfolio_id = ? AND symbol = ?', [position.portfolio_id, position.symbol]);
    dbRun('DELETE FROM positions WHERE id = ?', [id]);
  });

  const updatedPortfolio = dbGet('SELECT cash FROM portfolios WHERE id = ?', [position.portfolio_id]);
  res.json({ message: 'Position deleted', cash: updatedPortfolio.cash, cash_reversed: cashReversed });
  } catch (err) {
    console.error('DELETE /positions/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete position' });
  }
});

// Close position (full or partial)
router.post('/:id/positions/:posId/close', async (req, res) => {
  try {
  const { id, posId } = req.params;
  const { close_price, quantity: closeQty, fees = 0, date, affects_cash = true } = req.body;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  const position = dbGet('SELECT * FROM positions WHERE id = ? AND portfolio_id = ?', [posId, id]);
  if (!position) {
    return res.status(404).json({ error: 'Position not found' });
  }
  if (position.status === 'closed') {
    return res.status(400).json({ error: 'Position is already closed' });
  }
  
  if (!close_price && close_price !== 0) {
    return res.status(400).json({ error: 'close_price is required' });
  }
  
  const mult = position.multiplier || 1;

  // Validate close price and quantity — previously a NaN/string close_price stored
  // NaN realized P&L, and an out-of-range quantity (negative, or larger than the
  // position) produced phantom proceeds or even increased the position.
  const closePriceNum = Number(close_price);
  if (!Number.isFinite(closePriceNum) || closePriceNum < 0) {
    return res.status(400).json({ error: 'close_price must be a non-negative number' });
  }
  const quantityToClose = (closeQty === undefined || closeQty === null) ? position.quantity : Number(closeQty);
  if (!Number.isFinite(quantityToClose) || quantityToClose <= 0 || quantityToClose > position.quantity) {
    return res.status(400).json({ error: `quantity to close must be greater than 0 and at most ${position.quantity}` });
  }
  const isPartial = quantityToClose < position.quantity;
  const closeDate = date || new Date().toISOString().split('T')[0];

  // Calculate realized PnL
  const realizedPnl = (closePriceNum - position.entry_price) * quantityToClose * mult;

  // Currency conversion for cash impact (needs an await, so done before the txn)
  const posCurrency = position.currency || 'USD';
  const cashCurrency = portfolio.cash_currency || 'USD';
  let cashImpact = 0;
  let proceeds = 0;

  if (affects_cash) {
    proceeds = closePriceNum * quantityToClose * mult;
    const proceedsMinusFees = proceeds - fees;

    if (posCurrency !== cashCurrency) {
      const rates = await fetchExchangeRates();
      cashImpact = convertCurrency(proceedsMinusFees, posCurrency, cashCurrency, rates);
    } else {
      cashImpact = proceedsMinusFees;
    }
  }

  // Credit cash, update the position, and record the sell — atomically. The old code
  // credited cash first and then, on a partial close, INSERTed a duplicate
  // (portfolio_id, symbol) row which violated the UNIQUE constraint and threw: cash
  // stayed credited while nothing else applied, so repeating the call minted cash.
  runTransaction(() => {
    if (affects_cash && cashImpact !== null) {
      dbRun('UPDATE portfolios SET cash = cash + ? WHERE id = ?', [cashImpact, id]);
    }

    if (isPartial) {
      // Partial close: reduce the remaining quantity and accumulate realized P&L on
      // the same row. We cannot insert a second closed row for the same symbol
      // (UNIQUE constraint); the sell transaction below is the per-lot record.
      const remainingQty = position.quantity - quantityToClose;
      dbRun(
        `UPDATE positions SET quantity = ?, realized_pnl = COALESCE(realized_pnl, 0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [remainingQty, realizedPnl, posId]
      );
    } else {
      // Full close
      dbRun(
        `UPDATE positions SET status = 'closed', closed_at = ?, close_price = ?, realized_pnl = COALESCE(realized_pnl, 0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [closeDate, closePriceNum, realizedPnl, posId]
      );
    }

    // Create sell transaction
    dbRun(
      'INSERT INTO transactions (portfolio_id, symbol, type, action, quantity, price, fees, executed_at, source, affects_cash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, position.symbol, position.type || 'stock', 'sell', quantityToClose, closePriceNum, fees, closeDate, position.source || 'manual', affects_cash ? 1 : 0]
    );
  });

  const updatedPosition = dbGet('SELECT * FROM positions WHERE id = ?', [posId]);
  const updatedPortfolio = dbGet('SELECT cash FROM portfolios WHERE id = ?', [id]);
  
  res.json({
    position: updatedPosition,
    close_summary: {
      quantity_closed: quantityToClose,
      close_price,
      realized_pnl: realizedPnl,
      fees,
      is_partial: isPartial,
      remaining_quantity: isPartial ? position.quantity - quantityToClose : 0
    },
    cash_impact: {
      affects_cash: !!affects_cash,
      proceeds_in_position_currency: proceeds,
      cash_impact_in_cash_currency: cashImpact,
      new_cash_balance: updatedPortfolio.cash
    }
  });
  } catch (err) {
    console.error('POST /positions/:posId/close error:', err.message);
    res.status(500).json({ error: 'Failed to close position', detail: err.message });
  }
});

// Get dividend data for all positions in a portfolio
router.get('/:id/dividends', async (req, res) => {
  const { id } = req.params;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  const positions = dbAll('SELECT * FROM positions WHERE portfolio_id = ? AND type != ? ORDER BY symbol', [id, 'option']);

  // Fetch prices (which include dividend data) for all unique symbols
  const symbols = [...new Set(positions.map(p => p.symbol))];
  const priceData = {};
  
  // Fetch in parallel batches
  const batchSize = 10;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(s => fetchYahooPrice(s)));
    batch.forEach((sym, idx) => {
      if (results[idx]) priceData[sym] = results[idx];
    });
  }
  
  // Build dividend info per position
  const dividendPositions = [];
  let totalAnnualIncome = 0;
  let totalYieldWeighted = 0;
  let totalValue = 0;
  
  for (const pos of positions) {
    if (pos.type === 'option') continue;
    const data = priceData[pos.symbol];
    if (!data) continue;
    
    const divRate = data.dividendRate || data.trailingAnnualDividendRate || 0;
    // dividendYield from Yahoo is in percent form (e.g. 0.38 = 0.38%), normalise to decimal
    const divYield = data.dividendYield
      ? data.dividendYield / 100
      : (data.trailingAnnualDividendYield || 0);
    const exTs = data.exDividendDate || data.dividendDate;
    const exDate = exTs ? new Date(exTs * 1000).toISOString().split('T')[0] : null;
    const annualIncome = divRate * pos.quantity;
    const posValue = (data.price || pos.entry_price) * pos.quantity;
    
    if (divRate > 0) {
      // Guess frequency from rate vs trailing
      let frequency = 'quarterly'; // default assumption
      if (data.dividendRate && data.trailingAnnualDividendRate) {
        const ratio = data.trailingAnnualDividendRate / data.dividendRate;
        if (ratio > 10) frequency = 'monthly';
        else if (ratio > 3) frequency = 'quarterly';
        else if (ratio > 1.5) frequency = 'semi-annual';
        else frequency = 'annual';
      }
      
      dividendPositions.push({
        symbol: pos.symbol,
        quantity: pos.quantity,
        price: data.price,
        dividendRate: divRate,
        dividendYield: divYield,
        exDividendDate: exDate,
        annualIncome,
        frequency,
        type: pos.type
      });
      
      totalAnnualIncome += annualIncome;
      totalYieldWeighted += divYield * posValue;
      totalValue += posValue;
    }
  }
  
  // Sort by next ex-dividend date (soonest first, nulls last)
  dividendPositions.sort((a, b) => {
    if (!a.exDividendDate && !b.exDividendDate) return 0;
    if (!a.exDividendDate) return 1;
    if (!b.exDividendDate) return -1;
    return a.exDividendDate.localeCompare(b.exDividendDate);
  });
  
  const avgYield = totalValue > 0 ? totalYieldWeighted / totalValue : 0;
  const nextExDate = dividendPositions.find(p => p.exDividendDate)?.exDividendDate || null;
  
  // Build monthly income calendar (estimate based on frequency)
  const monthlyIncome = Array(12).fill(0);
  for (const pos of dividendPositions) {
    const perPayment = pos.frequency === 'monthly' ? pos.annualIncome / 12 :
                        pos.frequency === 'quarterly' ? pos.annualIncome / 4 :
                        pos.frequency === 'semi-annual' ? pos.annualIncome / 2 :
                        pos.annualIncome;
    
    if (pos.frequency === 'monthly') {
      for (let m = 0; m < 12; m++) monthlyIncome[m] += perPayment;
    } else if (pos.frequency === 'quarterly') {
      // Estimate quarters based on ex-date month or default to Mar/Jun/Sep/Dec
      const baseMonth = pos.exDividendDate ? new Date(pos.exDividendDate).getMonth() : 2;
      for (let i = 0; i < 4; i++) monthlyIncome[(baseMonth + i * 3) % 12] += perPayment;
    } else if (pos.frequency === 'semi-annual') {
      const baseMonth = pos.exDividendDate ? new Date(pos.exDividendDate).getMonth() : 5;
      monthlyIncome[baseMonth] += perPayment;
      monthlyIncome[(baseMonth + 6) % 12] += perPayment;
    } else {
      const baseMonth = pos.exDividendDate ? new Date(pos.exDividendDate).getMonth() : 11;
      monthlyIncome[baseMonth] += pos.annualIncome;
    }
  }
  
  res.json({
    positions: dividendPositions,
    summary: {
      totalAnnualIncome,
      averageYield: avgYield,
      nextExDate,
      positionsWithDividends: dividendPositions.length,
      totalPositions: positions.filter(p => p.type !== 'option').length
    },
    monthlyIncome
  });
});

// Country to region mapping
const COUNTRY_REGION_MAP = {
  // North America
  'United States': 'North America', 'Canada': 'North America', 'Mexico': 'North America',
  // Europe
  'United Kingdom': 'Europe', 'Germany': 'Europe', 'France': 'Europe', 'Netherlands': 'Europe',
  'Switzerland': 'Europe', 'Ireland': 'Europe', 'Sweden': 'Europe', 'Denmark': 'Europe',
  'Norway': 'Europe', 'Finland': 'Europe', 'Spain': 'Europe', 'Italy': 'Europe',
  'Belgium': 'Europe', 'Austria': 'Europe', 'Portugal': 'Europe', 'Luxembourg': 'Europe',
  'Poland': 'Europe', 'Czech Republic': 'Europe', 'Greece': 'Europe',
  // Asia
  'Japan': 'Asia', 'China': 'Asia', 'South Korea': 'Asia', 'Taiwan': 'Asia',
  'Hong Kong': 'Asia', 'India': 'Asia', 'Singapore': 'Asia', 'Indonesia': 'Asia',
  'Thailand': 'Asia', 'Malaysia': 'Asia', 'Philippines': 'Asia', 'Vietnam': 'Asia',
  // Oceania
  'Australia': 'Oceania', 'New Zealand': 'Oceania',
  // Latin America
  'Brazil': 'Latin America', 'Argentina': 'Latin America', 'Chile': 'Latin America', 'Colombia': 'Latin America',
  // Middle East & Africa
  'Israel': 'Middle East & Africa', 'Saudi Arabia': 'Middle East & Africa', 'South Africa': 'Middle East & Africa',
  'United Arab Emirates': 'Middle East & Africa',
};

function mapExchangeToCountry(exchange, market) {
  // Fallback: derive country from exchange
  const exchangeMap = {
    'NMS': 'United States', 'NYQ': 'United States', 'NGM': 'United States', 'PCX': 'United States',
    'ASE': 'United States', 'BTS': 'United States', 'NCM': 'United States',
    'LSE': 'United Kingdom', 'GER': 'Germany', 'FRA': 'Germany',
    'PAR': 'France', 'AMS': 'Netherlands', 'SWX': 'Switzerland',
    'TYO': 'Japan', 'HKG': 'Hong Kong', 'KSC': 'South Korea', 'KOE': 'South Korea',
    'TAI': 'Taiwan', 'NSI': 'India', 'BSE': 'India',
    'ASX': 'Australia', 'TSE': 'Canada', 'SAO': 'Brazil',
  };
  return exchangeMap[exchange] || null;
}

// Get sector/geographic exposure for a portfolio
router.get('/:id/exposure', async (req, res) => {
  const { id } = req.params;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  const positions = dbAll('SELECT * FROM positions WHERE portfolio_id = ? ORDER BY symbol', [id]);
  
  // Fetch prices and quote info for all symbols
  const symbols = [...new Set(positions.filter(p => p.type !== 'option').map(p => p.symbol))];
  const priceData = {};
  const quoteData = {};
  
  const batchSize = 10;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const [priceResults, quoteResults] = await Promise.all([
      Promise.all(batch.map(s => fetchYahooPrice(s))),
      Promise.all(batch.map(s => fetchQuoteInfo(s)))
    ]);
    batch.forEach((sym, idx) => {
      if (priceResults[idx]) priceData[sym] = priceResults[idx];
      if (quoteResults[idx]) quoteData[sym] = quoteResults[idx];
    });
  }
  
  // Aggregate
  const bySector = {};
  const byRegion = {};
  const byIndustry = {};
  
  for (const pos of positions) {
    if (pos.type === 'option') continue;
    
    const price = priceData[pos.symbol]?.price || pos.entry_price;
    const mult = pos.multiplier || 1;
    const value = price * pos.quantity * mult;
    if (value <= 0) continue;
    
    const info = quoteData[pos.symbol];
    const isCrypto = info?.quoteType === 'CRYPTOCURRENCY' || pos.type === 'crypto';
    
    // Sector
    const sector = isCrypto ? 'Crypto' : (info?.sector || 'Unknown');
    if (!bySector[sector]) bySector[sector] = { sector, totalValue: 0, positions: [] };
    bySector[sector].totalValue += value;
    bySector[sector].positions.push({ symbol: pos.symbol, value });
    
    // Industry
    const industry = isCrypto ? 'Digital Assets' : (info?.industry || 'Unknown');
    if (!byIndustry[industry]) byIndustry[industry] = { industry, totalValue: 0, positions: [] };
    byIndustry[industry].totalValue += value;
    byIndustry[industry].positions.push({ symbol: pos.symbol, value });
    
    // Region
    let region;
    if (isCrypto) {
      region = 'Crypto/Digital';
    } else {
      const country = mapExchangeToCountry(info?.exchange, info?.market);
      region = country ? (COUNTRY_REGION_MAP[country] || 'Other') : 'Unknown';
    }
    if (!byRegion[region]) byRegion[region] = { region, totalValue: 0, positions: [] };
    byRegion[region].totalValue += value;
    byRegion[region].positions.push({ symbol: pos.symbol, value });
  }
  
  // Convert to arrays with percentages
  const totalValue = Object.values(bySector).reduce((s, v) => s + v.totalValue, 0);
  
  const toArray = (obj, key) => Object.values(obj)
    .map(v => ({ ...v, percentage: totalValue > 0 ? (v.totalValue / totalValue) * 100 : 0 }))
    .sort((a, b) => b.totalValue - a.totalValue);
  
  res.json({
    bySector: toArray(bySector),
    byRegion: toArray(byRegion),
    byIndustry: toArray(byIndustry),
    totalValue
  });
});

module.exports = router;