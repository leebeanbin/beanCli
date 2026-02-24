import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { AppContextProvider } from './context/AppContext.js';

/** Start the Ink TUI — call this from the CLI entry point. */
export function start(): void {
  render(
    <AppContextProvider>
      <App />
    </AppContextProvider>,
  );
}
