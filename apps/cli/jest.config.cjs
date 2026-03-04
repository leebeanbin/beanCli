const baseConfig = require('../../jest.config.base');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  displayName: 'cli',
  // Override transform to use the test-specific tsconfig (CommonJS output)
  // so Jest can process files from this ESM package ("type":"module") correctly.
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
        useESM: false,
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    // Map .js → .ts/.tsx (handles ESM-style imports with .js extension)
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Use a minimal entry (no React/Ink) so Jest CJS runtime can load it
    '^@tfsdc/tui$': '<rootDir>/../../packages/tui/src/test-entry',
    '^@tfsdc/infrastructure$': '<rootDir>/../../packages/infrastructure/src',
    '^@tfsdc/kernel$': '<rootDir>/../../packages/kernel/src',
  },
};
