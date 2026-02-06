const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db');
const { transactionValidation } = require('../validators/portfolio');

const router = express.Router();

// Get transactions for a portfolio
router.get('/portfolios/:id/transactions', (req, res) => {
  const { id } = req.params;
  const { limit, offset } = req.query;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  let sql = 'SELECT * FROM transactions WHERE portfolio_id = ? ORDER BY date DESC';
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
  const { symbol, type, quantity, price, fee, notes, date } = req.body;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  const result = dbRun(
    'INSERT INTO transactions (portfolio_id, symbol, type, quantity, price, fee, date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, symbol.toUpperCase(), type, quantity, price, fee || 0, date || new Date().toISOString().split('T')[0], notes || null]
  );
  
  res.json({
    id: result.lastInsertRowid,
    portfolio_id: parseInt(id),
    symbol: symbol.toUpperCase(),
    type,
    quantity,
    price,
    fee: fee || 0,
    date: date || new Date().toISOString().split('T')[0],
    notes
  });
});

// Delete transaction
router.delete('/:id', (req, res) => {
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
  
  sql += ' ORDER BY t.date DESC';
  
  if (limit) {
    sql += ' LIMIT ?';
    params.push(parseInt(limit));
  }
  
  const transactions = dbAll(sql, params);
  res.json(transactions);
});

module.exports = router;