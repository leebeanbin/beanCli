const baseConfig = require('../../jest.config.base');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  displayName: 'api',
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '^@tfsdc/kernel$': '<rootDir>/../../packages/kernel/src',
    '^@tfsdc/domain$': '<rootDir>/../../packages/domain/src',
    '^@tfsdc/application$': '<rootDir>/../../packages/application/src',
    '^@tfsdc/infrastructure$': '<rootDir>/../../packages/infrastructure/src',
    '^@tfsdc/dsl$': '<rootDir>/../../packages/dsl/src',
    '^@tfsdc/audit$': '<rootDir>/../../packages/audit/src',
    '^@tfsdc/policy$': '<rootDir>/../../packages/policy/src',
  },
};
