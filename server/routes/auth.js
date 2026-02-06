const express = require('express');
const bcrypt = require('bcryptjs');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { dbRun, dbGet } = require('../db');
const { strictLimiter } = require('../middleware/security');
const { registerValidation, loginValidation } = require('../validators/auth');
const { logSecurityEvent } = require('../utils/logger');

const router = express.Router();

const crypto = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const generated = crypto.randomBytes(64).toString('hex');
  console.warn('⚠️  JWT_SECRET not set! Generated random secret. Sessions will NOT survive restarts. Set JWT_SECRET in environment for production.');
  return generated;
})();

// Auth middleware
function authenticateToken(req, res, next) {
  // Try cookie first (httpOnly)
  let token = req.cookies?.auth_token;
  
  // Fallback to Authorization header for API clients
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }
  
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

// Register
router.post('/register', strictLimiter, registerValidation, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user exists (generic message to prevent user enumeration)
    const existing = dbGet('SELECT id FROM users WHERE username = ? OR email = ?', [username, email.toLowerCase()]);
    if (existing) {
      logSecurityEvent(req, 'REGISTRATION_DUPLICATE', { username });
      return res.status(400).json({ error: 'Registration failed. Please try different credentials.' });
    }

    // Argon2id - OWASP recommended (memory: 19MB, iterations: 2, parallelism: 1)
    const hashedPassword = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,  // 19 MiB
      timeCost: 2,
      parallelism: 1
    });
    
    const result = dbRun('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', 
      [username, email.toLowerCase(), hashedPassword]);
    const userId = result.lastInsertRowid;
    
    // Create default portfolio
    dbRun('INSERT INTO portfolios (user_id, name, cash) VALUES (?, ?, 0)', 
      [userId, 'Main Portfolio']);
    
    // Create default watchlist
    dbRun('INSERT INTO watchlists (user_id, name) VALUES (?, ?)', 
      [userId, 'Main Watchlist']);
    
    const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '30d' });
    
    // Set httpOnly cookie
    res.cookie('auth_token', token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production', 
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    
    res.json({ 
      message: 'Registration successful',
      token, // Keep for API clients
      user: { id: userId, username, email: email.toLowerCase() }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', strictLimiter, loginValidation, async (req, res) => {
  try {
    const { login, password } = req.body;
    
    const user = dbGet('SELECT * FROM users WHERE username = ? OR email = ?', [login, login.toLowerCase()]);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Hybrid verification: try argon2 first, fallback to bcrypt for legacy hashes
    let validPassword = false;
    if (user.password.startsWith('$argon2')) {
      validPassword = await argon2.verify(user.password, password);
    } else {
      // Legacy bcrypt hash
      validPassword = await bcrypt.compare(password, user.password);
      // Optionally upgrade to argon2 on successful login
      if (validPassword) {
        const newHash = await argon2.hash(password, {
          type: argon2.argon2id,
          memoryCost: 19456,
          timeCost: 2,
          parallelism: 1
        });
        dbRun('UPDATE users SET password = ? WHERE id = ?', [newHash, user.id]);
      }
    }
    if (!validPassword) {
      logSecurityEvent(req, 'LOGIN_FAILED', { login });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    
    // Set httpOnly cookie
    res.cookie('auth_token', token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production', 
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    
    res.json({
      token, // Keep for API clients
      user: { id: user.id, username: user.username, email: user.email, settings: JSON.parse(user.settings || '{}') }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
  const user = dbGet('SELECT id, username, email, settings, created_at FROM users WHERE id = ?', [req.user.id]);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  user.settings = JSON.parse(user.settings || '{}');
  res.json(user);
});

// Update settings
router.put('/settings', authenticateToken, (req, res) => {
  const { settings, currency } = req.body;
  
  if (settings && typeof settings !== 'object') {
    return res.status(400).json({ error: 'Settings must be a JSON object' });
  }
  
  if (currency && !['USD', 'EUR', 'GBP', 'CHF'].includes(currency)) {
    return res.status(400).json({ error: 'Unsupported currency. Allowed: USD, EUR, GBP, CHF' });
  }
  
  const updates = [];
  const params = [];
  
  if (settings) {
    const settingsStr = JSON.stringify(settings);
    if (settingsStr.length > 10000) {
      return res.status(400).json({ error: 'Settings too large (max 10KB)' });
    }
    updates.push('settings = ?');
    params.push(settingsStr);
  }
  
  if (currency) {
    updates.push('currency = ?');
    params.push(currency);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid updates provided' });
  }
  
  params.push(req.user.id);
  
  dbRun(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  
  res.json({ message: 'Settings updated', settings, currency });
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Logged out successfully' });
});

module.exports = { router, authenticateToken };