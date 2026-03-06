const baseConfig = require('../../jest.config.base');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  displayName: 'infrastructure',
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '^@tfsdc/kernel$': '<rootDir>/../kernel/src',
    '^@tfsdc/domain$': '<rootDir>/../domain/src',
    '^@tfsdc/application$': '<rootDir>/../application/src',
  },
  // Bench tests measure raw throughput and depend on machine performance.
  // They are excluded from the regular test suite to prevent flaky CI failures.
  // Run locally with: jest --testPathPattern=bench
  testPathIgnorePatterns: ['\\.bench\\.test\\.ts$'],
};
