// ── @tfsdc/tui — Ink-based TUI (Phase 1: DB connection + schema) ─────────────

// Entry
export { start } from './start.js';
export type { StartOptions } from './start.js';

// Core components
export { App } from './App.js';
export { AppContextProvider, useAppContext } from './context/AppContext.js';
export type { PanelId, AppOverlay } from './context/AppContext.js';

// Hooks
export { usePanelFocus } from './hooks/usePanelFocus.js';
export { useConnection } from './hooks/useConnection.js';

// Panels
export { AppShell } from './components/layout/AppShell.js';
export { Panel } from './components/layout/Panel.js';
export { StatusBar } from './components/layout/StatusBar.js';
export { SchemaPanel } from './components/panels/SchemaPanel.js';
export { CommandPalette } from './components/CommandPalette.js';
export { ConnectionFormOverlay } from './components/connection/ConnectionFormOverlay.js';

// Service types (implemented by CLI, injected into TUI)
export type {
  DbType,
  DbConnection,
  ColumnInfo,
  ConnectResult,
  IConnectionService,
} from './services/types.js';
