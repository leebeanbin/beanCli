const baseConfig = require('../../jest.config.base');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  displayName: 'ui-tui',
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '^@tfsdc/kernel$': '<rootDir>/../kernel/src',
    '^@tfsdc/domain$': '<rootDir>/../domain/src',
    '^@tfsdc/application$': '<rootDir>/../application/src',
    '^@tfsdc/testing$': '<rootDir>/../testing/src',
    '^@tfsdc/ui-tui$': '<rootDir>/src',
  },
};
