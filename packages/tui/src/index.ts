// ── @tfsdc/tui — Ink-based TUI (Phase 3+: AI, Monitor, Index, Audit, Recovery) ─

// Entry
export { start } from './start.js';
export type { StartOptions } from './start.js';

// Core components
export { App } from './App.js';
export { AppContextProvider, useAppContext } from './context/AppContext.js';
export type { PanelId, AppMode, AppOverlay } from './context/AppContext.js';

// Hooks
export { usePanelFocus } from './hooks/usePanelFocus.js';
export { useConnection } from './hooks/useConnection.js';
export { useQuery } from './hooks/useQuery.js';

// Panels
export { AppShell } from './components/layout/AppShell.js';
export { Panel } from './components/layout/Panel.js';
export { StatusBar } from './components/layout/StatusBar.js';
export { SchemaPanel } from './components/panels/SchemaPanel.js';
export { QueryPanel } from './components/panels/QueryPanel.js';
export { ResultPanel } from './components/panels/ResultPanel.js';
export { ExplorePanel } from './components/panels/ExplorePanel.js';
export { AiPanel } from './components/panels/AiPanel.js';
export { MonitorPanel } from './components/panels/MonitorPanel.js';
export { IndexPanel } from './components/panels/IndexPanel.js';
export { AuditPanel } from './components/panels/AuditPanel.js';
export { RecoveryPanel } from './components/panels/RecoveryPanel.js';
export { CommandPalette } from './components/CommandPalette.js';
export { ConnectionFormOverlay } from './components/connection/ConnectionFormOverlay.js';
export { LoginOverlay } from './components/overlays/LoginOverlay.js';
export { ConnectionPickerOverlay } from './components/overlays/ConnectionPickerOverlay.js';
export { TablePickerOverlay } from './components/overlays/TablePickerOverlay.js';

// Utilities
export { formatValue, detectQueryType } from './utils/formatValue.js';

// Service types (implemented by CLI, injected into TUI)
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

// Context types
export type { StartupPhase } from './context/AppContext.js';
