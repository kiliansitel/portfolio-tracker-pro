const express = require('express');
const webpush = require('web-push');
const { dbRun, dbGet, dbAll } = require('../db');

const router = express.Router();

// VAPID setup
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@portfolio-tracker.local',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} else {
  console.warn('⚠️  VAPID keys not configured. Push notifications will not work.');
}

// Subscribe to push notifications
router.post('/subscribe', (req, res) => {
  const { subscription } = req.body;
  
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Invalid subscription data' });
  }
  
  const { endpoint, keys } = subscription;
  const { p256dh, auth } = keys;
  
  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'Missing subscription keys' });
  }
  
  // Save subscription to database
  try {
    dbRun(
      'INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
      [req.user.id, endpoint, p256dh, auth]
    );
    
    res.json({ message: 'Push subscription saved' });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// Unsubscribe from push notifications (POST because DELETE with body is unreliable)
router.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint required' });
  }
  
  try {
    const result = dbRun(
      'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
      [req.user.id, endpoint]
    );
    
    res.json({ message: 'Push subscription removed' });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

// Send push notification (internal function)
async function sendPushNotification(userId, payload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('Push notifications not configured');
    return;
  }
  
  const subscriptions = dbAll(
    'SELECT * FROM push_subscriptions WHERE user_id = ?',
    [userId]
  );
  
  const promises = subscriptions.map(async (sub) => {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    };
    
    try {
      await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
      console.log('Push notification sent successfully');
    } catch (error) {
      console.error('Error sending push notification:', error);
      
      // If subscription is invalid, remove it
      if (error.statusCode === 410) {
        dbRun('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
        console.log('Removed invalid push subscription');
      }
    }
  });
  
  await Promise.all(promises);
}

// Test notification endpoint
router.post('/test', (req, res) => {
  const payload = {
    title: 'Test Notification',
    body: 'This is a test push notification from Portfolio Tracker',
    icon: '/logo.svg',
    badge: '/logo.svg'
  };
  
  sendPushNotification(req.user.id, payload)
    .then(() => {
      res.json({ message: 'Test notification sent' });
    })
    .catch((error) => {
      console.error('Error sending test notification:', error);
      res.status(500).json({ error: 'Failed to send test notification' });
    });
});

module.exports = { router, sendPushNotification };