const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db');
const { createPortfolioValidation, positionValidation, idParamValidation } = require('../validators/portfolio');
const { strictLimiter } = require('../middleware/security');
const { autoAddToWatchlist } = require('../utils/watchlist-sync');

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
  const { name, cash } = req.body;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  dbRun('UPDATE portfolios SET name = ?, cash = ? WHERE id = ?', [name || portfolio.name, cash ?? portfolio.cash, id]);
  
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
router.post('/:id/positions', positionValidation, (req, res) => {
  const { id } = req.params;
  const { symbol, quantity, avg_cost, entry_price, location, name, type, entry_date, notes, strike_price, expiry_date, multiplier, current_price, currency } = req.body;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  const price = entry_price || avg_cost; // Support both field names
  
  if (!symbol || !quantity || !price) {
    return res.status(400).json({ error: 'Symbol, quantity, and price required' });
  }
  
  // Check if position already exists
  const existingPosition = dbGet('SELECT * FROM positions WHERE portfolio_id = ? AND symbol = ?', [id, symbol.toUpperCase()]);
  
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
    
    const updated = dbGet('SELECT * FROM positions WHERE id = ?', [existingPosition.id]);
    res.json(updated);
  } else {
    // Create new position (source defaults to 'manual')
    const result = dbRun(
      `INSERT INTO positions (portfolio_id, symbol, quantity, entry_price, source, location, name, type, entry_date, notes, strike_price, expiry_date, multiplier, current_price, currency) 
       VALUES (?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      [id, symbol.toUpperCase(), quantity, price, location || null, name || null, type || 'stock', entry_date || null, notes || null, strike_price || null, expiry_date || null, multiplier || 1, current_price || null, currency || 'USD']);
    
    const newPosition = dbGet('SELECT * FROM positions WHERE id = ?', [result.lastInsertRowid]);
    res.json(newPosition);
  }

  // Auto-add to watchlist regardless of new/existing
  autoAddToWatchlist(req.user.id, symbol.toUpperCase());
});

// Update position
router.put('/positions/:id', idParamValidation, (req, res) => {
  const { id } = req.params;
  const { symbol, quantity, avg_cost, entry_price, location, name, type, entry_date, notes, strike_price, expiry_date, multiplier, current_price, currency } = req.body;
  
  const position = dbGet(`
    SELECT p.* FROM positions p 
    JOIN portfolios pf ON p.portfolio_id = pf.id 
    WHERE p.id = ? AND pf.user_id = ?
  `, [id, req.user.id]);
  
  if (!position) {
    return res.status(404).json({ error: 'Position not found' });
  }
  
  const price = entry_price || avg_cost || position.entry_price;
  dbRun(`UPDATE positions SET symbol = ?, quantity = ?, entry_price = ?, location = ?, 
    name = ?, type = ?, entry_date = ?, notes = ?, strike_price = ?, expiry_date = ?, 
    multiplier = ?, current_price = ?, currency = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
    [
      symbol?.toUpperCase() || position.symbol, 
      quantity ?? position.quantity, 
      price, 
      location !== undefined ? (location || null) : position.location,
      name !== undefined ? (name || null) : position.name,
      type || position.type || 'stock',
      entry_date !== undefined ? (entry_date || null) : position.entry_date,
      notes !== undefined ? (notes || null) : position.notes,
      strike_price !== undefined ? (strike_price || null) : position.strike_price,
      expiry_date !== undefined ? (expiry_date || null) : position.expiry_date,
      multiplier || position.multiplier || 1,
      current_price !== undefined ? (current_price || null) : position.current_price,
      currency || position.currency || 'USD',
      id
    ]);
  
  res.json({ message: 'Position updated' });
});

// Delete position
router.delete('/positions/:id', idParamValidation, (req, res) => {
  const { id } = req.params;
  
  const position = dbGet(`
    SELECT p.* FROM positions p 
    JOIN portfolios pf ON p.portfolio_id = pf.id 
    WHERE p.id = ? AND pf.user_id = ?
  `, [id, req.user.id]);
  
  if (!position) {
    return res.status(404).json({ error: 'Position not found' });
  }
  
  dbRun('DELETE FROM positions WHERE id = ?', [id]);
  res.json({ message: 'Position deleted' });
});

module.exports = router;