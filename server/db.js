const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { logger } = require('./utils/logger');

// Use /app/data in Docker, or local directory otherwise
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/app/data') ? '/app/data' : __dirname);
const DB_PATH = path.join(DATA_DIR, 'portfolio.db');

let db;

// Save database to file (debounced for performance)
let saveTimeout = null;
let savePending = false;

function saveDatabaseImmediate() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  savePending = false;
}

function saveDatabase() {
  savePending = true;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveDatabaseImmediate, 1000); // Batch writes within 1 second
}

// Ensure database is saved on exit
process.on('SIGTERM', () => { if (savePending) saveDatabaseImmediate(); process.exit(0); });
process.on('SIGINT', () => { if (savePending) saveDatabaseImmediate(); process.exit(0); });

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
      currency TEXT DEFAULT 'USD',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      settings TEXT DEFAULT '{}'
    )
  `);

  // Add currency column to existing users if not present
  try {
    db.run(`ALTER TABLE users ADD COLUMN currency TEXT DEFAULT 'USD'`);
  } catch (e) {
    // Column already exists, ignore
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
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
      quantity REAL NOT NULL,
      entry_price REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
      UNIQUE(portfolio_id, symbol)
    )
  `);

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
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (watchlist_id) REFERENCES watchlists(id),
      UNIQUE(watchlist_id, symbol)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      condition TEXT NOT NULL,
      value REAL NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      telegram_chat_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'stock',
      action TEXT NOT NULL DEFAULT 'buy' CHECK (action IN ('buy', 'sell')),
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      fees REAL DEFAULT 0,
      executed_at TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    )
  `);

  // Migrate legacy column names if needed
  try { db.run(`ALTER TABLE transactions ADD COLUMN action TEXT NOT NULL DEFAULT 'buy'`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE transactions ADD COLUMN fees REAL DEFAULT 0`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE transactions ADD COLUMN executed_at TEXT`); } catch (e) { /* exists */ }
  // Migrate old 'date' column data to 'executed_at' if both exist
  try { db.run(`UPDATE transactions SET executed_at = date WHERE executed_at IS NULL AND date IS NOT NULL`); } catch (e) { /* ignore */ }

  // Position enhancements
  try { db.run(`ALTER TABLE positions ADD COLUMN name TEXT`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE positions ADD COLUMN type TEXT DEFAULT 'stock'`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE positions ADD COLUMN entry_date TEXT`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE positions ADD COLUMN notes TEXT`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE positions ADD COLUMN strike_price REAL`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE positions ADD COLUMN expiry_date TEXT`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE positions ADD COLUMN multiplier REAL DEFAULT 1`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE positions ADD COLUMN current_price REAL`); } catch (e) { /* exists */ }

  // Portfolio enhancements
  try { db.run(`ALTER TABLE portfolios ADD COLUMN is_default INTEGER DEFAULT 0`); } catch (e) { /* exists */ }

  // Watchlist item enhancements
  try { db.run(`ALTER TABLE watchlist_items ADD COLUMN name TEXT`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE watchlist_items ADD COLUMN category TEXT`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE watchlist_items ADD COLUMN alert_above REAL`); } catch (e) { /* exists */ }
  try { db.run(`ALTER TABLE watchlist_items ADD COLUMN alert_below REAL`); } catch (e) { /* exists */ }

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

  db.run(`
    CREATE TABLE IF NOT EXISTS exchange_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_currency TEXT NOT NULL,
      target_currency TEXT NOT NULL,
      rate REAL NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(base_currency, target_currency)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, endpoint)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL NOT NULL,
      volume REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(symbol, date)
    )
  `);

  // Create indexes for performance
  db.run('CREATE INDEX IF NOT EXISTS idx_price_history_symbol_date ON price_history(symbol, date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_positions_portfolio ON positions(portfolio_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol)');
  db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist ON watchlist_items(watchlist_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_transactions_portfolio ON transactions(portfolio_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_transactions_symbol ON transactions(symbol)');
  db.run('CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_snapshots_portfolio_date ON portfolio_snapshots(portfolio_id, date)');

  // Wallets table for on-chain wallet tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      chain TEXT NOT NULL CHECK (chain IN ('btc', 'eth', 'sol')),
      address TEXT NOT NULL,
      label TEXT,
      balance REAL DEFAULT 0,
      last_synced TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, chain, address)
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id)');

  // Wallet on-chain transactions table
  db.run(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      chain TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      amount REAL NOT NULL DEFAULT 0,
      fee REAL DEFAULT 0,
      counterparty TEXT,
      block_height INTEGER DEFAULT 0,
      block_time TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
      UNIQUE(wallet_id, tx_hash)
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_hash ON wallet_transactions(wallet_id, tx_hash)');
  db.run('CREATE INDEX IF NOT EXISTS idx_wallet_tx_block ON wallet_transactions(wallet_id, block_height)');

  saveDatabaseImmediate(); // Use immediate save for init
  console.log('📦 Database initialized');
}

function getDb() {
  return db;
}

module.exports = {
  initDatabase,
  saveDatabase,
  saveDatabaseImmediate,
  dbRun,
  dbGet,
  dbAll,
  getDb
};