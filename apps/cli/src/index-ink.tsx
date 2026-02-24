/**
 * beanCLI — Ink TUI entry point (Phase 1+)
 *
 * Run:  pnpm dev:cli:ink
 *
 * Wires @tfsdc/infrastructure (DB adapters) into @tfsdc/tui via
 * the IConnectionService interface (Dependency Injection).
 * packages/tui has no direct DB driver dependencies.
 */
import { start } from '@tfsdc/tui';
import { createCliConnectionService } from './cliConnectionService.js';

start({
  connectionService: createCliConnectionService(),
});
