module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    '*.js',
    'routes/**/*.js',
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
      lines: 25,
      statements: 25,
    },
  },
  testTimeout: 30000,
  verbose: true,
  // Force Jest to exit after tests complete (avoids hanging on setInterval/setTimeout)
  forceExit: true,
  detectOpenHandles: false,
};
