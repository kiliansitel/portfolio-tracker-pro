/**
 * Portfolio & Position Validators
 */

const { body, param, query, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

// Portfolio validation
const createPortfolioValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Portfolio name must be 1-100 characters')
    .escape(),
  
  body('cash')
    .optional()
    .isFloat({ min: 0, max: 999999999 })
    .withMessage('Cash must be a positive number'),
  
  validate,
];

// Position validation
const positionValidation = [
  body('symbol')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Symbol must be 1-20 characters')
    .matches(/^[A-Za-z0-9\-\.\^=]+$/)
    .withMessage('Invalid symbol format'),
  
  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Name too long')
    .escape(),
  
  body('type')
    .optional()
    .isIn(['stock', 'crypto', 'etf', 'option', 'bond', 'commodity'])
    .withMessage('Invalid position type'),
  
  body('quantity')
    .isFloat({ min: 0.00000001, max: 999999999 })
    .withMessage('Quantity must be a positive number'),
  
  body('entry_price')
    .isFloat({ min: 0, max: 999999999 })
    .withMessage('Entry price must be a positive number'),
  
  body('entry_date')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format'),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes too long')
    .escape(),
  
  body('strike_price')
    .optional()
    .isFloat({ min: 0, max: 999999 })
    .withMessage('Strike price must be positive'),
  
  body('expiry_date')
    .optional()
    .isISO8601()
    .withMessage('Invalid expiry date format'),
  
  body('current_price')
    .optional()
    .isFloat({ min: 0, max: 999999999 })
    .withMessage('Current price must be positive'),
  
  body('multiplier')
    .optional()
    .isFloat({ min: 1, max: 10000 })
    .withMessage('Multiplier must be between 1 and 10000'),
  
  validate,
];

// Watchlist item validation
const watchlistItemValidation = [
  body('symbol')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Symbol must be 1-20 characters')
    .matches(/^[A-Za-z0-9\-\.\^=]+$/)
    .withMessage('Invalid symbol format'),
  
  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Name too long')
    .escape(),
  
  body('category')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Category too long')
    .escape(),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes too long')
    .escape(),
  
  validate,
];

// Alert validation
const alertValidation = [
  body('symbol')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Symbol must be 1-20 characters')
    .matches(/^[A-Za-z0-9\-\.\^=]+$/)
    .withMessage('Invalid symbol format'),
  
  body('target_price')
    .isFloat({ min: 0.00001, max: 999999999 })
    .withMessage('Target price must be positive'),
  
  body('condition')
    .isIn(['above', 'below'])
    .withMessage('Condition must be "above" or "below"'),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes too long')
    .escape(),
  
  validate,
];

// Transaction validation
const transactionValidation = [
  body('symbol')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Symbol must be 1-20 characters')
    .matches(/^[A-Za-z0-9\-\.\^=]+$/)
    .withMessage('Invalid symbol format'),
  
  body('type')
    .isIn(['buy', 'sell'])
    .withMessage('Type must be "buy" or "sell"'),
  
  body('quantity')
    .isFloat({ min: 0.00000001, max: 999999999 })
    .withMessage('Quantity must be positive'),
  
  body('price')
    .isFloat({ min: 0, max: 999999999 })
    .withMessage('Price must be positive'),
  
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format'),
  
  body('fees')
    .optional()
    .isFloat({ min: 0, max: 999999 })
    .withMessage('Fees must be positive'),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes too long')
    .escape(),
  
  validate,
];

// ID parameter validation
const idParamValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid ID'),
  validate,
];

module.exports = {
  createPortfolioValidation,
  positionValidation,
  watchlistItemValidation,
  alertValidation,
  transactionValidation,
  idParamValidation,
  validate,
};
