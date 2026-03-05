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
import { loadPlugin, initDbAdapters } from '@tfsdc/infrastructure';

const isMock =
  process.argv.includes('--mock') || process.env['MOCK'] === 'true' || process.env['MOCK'] === '1';

// Collect --plugin <path> arguments (may appear multiple times)
const pluginPaths: string[] = [];
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--plugin' && process.argv[i + 1]) {
    pluginPaths.push(process.argv[i + 1]!);
    i++; // skip next arg
  }
}

// Load plugins after adapters are initialized
if (!isMock && pluginPaths.length > 0) {
  initDbAdapters();
  for (const p of pluginPaths) {
    try {
      await loadPlugin(p);
    } catch (e) {
      process.stderr.write(`[plugin] Failed to load "${p}": ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }
}

start({
  connectionService: isMock ? createMockConnectionService() : createCliConnectionService(),
  initialHistory: loadHistory(),
  onHistoryAdd: appendHistory,
});
