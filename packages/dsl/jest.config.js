const baseConfig = require('../../jest.config.base');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  displayName: 'dsl',
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '^@tfsdc/kernel$': '<rootDir>/../kernel/src',
    '^@tfsdc/domain$': '<rootDir>/../domain/src',
  },
};
