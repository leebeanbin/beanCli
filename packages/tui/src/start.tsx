import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { AppContextProvider } from './context/AppContext.js';
import type { IConnectionService } from './services/types.js';

export interface StartOptions {
  /** Inject a connection service (filesystem + DB adapter access). */
  connectionService?: IConnectionService;
  /** Pre-loaded query history entries (loaded from disk by the CLI entry point). */
  initialHistory?: string[];
  /** Called after each successful query to persist the entry (handled by CLI entry point). */
  onHistoryAdd?: (sql: string) => void;
}

/** Start the Ink TUI — call this from the CLI entry point. */
export function start(options?: StartOptions): void {
  // Enter the terminal alternate screen buffer so renders don't accumulate.
  // Mirrors what { fullscreen: true } did in Ink v4.
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[?1049h\x1b[H');
  }

  const restore = (): void => {
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b[?1049l');
    }
  };

  // Restore on unexpected exit (Ctrl+C, SIGTERM, etc.)
  process.once('exit', restore);
  process.once('SIGINT', () => {
    restore();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    restore();
    process.exit(0);
  });

  const instance = render(
    <AppContextProvider
      connectionService={options?.connectionService}
      initialHistory={options?.initialHistory}
      onHistoryAdd={options?.onHistoryAdd}
    >
      <App />
    </AppContextProvider>,
  );

  void instance.waitUntilExit().then(() => {
    restore();
  });
}
