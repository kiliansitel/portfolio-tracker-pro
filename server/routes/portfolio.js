const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db');
const { createPortfolioValidation, positionValidation, idParamValidation } = require('../validators/portfolio');

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
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, cash } = req.body;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  dbRun('UPDATE portfolios SET name = ?, cash = ? WHERE id = ?', [name || portfolio.name, cash ?? portfolio.cash, id]);
  
  res.json({ message: 'Portfolio updated' });
});

// Delete portfolio
router.delete('/:id', (req, res) => {
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
  const { symbol, quantity, avg_cost, entry_price } = req.body;
  
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
    const newAvgCost = ((existingPosition.quantity * existingPosition.avg_cost) + (quantity * price)) / newQuantity;
    
    dbRun('UPDATE positions SET quantity = ?, avg_cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
      [newQuantity, newAvgCost, existingPosition.id]);
    
    res.json({
      id: existingPosition.id,
      portfolio_id: parseInt(id),
      symbol: symbol.toUpperCase(),
      quantity: newQuantity,
      avg_cost: newAvgCost
    });
  } else {
    // Create new position
    const result = dbRun('INSERT INTO positions (portfolio_id, symbol, quantity, avg_cost) VALUES (?, ?, ?, ?)', 
      [id, symbol.toUpperCase(), quantity, price]);
    
    res.json({
      id: result.lastInsertRowid,
      portfolio_id: parseInt(id),
      symbol: symbol.toUpperCase(),
      quantity,
      avg_cost: price
    });
  }
});

// Update position
router.put('/positions/:id', idParamValidation, (req, res) => {
  const { id } = req.params;
  const { symbol, quantity, avg_cost } = req.body;
  
  const position = dbGet(`
    SELECT p.* FROM positions p 
    JOIN portfolios pf ON p.portfolio_id = pf.id 
    WHERE p.id = ? AND pf.user_id = ?
  `, [id, req.user.id]);
  
  if (!position) {
    return res.status(404).json({ error: 'Position not found' });
  }
  
  dbRun('UPDATE positions SET symbol = ?, quantity = ?, avg_cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
    [symbol?.toUpperCase() || position.symbol, quantity ?? position.quantity, avg_cost ?? position.avg_cost, id]);
  
  res.json({ message: 'Position updated' });
});

// Delete position
router.delete('/positions/:id', (req, res) => {
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