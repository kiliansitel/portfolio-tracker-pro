const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'portfolio-tracker-secret-key-change-in-production';
// Use /app/data in Docker, or local directory otherwise
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/app/data') ? '/app/data' : __dirname);
const DB_PATH = path.join(DATA_DIR, 'portfolio.db');

let db;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// Initialize database
async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Load existing database or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Initialize tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      settings TEXT DEFAULT '{}'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      cash REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT,
      type TEXT DEFAULT 'stock',
      quantity REAL NOT NULL,
      entry_price REAL NOT NULL,
      entry_date TEXT,
      notes TEXT,
      strike_price REAL,
      expiry_date TEXT,
      current_price REAL,
      multiplier REAL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    )
  `);
  
  // Migration: add current_price column if missing
  try {
    db.run('ALTER TABLE positions ADD COLUMN current_price REAL');
  } catch (e) {
    // Column already exists, ignore
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS watchlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS watchlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT,
      alert_above REAL,
      alert_below REAL,
      notes TEXT,
      category TEXT DEFAULT 'general',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (watchlist_id) REFERENCES watchlists(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      condition TEXT NOT NULL,
      target_price REAL NOT NULL,
      triggered INTEGER DEFAULT 0,
      triggered_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL,
      action TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      fees REAL DEFAULT 0,
      notes TEXT,
      executed_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      total_value REAL NOT NULL,
      cash REAL NOT NULL,
      positions_value REAL NOT NULL,
      daily_change REAL DEFAULT 0,
      daily_change_pct REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
      UNIQUE(portfolio_id, date)
    )
  `);

  saveDatabase();
  console.log('📦 Database initialized');
}

// Save database to file
function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Helper to run queries
function dbRun(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  const lastId = db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0] || 0;
  saveDatabase();
  return { lastInsertRowid: lastId };
}

function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// ============ AUTH ROUTES ============

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existing = dbGet('SELECT id FROM users WHERE username = ? OR email = ?', [username, email.toLowerCase()]);
    if (existing) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = dbRun('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', 
      [username, email.toLowerCase(), hashedPassword]);
    const userId = result.lastInsertRowid;
    
    // Create default portfolio
    dbRun('INSERT INTO portfolios (user_id, name, is_default, cash) VALUES (?, ?, 1, 0)', 
      [userId, 'Main Portfolio']);
    
    // Create default watchlist
    dbRun('INSERT INTO watchlists (user_id, name) VALUES (?, ?)', 
      [userId, 'Main Watchlist']);
    
    const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({ 
      message: 'Registration successful',
      token,
      user: { id: userId, username, email: email.toLowerCase() }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    
    if (!login || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    
    const user = dbGet('SELECT * FROM users WHERE username = ? OR email = ?', [login, login.toLowerCase()]);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, settings: JSON.parse(user.settings || '{}') }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = dbGet('SELECT id, username, email, settings, created_at FROM users WHERE id = ?', [req.user.id]);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  user.settings = JSON.parse(user.settings || '{}');
  res.json(user);
});

// Update settings
app.put('/api/auth/settings', authenticateToken, (req, res) => {
  const { settings } = req.body;
  
  dbRun('UPDATE users SET settings = ? WHERE id = ?', [JSON.stringify(settings), req.user.id]);
  
  res.json({ message: 'Settings updated', settings });
});

// ============ PORTFOLIO ROUTES ============

// Get all portfolios
app.get('/api/portfolios', authenticateToken, (req, res) => {
  const portfolios = dbAll('SELECT * FROM portfolios WHERE user_id = ? ORDER BY is_default DESC, name', [req.user.id]);
  res.json(portfolios);
});

// Create portfolio
app.post('/api/portfolios', authenticateToken, (req, res) => {
  const { name, cash } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Portfolio name required' });
  }
  
  const result = dbRun('INSERT INTO portfolios (user_id, name, cash) VALUES (?, ?, ?)', 
    [req.user.id, name, cash || 0]);
  
  res.json({ id: result.lastInsertRowid, user_id: req.user.id, name, cash: cash || 0, is_default: 0 });
});

// Update portfolio
app.put('/api/portfolios/:id', authenticateToken, (req, res) => {
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
app.delete('/api/portfolios/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  if (portfolio.is_default) {
    return res.status(400).json({ error: 'Cannot delete default portfolio' });
  }
  
  dbRun('DELETE FROM positions WHERE portfolio_id = ?', [id]);
  dbRun('DELETE FROM portfolios WHERE id = ?', [id]);
  
  res.json({ message: 'Portfolio deleted' });
});

// ============ POSITIONS ROUTES ============

// Get positions for a portfolio
app.get('/api/portfolios/:id/positions', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  const positions = dbAll('SELECT * FROM positions WHERE portfolio_id = ? ORDER BY symbol', [id]);
  res.json(positions);
});

// Add position
app.post('/api/portfolios/:id/positions', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { symbol, name, type, quantity, entry_price, entry_date, notes, strike_price, expiry_date, multiplier } = req.body;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  if (!symbol || !quantity || !entry_price) {
    return res.status(400).json({ error: 'Symbol, quantity, and entry price required' });
  }
  
  // Convert undefined to null for sql.js
  const { current_price } = req.body;
  const result = dbRun(`
    INSERT INTO positions (portfolio_id, symbol, name, type, quantity, entry_price, entry_date, notes, strike_price, expiry_date, current_price, multiplier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, symbol.toUpperCase(), name || null, type || 'stock', quantity, entry_price, entry_date || null, notes || null, strike_price || null, expiry_date || null, current_price || null, multiplier || 1]);
  
  res.json({
    id: result.lastInsertRowid,
    portfolio_id: parseInt(id),
    symbol: symbol.toUpperCase(),
    name,
    type: type || 'stock',
    quantity,
    entry_price,
    entry_date,
    notes,
    strike_price,
    expiry_date,
    current_price,
    multiplier: multiplier || 1
  });
});

// Update position
app.put('/api/positions/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { symbol, name, type, quantity, entry_price, entry_date, notes, strike_price, expiry_date, current_price, multiplier } = req.body;
  
  const position = dbGet(`
    SELECT p.* FROM positions p 
    JOIN portfolios pf ON p.portfolio_id = pf.id 
    WHERE p.id = ? AND pf.user_id = ?
  `, [id, req.user.id]);
  
  if (!position) {
    return res.status(404).json({ error: 'Position not found' });
  }
  
  dbRun(`
    UPDATE positions SET symbol = ?, name = ?, type = ?, quantity = ?, entry_price = ?, 
    entry_date = ?, notes = ?, strike_price = ?, expiry_date = ?, current_price = ?, multiplier = ?
    WHERE id = ?
  `, [
    symbol?.toUpperCase() || position.symbol, 
    name ?? position.name, 
    type ?? position.type, 
    quantity ?? position.quantity, 
    entry_price ?? position.entry_price, 
    entry_date ?? position.entry_date, 
    notes ?? position.notes, 
    strike_price ?? position.strike_price, 
    expiry_date ?? position.expiry_date, 
    current_price ?? position.current_price,
    multiplier ?? position.multiplier, 
    id
  ]);
  
  res.json({ message: 'Position updated' });
});

// Delete position
app.delete('/api/positions/:id', authenticateToken, (req, res) => {
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

// ============ WATCHLIST ROUTES ============

// Get all watchlists with items
app.get('/api/watchlists', authenticateToken, (req, res) => {
  const watchlists = dbAll('SELECT * FROM watchlists WHERE user_id = ? ORDER BY name', [req.user.id]);
  
  // Get items for each watchlist
  for (const wl of watchlists) {
    wl.items = dbAll('SELECT * FROM watchlist_items WHERE watchlist_id = ? ORDER BY symbol', [wl.id]);
  }
  
  res.json(watchlists);
});

// Create watchlist
app.post('/api/watchlists', authenticateToken, (req, res) => {
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Watchlist name required' });
  }
  
  const result = dbRun('INSERT INTO watchlists (user_id, name) VALUES (?, ?)', [req.user.id, name]);
  
  res.json({ id: result.lastInsertRowid, user_id: req.user.id, name, items: [] });
});

// Add to watchlist
app.post('/api/watchlists/:id/items', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { symbol, name, alert_above, alert_below, notes, category } = req.body;
  
  const watchlist = dbGet('SELECT * FROM watchlists WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!watchlist) {
    return res.status(404).json({ error: 'Watchlist not found' });
  }
  
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }
  
  // Convert undefined to null for sql.js
  const result = dbRun(
    'INSERT INTO watchlist_items (watchlist_id, symbol, name, alert_above, alert_below, notes, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, symbol.toUpperCase(), name || null, alert_above || null, alert_below || null, notes || null, category || 'general']
  );
  
  res.json({
    id: result.lastInsertRowid,
    watchlist_id: parseInt(id),
    symbol: symbol.toUpperCase(),
    name,
    alert_above,
    alert_below,
    notes,
    category: category || 'general'
  });
});

// Update watchlist item
app.put('/api/watchlist-items/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { symbol, name, alert_above, alert_below, notes, category } = req.body;
  
  const item = dbGet(`
    SELECT wi.* FROM watchlist_items wi 
    JOIN watchlists w ON wi.watchlist_id = w.id 
    WHERE wi.id = ? AND w.user_id = ?
  `, [id, req.user.id]);
  
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  
  dbRun('UPDATE watchlist_items SET symbol = ?, name = ?, alert_above = ?, alert_below = ?, notes = ?, category = ? WHERE id = ?',
    [symbol?.toUpperCase() || item.symbol, name ?? item.name, alert_above, alert_below, notes ?? item.notes, category ?? item.category, id]);
  
  res.json({ message: 'Item updated' });
});

// Delete watchlist item
app.delete('/api/watchlist-items/:id', authenticateToken, (req, res) => {
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
app.delete('/api/watchlists/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const watchlist = dbGet('SELECT * FROM watchlists WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!watchlist) {
    return res.status(404).json({ error: 'Watchlist not found' });
  }
  
  dbRun('DELETE FROM watchlist_items WHERE watchlist_id = ?', [id]);
  dbRun('DELETE FROM watchlists WHERE id = ?', [id]);
  
  res.json({ message: 'Watchlist deleted' });
});

// ============ ALERTS ROUTES ============

// Get all alerts
app.get('/api/alerts', authenticateToken, (req, res) => {
  const alerts = dbAll('SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json(alerts);
});

// Create alert
app.post('/api/alerts', authenticateToken, (req, res) => {
  const { symbol, condition, target_price } = req.body;
  
  if (!symbol || !condition || !target_price) {
    return res.status(400).json({ error: 'Symbol, condition, and target price required' });
  }
  
  if (!['above', 'below'].includes(condition)) {
    return res.status(400).json({ error: 'Condition must be "above" or "below"' });
  }
  
  const result = dbRun('INSERT INTO alerts (user_id, symbol, condition, target_price) VALUES (?, ?, ?, ?)',
    [req.user.id, symbol.toUpperCase(), condition, target_price]);
  
  res.json({
    id: result.lastInsertRowid,
    user_id: req.user.id,
    symbol: symbol.toUpperCase(),
    condition,
    target_price,
    triggered: 0
  });
});

// Delete alert
app.delete('/api/alerts/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const alert = dbGet('SELECT * FROM alerts WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!alert) {
    return res.status(404).json({ error: 'Alert not found' });
  }
  
  dbRun('DELETE FROM alerts WHERE id = ?', [id]);
  res.json({ message: 'Alert deleted' });
});

// Check alerts against current prices (internal endpoint for cron)
app.get('/api/alerts/check', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== 'portfolio-alert-checker-key') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  // Get all untriggered alerts
  const alerts = dbAll('SELECT a.*, u.username FROM alerts a JOIN users u ON a.user_id = u.id WHERE a.triggered = 0');
  
  if (alerts.length === 0) {
    return res.json({ triggered: [], checked: 0 });
  }
  
  // Get unique symbols
  const symbols = [...new Set(alerts.map(a => a.symbol))];
  
  // Fetch prices (simple Yahoo Finance approach)
  const triggered = [];
  
  for (const symbol of symbols) {
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
      const data = await response.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      
      if (price) {
        // Check alerts for this symbol
        for (const alert of alerts.filter(a => a.symbol === symbol)) {
          let shouldTrigger = false;
          
          if (alert.condition === 'above' && price >= alert.target_price) {
            shouldTrigger = true;
          } else if (alert.condition === 'below' && price <= alert.target_price) {
            shouldTrigger = true;
          }
          
          if (shouldTrigger) {
            // Mark as triggered
            dbRun('UPDATE alerts SET triggered = 1, triggered_at = ? WHERE id = ?', 
              [new Date().toISOString(), alert.id]);
            
            triggered.push({
              id: alert.id,
              symbol: alert.symbol,
              condition: alert.condition,
              target_price: alert.target_price,
              current_price: price,
              username: alert.username
            });
          }
        }
      }
    } catch (e) {
      console.error(`Failed to fetch price for ${symbol}:`, e.message);
    }
  }
  
  res.json({ triggered, checked: symbols.length });
});

// ============ TRANSACTIONS ROUTES ============

// Get transactions for a portfolio
app.get('/api/portfolios/:id/transactions', authenticateToken, (req, res) => {
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
app.post('/api/portfolios/:id/transactions', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { symbol, type, action, quantity, price, fees, notes, executed_at } = req.body;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  if (!symbol || !action || !quantity || !price) {
    return res.status(400).json({ error: 'Symbol, action, quantity, and price required' });
  }
  
  if (!['buy', 'sell'].includes(action.toLowerCase())) {
    return res.status(400).json({ error: 'Action must be "buy" or "sell"' });
  }
  
  const result = dbRun(`
    INSERT INTO transactions (portfolio_id, symbol, type, action, quantity, price, fees, notes, executed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, 
    symbol.toUpperCase(), 
    type || 'stock', 
    action.toLowerCase(), 
    quantity, 
    price, 
    fees || 0, 
    notes || null, 
    executed_at || new Date().toISOString()
  ]);
  
  res.json({
    id: result.lastInsertRowid,
    portfolio_id: parseInt(id),
    symbol: symbol.toUpperCase(),
    type: type || 'stock',
    action: action.toLowerCase(),
    quantity,
    price,
    fees: fees || 0,
    notes,
    executed_at: executed_at || new Date().toISOString()
  });
});

// Delete transaction
app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
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
app.get('/api/transactions', authenticateToken, (req, res) => {
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

// ============ PORTFOLIO SNAPSHOTS ============

// Record a portfolio snapshot (called from frontend or cron)
app.post('/api/portfolios/:id/snapshot', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { total_value, cash, positions_value } = req.body;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  const today = new Date().toISOString().split('T')[0];
  
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
app.get('/api/portfolios/:id/performance', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { days } = req.query;
  
  const portfolio = dbGet('SELECT * FROM portfolios WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }
  
  let sql = 'SELECT * FROM portfolio_snapshots WHERE portfolio_id = ? ORDER BY date DESC';
  const params = [id];
  
  if (days) {
    sql = 'SELECT * FROM portfolio_snapshots WHERE portfolio_id = ? AND date >= date(?, ?) ORDER BY date ASC';
    params.push('now', `-${parseInt(days)} days`);
  }
  
  const snapshots = dbAll(sql, params);
  
  // Calculate overall performance
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  
  const totalReturn = first && last ? last.total_value - first.total_value : 0;
  const totalReturnPct = first && first.total_value > 0 
    ? ((last.total_value - first.total_value) / first.total_value) * 100 
    : 0;
  
  res.json({
    snapshots: snapshots.reverse(), // Oldest first for charts
    summary: {
      total_return: totalReturn,
      total_return_pct: totalReturnPct,
      start_value: first?.total_value || 0,
      current_value: last?.total_value || 0,
      days: snapshots.length
    }
  });
});

// ============ TICKER SEARCH ============

// Popular tickers for suggestions
const POPULAR_TICKERS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices' },
  { symbol: 'ASML', name: 'ASML Holding N.V.' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF' },
  { symbol: 'BTC-USD', name: 'Bitcoin USD' },
  { symbol: 'ETH-USD', name: 'Ethereum USD' },
  { symbol: 'GC=F', name: 'Gold Futures' },
  { symbol: 'CL=F', name: 'Crude Oil Futures' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury' },
  { symbol: 'ROBO', name: 'Robo Global Robotics ETF' },
  { symbol: 'ISRG', name: 'Intuitive Surgical Inc.' },
  { symbol: 'SYM', name: 'Symbotic Inc.' },
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'NASDAQ Composite' },
  { symbol: '^DJI', name: 'Dow Jones Industrial' },
  { symbol: '^VIX', name: 'CBOE Volatility Index' },
  { symbol: '^RUT', name: 'Russell 2000' },
];

app.get('/api/tickers/search', (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.json(POPULAR_TICKERS.slice(0, 20));
  }
  
  const query = q.toUpperCase();
  const matches = POPULAR_TICKERS.filter(t => 
    t.symbol.includes(query) || t.name.toUpperCase().includes(query)
  );
  
  res.json(matches.slice(0, 20));
});

app.get('/api/tickers/popular', (req, res) => {
  res.json(POPULAR_TICKERS);
});

// ============ STATIC FILES ============

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve main app (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server
async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`🚀 Portfolio Tracker API running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
