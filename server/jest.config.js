module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    '*.js',
    'middleware/**/*.js',
    'validators/**/*.js',
    'utils/**/*.js',
    '!jest.config.js',
    '!playwright.config.js',
    '!.eslintrc.js',
  ],
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 15,
      lines: 20,
      statements: 20,
    },
  },
  testTimeout: 30000,
  verbose: true,
};
