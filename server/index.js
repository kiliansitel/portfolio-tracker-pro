// Load environment variables from .env file
const dotenvPath = require('path').join(__dirname, '.env');
if (require('fs').existsSync(dotenvPath)) {
  require('fs').readFileSync(dotenvPath, 'utf8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');

// Database and utilities
const { initDatabase } = require('./db');
const { authLimiter, apiLimiter, strictLimiter, sanitizeInput, helmetConfig, hpp } = require('./middleware/security');
const { logger, requestLogger } = require('./utils/logger');

// Route modules
const { router: authRouter, authenticateToken } = require('./routes/auth');
const portfolioRouter = require('./routes/portfolio');
const watchlistRouter = require('./routes/watchlist');
const alertsRouter = require('./routes/alerts');
const marketRouter = require('./routes/market');
const transactionsRouter = require('./routes/transactions');
const dataRouter = require('./routes/data');
const historyRouter = require('./routes/history');
const { router: pushRouter } = require('./routes/push');
const walletsRouter = require('./routes/wallets');

// Currency utilities
const { fetchExchangeRates, SUPPORTED_CURRENCIES } = require('./utils/currency');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware - Security Stack
app.use(helmet(helmetConfig));
app.use(cors({
  origin: process.env.CORS_ORIGIN || false, // Same-origin by default; set CORS_ORIGIN for cross-origin
  credentials: true,
  maxAge: 86400, // 24 hours
}));
app.use(cookieParser()); // Parse cookies for httpOnly auth
app.use(express.json({ limit: '1mb' })); // Limit body size
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(hpp()); // Prevent HTTP Parameter Pollution
app.use(sanitizeInput); // Sanitize all inputs
app.use(requestLogger); // Log all requests

// No-cache for HTML to ensure latest JS
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

// Apply rate limiting
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// App info endpoint (public)
const pkg = require('./package.json');
app.get('/api/info', (req, res) => {
  res.json({
    version: pkg.version,
    env: process.env.APP_ENV || 'production',
    name: process.env.APP_ENV === 'beta' ? `Portfolio Pro Beta v${pkg.version}` : 'Portfolio Pro'
  });
});

// Route handlers
app.use('/api/auth', authRouter);

// All other API routes require authentication
app.use('/api/portfolios', authenticateToken, portfolioRouter);
app.use('/api/watchlists', authenticateToken, watchlistRouter);
app.use('/api/alerts', authenticateToken, alertsRouter);
app.use('/api', marketRouter); // Market data is public

// Exchange rates endpoint (public)
app.get('/api/exchange-rates', async (req, res) => {
  try {
    const rates = await fetchExchangeRates();
    res.json({
      rates,
      supported_currencies: SUPPORTED_CURRENCIES,
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    res.status(500).json({ error: 'Failed to fetch exchange rates' });
  }
});

// VAPID public key endpoint (public)
app.get('/api/push/vapid-public-key', (req, res) => {
  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.use('/api/transactions', authenticateToken, transactionsRouter);
app.use('/api', authenticateToken, transactionsRouter); // Also mount for /api/portfolios/:id/transactions
app.use('/api', authenticateToken, dataRouter); // Data routes (snapshots, performance, reconstruct)
app.use('/api/push', authenticateToken, pushRouter);
app.use('/api/wallets', authenticateToken, walletsRouter);
app.use('/api/history/collect', authenticateToken, strictLimiter); // Stricter rate limit for collection
app.use('/api/history', authenticateToken, historyRouter);

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', { 
    error: err.message, 
    stack: err.stack, 
    url: req.originalUrl, 
    method: req.method,
    ip: req.ip 
  });
  res.status(500).json({ error: 'Internal server error' });
});

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
    logger.info(`🚀 Portfolio Tracker API running on http://localhost:${PORT}`);
  });
}

// Export for testing
module.exports = { app, start, initDatabase };

// Start if run directly
if (require.main === module) {
  start().catch(err => {
    logger.error('Failed to start server:', err);
    process.exit(1);
  });
}