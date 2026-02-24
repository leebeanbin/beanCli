import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { AppContextProvider } from './context/AppContext.js';
import type { IConnectionService } from './services/types.js';

export interface StartOptions {
  /** Inject a connection service (filesystem + DB adapter access). */
  connectionService?: IConnectionService;
}

/** Start the Ink TUI — call this from the CLI entry point. */
export function start(options?: StartOptions): void {
  render(
    <AppContextProvider connectionService={options?.connectionService}>
      <App />
    </AppContextProvider>,
  );
}
