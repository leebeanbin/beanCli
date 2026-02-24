// Entry point for @tfsdc/tui — Ink-based TUI (Phase 0 skeleton)
export { start } from './start.js';
export { App } from './App.js';
export { AppContextProvider, useAppContext } from './context/AppContext.js';
export type { PanelId } from './context/AppContext.js';
export { usePanelFocus } from './hooks/usePanelFocus.js';
export { AppShell } from './components/layout/AppShell.js';
export { Panel } from './components/layout/Panel.js';
export { StatusBar } from './components/layout/StatusBar.js';
export { CommandPalette } from './components/CommandPalette.js';
