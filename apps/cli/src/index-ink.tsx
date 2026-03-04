/**
 * beanCLI — Ink TUI entry point (Phase 1+)
 *
 * Real mode:  pnpm dev:ink
 *   Requires: API server (localhost:3100) + real DB running
 *
 * Mock mode:  pnpm dev:ink --mock   OR   MOCK=true pnpm dev:ink
 *   No external services needed. Uses in-memory demo data.
 *
 * Wires @tfsdc/infrastructure (DB adapters) into @tfsdc/tui via
 * the IConnectionService interface (Dependency Injection).
 * packages/tui has no direct DB driver dependencies.
 */
import { start } from '@tfsdc/tui';
import { createCliConnectionService } from './cliConnectionService.js';
import { createMockConnectionService } from './mockConnectionService.js';
import { loadHistory, appendHistory } from './historyStore.js';

const isMock =
  process.argv.includes('--mock') || process.env['MOCK'] === 'true' || process.env['MOCK'] === '1';

start({
  connectionService: isMock ? createMockConnectionService() : createCliConnectionService(),
  initialHistory: loadHistory(),
  onHistoryAdd: appendHistory,
});
