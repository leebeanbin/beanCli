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
};
