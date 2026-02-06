module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    // Security
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    
    // Best practices
    'eqeqeq': ['error', 'always'],
    'no-var': 'error',
    'prefer-const': 'warn',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    
    // Style (relaxed for existing code)
    'semi': ['warn', 'always'],
    'quotes': ['warn', 'single', { avoidEscape: true }],
    'indent': ['warn', 2, { SwitchCase: 1 }],
    
    // Allow console in server code
    'no-console': 'off',
  },
  ignorePatterns: [
    'node_modules/',
    'logs/',
    'coverage/',
    'playwright-report/',
  ],
};
