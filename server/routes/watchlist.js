const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db');
const { createPortfolioValidation, watchlistItemValidation, idParamValidation } = require('../validators/portfolio');

const router = express.Router();

// Get all watchlists with items
router.get('/', (req, res) => {
  const watchlists = dbAll('SELECT * FROM watchlists WHERE user_id = ? ORDER BY name', [req.user.id]);
  
  // Get items for each watchlist
  for (const wl of watchlists) {
    wl.items = dbAll('SELECT * FROM watchlist_items WHERE watchlist_id = ? ORDER BY symbol', [wl.id]);
  }
  
  res.json(watchlists);
});

// Create watchlist
router.post('/', createPortfolioValidation, (req, res) => {
  const { name } = req.body;
  
  const result = dbRun('INSERT INTO watchlists (user_id, name) VALUES (?, ?)', [req.user.id, name]);
  
  res.json({ id: result.lastInsertRowid, user_id: req.user.id, name, items: [] });
});

// Add to watchlist
router.post('/:id/items', watchlistItemValidation, (req, res) => {
  const { id } = req.params;
  const { symbol, notes } = req.body;
  
  const watchlist = dbGet('SELECT * FROM watchlists WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!watchlist) {
    return res.status(404).json({ error: 'Watchlist not found' });
  }
  
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }
  
  // Check if item already exists
  const existing = dbGet('SELECT * FROM watchlist_items WHERE watchlist_id = ? AND symbol = ?', [id, symbol.toUpperCase()]);
  if (existing) {
    return res.status(400).json({ error: 'Symbol already in watchlist' });
  }
  
  const result = dbRun('INSERT INTO watchlist_items (watchlist_id, symbol, notes) VALUES (?, ?, ?)', 
    [id, symbol.toUpperCase(), notes || null]);
  
  res.json({
    id: result.lastInsertRowid,
    watchlist_id: parseInt(id),
    symbol: symbol.toUpperCase(),
    notes
  });
});

// Update watchlist item
router.put('/items/:id', idParamValidation, (req, res) => {
  const { id } = req.params;
  const { symbol, notes } = req.body;
  
  const item = dbGet(`
    SELECT wi.* FROM watchlist_items wi 
    JOIN watchlists w ON wi.watchlist_id = w.id 
    WHERE wi.id = ? AND w.user_id = ?
  `, [id, req.user.id]);
  
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  
  dbRun('UPDATE watchlist_items SET symbol = ?, notes = ? WHERE id = ?', 
    [symbol?.toUpperCase() || item.symbol, notes ?? item.notes, id]);
  
  res.json({ message: 'Item updated' });
});

// Delete watchlist item
router.delete('/items/:id', idParamValidation, (req, res) => {
  const { id } = req.params;
  
  const item = dbGet(`
    SELECT wi.* FROM watchlist_items wi 
    JOIN watchlists w ON wi.watchlist_id = w.id 
    WHERE wi.id = ? AND w.user_id = ?
  `, [id, req.user.id]);
  
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  
  dbRun('DELETE FROM watchlist_items WHERE id = ?', [id]);
  res.json({ message: 'Item deleted' });
});

// Delete watchlist
router.delete('/:id', idParamValidation, (req, res) => {
  const { id } = req.params;
  
  const watchlist = dbGet('SELECT * FROM watchlists WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!watchlist) {
    return res.status(404).json({ error: 'Watchlist not found' });
  }
  
  dbRun('DELETE FROM watchlist_items WHERE watchlist_id = ?', [id]);
  dbRun('DELETE FROM watchlists WHERE id = ?', [id]);
  
  res.json({ message: 'Watchlist deleted' });
});

module.exports = router;