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
const fs = require('fs');
const path = require('path');
const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  // Persist secret next to the database so it survives Docker restarts
  const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/app/data') ? '/app/data' : __dirname);
  const secretPath = path.join(DATA_DIR, '.jwt_secret');
  try {
    if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, 'utf8').trim();
  } catch (e) { /* fall through to generate */ }
  const generated = crypto.randomBytes(64).toString('hex');
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(secretPath, generated, { mode: 0o600 });
    console.log('🔑 JWT secret generated and persisted to', secretPath);
  } catch (e) {
    console.warn('⚠️  Could not persist JWT secret to', secretPath, '— sessions will NOT survive restarts. Set JWT_SECRET env var for production.');
  }
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

  jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    // Validate token version to support logout invalidation
    const dbUser = dbGet('SELECT token_version FROM users WHERE id = ?', [user.id]);
    if (!dbUser || (user.tv !== undefined && user.tv !== (dbUser.token_version || 0))) {
      return res.status(403).json({ error: 'Token has been invalidated' });
    }
    req.user = user;
    next();
  });
}

// Admin-only middleware. Must run after authenticateToken. Reads is_admin from
// the DB (not the token) so revoking admin takes effect immediately.
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const dbUser = dbGet('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
  if (!dbUser || !dbUser.is_admin) {
    logSecurityEvent(req, 'ADMIN_FORBIDDEN', { userId: req.user.id, path: req.originalUrl });
    return res.status(403).json({ error: 'Administrator privileges required' });
  }
  next();
}

// Register
router.post('/register', strictLimiter, registerValidation, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Registration gate. The first account (bootstrap) is always allowed and becomes
    // the admin. After that, registration is closed unless ALLOW_REGISTRATION=true,
    // so an exposed single-user instance can't be signed up to by strangers.
    const userCountRow = dbGet('SELECT COUNT(*) AS c FROM users');
    const isFirstUser = (userCountRow?.c || 0) === 0;
    if (!isFirstUser && process.env.ALLOW_REGISTRATION !== 'true') {
      logSecurityEvent(req, 'REGISTRATION_DISABLED', { username });
      return res.status(403).json({ error: 'Registration is disabled on this instance.' });
    }

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
    
    const result = dbRun('INSERT INTO users (username, email, password, is_admin) VALUES (?, ?, ?, ?)',
      [username, email.toLowerCase(), hashedPassword, isFirstUser ? 1 : 0]);
    const userId = result.lastInsertRowid;
    
    // Create default portfolio
    dbRun('INSERT INTO portfolios (user_id, name, cash) VALUES (?, ?, 0)', 
      [userId, 'Main Portfolio']);
    
    // Create default watchlist
    dbRun('INSERT INTO watchlists (user_id, name) VALUES (?, ?)', 
      [userId, 'Main Watchlist']);
    
    const token = jwt.sign({ id: userId, username, tv: 0 }, JWT_SECRET, { expiresIn: '30d' });

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
    
    const tokenVersion = user.token_version || 0;
    const token = jwt.sign({ id: user.id, username: user.username, tv: tokenVersion }, JWT_SECRET, { expiresIn: '30d' });

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

// Change password
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    // Validate new password strength (min 8 chars, upper+lower+number)
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({ error: 'New password must contain at least one uppercase letter' });
    }
    if (!/[a-z]/.test(newPassword)) {
      return res.status(400).json({ error: 'New password must contain at least one lowercase letter' });
    }
    if (!/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'New password must contain at least one number' });
    }

    const user = dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password (support argon2 and legacy bcrypt)
    let validPassword = false;
    if (user.password.startsWith('$argon2')) {
      validPassword = await argon2.verify(user.password, currentPassword);
    } else {
      validPassword = await bcrypt.compare(currentPassword, user.password);
    }

    if (!validPassword) {
      logSecurityEvent(req, 'PASSWORD_CHANGE_FAILED', { userId: req.user.id });
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password with argon2id
    const hashedPassword = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1
    });

    dbRun('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
    logSecurityEvent(req, 'PASSWORD_CHANGED', { userId: req.user.id });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Update email
router.put('/email', authenticateToken, (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check for duplicates (another user with same email)
    const existing = dbGet('SELECT id FROM users WHERE email = ? AND id != ?', [email.toLowerCase(), req.user.id]);
    if (existing) {
      return res.status(400).json({ error: 'Email is already in use by another account' });
    }

    dbRun('UPDATE users SET email = ? WHERE id = ?', [email.toLowerCase(), req.user.id]);

    res.json({ message: 'Email updated successfully', email: email.toLowerCase() });
  } catch (error) {
    console.error('Update email error:', error);
    res.status(500).json({ error: 'Failed to update email' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  // Invalidate token by incrementing token_version
  const token = req.cookies?.auth_token || (req.headers['authorization']?.split(' ')[1]);
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      dbRun('UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?', [decoded.id]);
    } catch (e) {
      // Token already invalid, no action needed
    }
  }
  res.clearCookie('auth_token');
  res.json({ message: 'Logged out successfully' });
});

module.exports = { router, authenticateToken, requireAdmin };