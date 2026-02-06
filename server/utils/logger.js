/**
 * Logger Utility
 * Structured logging with Winston
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = process.env.LOGS_DIR || path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
    }),
    // File output - errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    }),
    // File output - combined
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  ],
});

// Request logging middleware
function requestLogger(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')?.substring(0, 100),
    };
    
    if (res.statusCode >= 400) {
      logger.warn('Request completed with error', logData);
    } else if (duration > 1000) {
      logger.warn('Slow request', logData);
    } else {
      logger.debug('Request completed', logData);
    }
  });
  
  next();
}

// Security event logging (with optional req for IP)
function logSecurityEvent(req, event, data = {}) {
  const ip = req?.ip || req?.connection?.remoteAddress || 'unknown';
  logger.warn(`SECURITY: ${event}`, { ip, ...data });
}

// Audit logging for sensitive actions
function logAudit(action, userId, data = {}) {
  logger.info(`AUDIT: ${action}`, { userId, ...data });
}

module.exports = {
  logger,
  requestLogger,
  logSecurityEvent,
  logAudit,
};
