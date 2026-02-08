const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db');
const { transactionValidation, idParamValidation } = require('../validators/portfolio');

const router = express.Router();

// Get all transactions for user (across all portfolios)
router.get('/', (req, res) => {
  const { limit, symbol } = req.query;
  
  let sql = `
    SELECT t.*, p.name as portfolio_name 
    FROM transactions t 
    JOIN portfolios p ON t.portfolio_id = p.id 
    WHERE p.user_id = ?
  `;
  const params = [req.user.id];
  
  if (symbol) {
    sql += ' AND t.symbol = ?';
    params.push(symbol.toUpperCase());
  }
  
  sql += ' ORDER BY t.executed_at DESC';
  
  if (limit) {
    sql += ' LIMIT ?';
    params.push(parseInt(limit));
  }
  
  const transactions = dbAll(sql, params);
  res.json(transactions);
});

// Get transactions for a specific portfolio
router.get('/portfolios/:id/transactions', (req, res) => {
  const { id } = req.params;
  const { limit, offset } = req.query;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  let sql = 'SELECT * FROM transactions WHERE portfolio_id = ? ORDER BY executed_at DESC';
  const params = [id];
  
  if (limit) {
    sql += ' LIMIT ?';
    params.push(parseInt(limit));
    if (offset) {
      sql += ' OFFSET ?';
      params.push(parseInt(offset));
    }
  }
  
  const transactions = dbAll(sql, params);
  const total = dbGet('SELECT COUNT(*) as count FROM transactions WHERE portfolio_id = ?', [id]);
  
  res.json({ transactions, total: total.count });
});

// Add transaction
router.post('/portfolios/:id/transactions', transactionValidation, (req, res) => {
  const { id } = req.params;
  const { symbol, type, action, quantity, price, fees, notes, executed_at, location } = req.body;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  const result = dbRun(
    'INSERT INTO transactions (portfolio_id, symbol, type, action, quantity, price, fees, notes, executed_at, source, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, symbol.toUpperCase(), type || 'stock', action || 'buy', quantity, price, fees || 0, notes || null, executed_at || new Date().toISOString().split('T')[0], 'manual', location || null]
  );
  
  res.json({
    id: result.lastInsertRowid,
    portfolio_id: parseInt(id),
    symbol: symbol.toUpperCase(),
    type: type || 'stock',
    action: action || 'buy',
    quantity, price,
    fees: fees || 0,
    executed_at: executed_at || new Date().toISOString().split('T')[0],
    notes,
    source: 'manual',
    location: location || null
  });
});

// Delete transaction
router.delete('/:id', idParamValidation, (req, res) => {
  const { id } = req.params;
  
  const transaction = dbGet(`
    SELECT t.* FROM transactions t 
    JOIN portfolios p ON t.portfolio_id = p.id 
    WHERE t.id = ? AND p.user_id = ?
  `, [id, req.user.id]);
  
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  
  dbRun('DELETE FROM transactions WHERE id = ?', [id]);
  res.json({ message: 'Transaction deleted' });
});

module.exports = router;
