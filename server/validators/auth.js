/**
 * Authentication Validators
 */

const { body, validationResult } = require('express-validator');

// Handle validation errors
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

// Registration validation
const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3-30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  
  body('email')
    .trim()
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail()
    .isLength({ max: 254 })
    .withMessage('Email too long'),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[a-z]/)
    .withMessage('Password must contain a lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain a number'),
  
  validate,
];

// Login validation
const loginValidation = [
  body('login')
    .trim()
    .notEmpty()
    .withMessage('Username or email required')
    .isLength({ max: 254 })
    .withMessage('Input too long'),
  
  body('password')
    .notEmpty()
    .withMessage('Password required'),
  
  validate,
];

module.exports = {
  registerValidation,
  loginValidation,
  validate,
};
