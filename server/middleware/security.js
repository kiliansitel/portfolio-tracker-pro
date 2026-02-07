/**
 * Security Middleware
 * Rate limiting, input sanitization, and security headers
 */

const rateLimit = require('express-rate-limit');
const hpp = require('hpp');

// Rate limiters for different endpoints
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 attempts per 5 min window
  message: { error: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: process.env.APP_ENV === 'beta' ? 1000 : 100, // Higher limit for beta testing
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute  
  max: process.env.APP_ENV === 'beta' ? 300 : 30, // Higher limit for beta testing
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Input sanitization - remove dangerous characters
function sanitizeInput(req, res, next) {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Remove null bytes and other dangerous chars
      return obj.replace(/\0/g, '').trim();
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key of Object.keys(obj)) {
        obj[key] = sanitize(obj[key]);
      }
    }
    return obj;
  };
  
  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);
  
  next();
}

// Security headers configuration for Helmet
const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],  // unsafe-inline for onclick handlers
      styleSrc: ["'self'", "'unsafe-inline'"],  // inline styles used throughout
      imgSrc: [
        "'self'",
        "data:",
        "https://assets.parqet.com",
        "https://s3-symbol-logo.tradingview.com",
        "https://logo.clearbit.com",
        "https://*.yahoo.com",
      ],
      connectSrc: [
        "'self'",
        "https://query1.finance.yahoo.com",
        "https://query2.finance.yahoo.com",
        "https://fc.yahoo.com",
        "https://news.google.com",
        "https://corsproxy.io",
        "https://api.allorigins.win",
      ],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"],  // Required for onclick handlers in HTML
      upgradeInsecureRequests: null,  // Disable — app served over HTTP internally
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
};

module.exports = {
  authLimiter,
  apiLimiter,
  strictLimiter,
  sanitizeInput,
  helmetConfig,
  hpp,
};
