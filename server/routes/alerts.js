const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db');
const { alertValidation } = require('../validators/portfolio');
const { logSecurityEvent } = require('../utils/logger');
const { sendPushNotification } = require('./push');

const { idParamValidation } = require('../validators/portfolio');

const router = express.Router();

const crypto = require('crypto');
const ALERT_API_KEY = process.env.ALERT_API_KEY || (() => {
  const generated = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  ALERT_API_KEY not set! Generated random key. Set ALERT_API_KEY in .env for production.');
  return generated;
})();

// Get all alerts
router.get('/', (req, res) => {
  const alerts = dbAll('SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json(alerts);
});

// Create alert
router.post('/', alertValidation, (req, res) => {
  const { symbol, condition, target_price, value } = req.body;
  const alertValue = target_price || value; // Support both field names
  
  if (!alertValue) {
    return res.status(400).json({ error: 'target_price is required' });
  }
  
  const result = dbRun('INSERT INTO alerts (user_id, symbol, condition, target_price, value) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, symbol.toUpperCase(), condition, alertValue, alertValue]);
  
  res.json({
    id: result.lastInsertRowid,
    user_id: req.user.id,
    symbol: symbol.toUpperCase(),
    condition,
    value: alertValue,
    is_active: 1
  });
});

// Delete alert
router.delete('/:id', idParamValidation, (req, res) => {
  const { id } = req.params;
  
  const alert = dbGet('SELECT * FROM alerts WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!alert) {
    return res.status(404).json({ error: 'Alert not found' });
  }
  
  dbRun('DELETE FROM alerts WHERE id = ?', [id]);
  res.json({ message: 'Alert deleted' });
});

// Check alerts against current prices (internal endpoint for cron)
router.get('/check', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== ALERT_API_KEY) {
    logSecurityEvent(req, 'INVALID_ALERT_API_KEY', { provided: apiKey ? 'yes' : 'no' });
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  // Get all active alerts
  const alerts = dbAll('SELECT a.*, u.username FROM alerts a JOIN users u ON a.user_id = u.id WHERE a.is_active = 1');
  
  if (alerts.length === 0) {
    return res.json({ triggered: [], checked: 0 });
  }
  
  // Get unique symbols
  const symbols = [...new Set(alerts.map(a => a.symbol))];
  
  // Fetch prices
  const triggered = [];
  
  const { fetchYahooPrice } = require('../utils/yahoo');
  
  for (const symbol of symbols) {
    try {
      const priceData = await fetchYahooPrice(symbol);
      const price = priceData?.price;
      
      if (price) {
        // Check alerts for this symbol
        for (const alert of alerts.filter(a => a.symbol === symbol)) {
          let shouldTrigger = false;
          
          if (alert.condition === 'above' && price >= alert.value) {
            shouldTrigger = true;
          } else if (alert.condition === 'below' && price <= alert.value) {
            shouldTrigger = true;
          }
          
          if (shouldTrigger) {
            // Deactivate alert
            dbRun('UPDATE alerts SET is_active = 0 WHERE id = ?', [alert.id]);
            
            // Send push notification
            try {
              const pushPayload = {
                title: 'Price Alert Triggered!',
                body: `${alert.symbol} is ${alert.condition} ${alert.value} (current: $${price.toFixed(2)})`,
                icon: '/logo.svg',
                badge: '/logo.svg',
                tag: `alert-${alert.id}`,
                data: {
                  symbol: alert.symbol,
                  alertId: alert.id,
                  currentPrice: price
                }
              };
              
              sendPushNotification(alert.user_id, pushPayload).catch(error => {
                console.error('Failed to send push notification for alert:', error);
              });
            } catch (error) {
              console.error('Error preparing push notification:', error);
            }
            
            triggered.push({
              id: alert.id,
              symbol: alert.symbol,
              condition: alert.condition,
              value: alert.value,
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

module.exports = router;