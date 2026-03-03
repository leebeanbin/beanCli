/**
 * Minimal entry point for Jest (CommonJS) tests.
 * Exports only types + pure utilities — no React, no Ink, no render.
 * Referenced by apps/cli/jest.config.cjs moduleNameMapper.
 */

// Service types — used by cliConnectionService & mockConnectionService
export type {
  DbType,
  DbConnection,
  ColumnInfo,
  ConnectResult,
  QueryType,
  QueryResult,
  AiMessage,
  AiStreamCallbacks,
  UserRole,
  LoginResult,
  IConnectionService,
} from './services/types.js';

// Pure utility — used by cliConnectionService
export { detectQueryType, formatValue } from './utils/formatValue.js';
