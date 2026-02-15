const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db');
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
  
  const posSource = source || 'manual';
  // Default affects_cash: true for manual, false for wallet
  const shouldAffectCash = affects_cash !== undefined ? !!affects_cash : (posSource !== 'wallet');
  const mult = multiplier || 1;
  const fees = req.body.fees || 0;
  let cashImpact = 0;
  
  // Check if position already exists
  const existingPosition = dbGet('SELECT * FROM positions WHERE portfolio_id = ? AND symbol = ? AND status != ?', [id, symbol.toUpperCase(), 'closed']);
  
  if (existingPosition) {
    // Update existing position
    const newQuantity = existingPosition.quantity + quantity;
    const newAvgCost = ((existingPosition.quantity * existingPosition.entry_price) + (quantity * price)) / newQuantity;
    
    const updateFields = ['quantity = ?', 'entry_price = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const updateParams = [newQuantity, newAvgCost];
    if (location !== undefined) {
      updateFields.push('location = ?');
      updateParams.push(location || null);
    }
    if (type) { updateFields.push('type = ?'); updateParams.push(type); }
    if (entry_date) { updateFields.push('entry_date = ?'); updateParams.push(entry_date); }
    if (notes !== undefined) { updateFields.push('notes = ?'); updateParams.push(notes || null); }
    if (currency) { updateFields.push('currency = ?'); updateParams.push(currency); }
    updateParams.push(existingPosition.id);
    
    dbRun(`UPDATE positions SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
    
    // Cash impact for the added quantity
    if (shouldAffectCash && price > 0) {
      const cost = quantity * price * mult + fees;
      const posCurrency = currency || existingPosition.currency || 'USD';
      const cashCurrency = portfolio.cash_currency || 'USD';
      
      if (posCurrency !== cashCurrency) {
        const rates = await fetchExchangeRates();
        cashImpact = convertCurrency(cost, posCurrency, cashCurrency, rates);
      } else {
        cashImpact = cost;
      }
      
      dbRun('UPDATE portfolios SET cash = cash - ? WHERE id = ?', [cashImpact, id]);
      
      // Create buy transaction
      dbRun(
        'INSERT INTO transactions (portfolio_id, symbol, type, action, quantity, price, fees, executed_at, source, affects_cash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, symbol.toUpperCase(), type || 'stock', 'buy', quantity, price, fees, entry_date || new Date().toISOString().split('T')[0], posSource, 1]
      );
    }
    
    const updated = dbGet('SELECT * FROM positions WHERE id = ?', [existingPosition.id]);
    const updatedPortfolio = dbGet('SELECT cash FROM portfolios WHERE id = ?', [id]);
    res.json({ ...updated, cash: updatedPortfolio.cash, cash_impact: cashImpact });
  } else {
    // Create new position
    const result = dbRun(
      `INSERT INTO positions (portfolio_id, symbol, quantity, entry_price, source, location, name, type, entry_date, notes, strike_price, expiry_date, multiplier, current_price, currency, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`, 
      [id, symbol.toUpperCase(), quantity, price, posSource, location || null, name || null, type || 'stock', entry_date || null, notes || null, strike_price || null, expiry_date || null, mult, current_price || null, currency || 'USD']);
    
    // Cash impact
    if (shouldAffectCash && price > 0) {
      const cost = quantity * price * mult + fees;
      const posCurrency = currency || 'USD';
      const cashCurrency = portfolio.cash_currency || 'USD';
      
      if (posCurrency !== cashCurrency) {
        const rates = await fetchExchangeRates();
        cashImpact = convertCurrency(cost, posCurrency, cashCurrency, rates);
      } else {
        cashImpact = cost;
      }
      
      dbRun('UPDATE portfolios SET cash = cash - ? WHERE id = ?', [cashImpact, id]);
      
      // Create buy transaction
      dbRun(
        'INSERT INTO transactions (portfolio_id, symbol, type, action, quantity, price, fees, executed_at, source, affects_cash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, symbol.toUpperCase(), type || 'stock', 'buy', quantity, price, fees, entry_date || new Date().toISOString().split('T')[0], posSource, 1]
      );
    }
    
    const newPosition = dbGet('SELECT * FROM positions WHERE id = ?', [result.lastInsertRowid]);
    const updatedPortfolio = dbGet('SELECT cash FROM portfolios WHERE id = ?', [id]);
    res.json({ ...newPosition, cash: updatedPortfolio.cash, cash_impact: cashImpact });
  }

  // Auto-add to watchlist regardless of new/existing
  autoAddToWatchlist(req.user.id, symbol.toUpperCase());
});

// Update position
router.put('/positions/:id', idParamValidation, async (req, res) => {
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
    
    dbRun('UPDATE portfolios SET cash = cash - ? WHERE id = ?', [cashAdjustment, position.portfolio_id]);
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
});

// Delete position
router.delete('/positions/:id', idParamValidation, async (req, res) => {
  const { id } = req.params;
  
  const position = dbGet(`
    SELECT p.* FROM positions p 
    JOIN portfolios pf ON p.portfolio_id = pf.id 
    WHERE p.id = ? AND pf.user_id = ?
  `, [id, req.user.id]);
  
  if (!position) {
    return res.status(404).json({ error: 'Position not found' });
  }
  
  // Check for cash-affecting buy transactions and reverse
  const cashTxs = dbAll(
    `SELECT * FROM transactions WHERE portfolio_id = ? AND symbol = ? AND action = 'buy' AND affects_cash = 1`,
    [position.portfolio_id, position.symbol]
  );
  
  let cashReversed = 0;
  if (cashTxs.length > 0) {
    // Calculate total cost that was deducted
    let totalCostInPosCurrency = 0;
    for (const tx of cashTxs) {
      totalCostInPosCurrency += tx.quantity * tx.price * (position.multiplier || 1) + (tx.fees || 0);
    }
    
    const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ?', [position.portfolio_id]);
    const cashCurrency = portfolio.cash_currency || 'USD';
    const posCurrency = position.currency || 'USD';
    
    if (posCurrency !== cashCurrency) {
      const rates = await fetchExchangeRates();
      cashReversed = convertCurrency(totalCostInPosCurrency, posCurrency, cashCurrency, rates);
    } else {
      cashReversed = totalCostInPosCurrency;
    }
    
    dbRun('UPDATE portfolios SET cash = cash + ? WHERE id = ?', [cashReversed, position.portfolio_id]);
  }
  
  // Delete associated transactions
  dbRun('DELETE FROM transactions WHERE portfolio_id = ? AND symbol = ?', [position.portfolio_id, position.symbol]);
  dbRun('DELETE FROM positions WHERE id = ?', [id]);
  
  const updatedPortfolio = dbGet('SELECT cash FROM portfolios WHERE id = ?', [position.portfolio_id]);
  res.json({ message: 'Position deleted', cash: updatedPortfolio.cash, cash_reversed: cashReversed });
});

// Close position (full or partial)
router.post('/:id/positions/:posId/close', async (req, res) => {
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
  const quantityToClose = closeQty || position.quantity;
  const isPartial = quantityToClose < position.quantity;
  const closeDate = date || new Date().toISOString().split('T')[0];
  
  // Calculate realized PnL
  const realizedPnl = (close_price - position.entry_price) * quantityToClose * mult;
  
  // Currency conversion for cash impact
  const posCurrency = position.currency || 'USD';
  const cashCurrency = portfolio.cash_currency || 'USD';
  let cashImpact = 0;
  let proceeds = 0;
  
  if (affects_cash) {
    proceeds = close_price * quantityToClose * mult;
    const proceedsMinusFees = proceeds - fees;
    
    if (posCurrency !== cashCurrency) {
      const rates = await fetchExchangeRates();
      cashImpact = convertCurrency(proceedsMinusFees, posCurrency, cashCurrency, rates);
    } else {
      cashImpact = proceedsMinusFees;
    }
    
    dbRun('UPDATE portfolios SET cash = cash + ? WHERE id = ?', [cashImpact, id]);
  }
  
  if (isPartial) {
    // Partial close: create a new closed record, reduce original
    const proportionalEntryPrice = position.entry_price; // same avg cost
    
    dbRun(
      `INSERT INTO positions (portfolio_id, symbol, quantity, entry_price, source, location, name, type, entry_date, notes, strike_price, expiry_date, multiplier, current_price, currency, status, closed_at, close_price, realized_pnl)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'closed', ?, ?, ?)`,
      [position.portfolio_id, position.symbol, quantityToClose, proportionalEntryPrice, position.source, position.location, position.name, position.type, position.entry_date, position.notes, position.strike_price, position.expiry_date, mult, null, posCurrency, closeDate, close_price, realizedPnl]
    );
    
    // Reduce original position quantity
    const remainingQty = position.quantity - quantityToClose;
    dbRun('UPDATE positions SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [remainingQty, posId]);
  } else {
    // Full close
    dbRun(
      `UPDATE positions SET status = 'closed', closed_at = ?, close_price = ?, realized_pnl = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [closeDate, close_price, realizedPnl, posId]
    );
  }
  
  // Create sell transaction
  dbRun(
    'INSERT INTO transactions (portfolio_id, symbol, type, action, quantity, price, fees, executed_at, source, affects_cash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, position.symbol, position.type || 'stock', 'sell', quantityToClose, close_price, fees, closeDate, position.source || 'manual', affects_cash ? 1 : 0]
  );
  
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
});

// Get dividend data for all positions in a portfolio
router.get('/:id/dividends', async (req, res) => {
  const { id } = req.params;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  const positions = dbAll('SELECT * FROM positions WHERE portfolio_id = ? ORDER BY symbol', [id]);
  
  // Fetch prices (which include dividend data) for all unique symbols
  const symbols = [...new Set(positions.filter(p => p.type !== 'option').map(p => p.symbol))];
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
    const divYield = data.dividendYield || data.trailingAnnualDividendYield || 0;
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