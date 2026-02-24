import React, { createContext, useContext, useState } from 'react';
import type { DbConnection, IConnectionService } from '../services/types.js';

export type PanelId = 'schema' | 'query' | 'result' | 'ai';

// Overlay types rendered by AppShell at the root level
export type AppOverlay =
  | { type: 'connection-form'; conn: DbConnection | null }  // null = new connection
  | null;

interface AppState {
  // ── Panel focus ──────────────────────────────────
  focusedPanel:    PanelId;
  setFocusedPanel: (panel: PanelId) => void;

  // ── Command palette ──────────────────────────────
  paletteOpen:    boolean;
  setPaletteOpen: (open: boolean) => void;

  // ── Overlays (CommandPalette + ConnectionForm) ───
  overlay:    AppOverlay;
  setOverlay: (ov: AppOverlay) => void;

  // ── DB connection state ──────────────────────────
  connectionService:    IConnectionService | null;
  connections:          DbConnection[];
  setConnections:       (conns: DbConnection[]) => void;
  activeConnection:     DbConnection | null;
  setActiveConnection:  (conn: DbConnection | null) => void;
  tables:               string[];
  setTables:            (tables: string[]) => void;

  // ── Status bar label ─────────────────────────────
  connection:    string | null;      // display label for status bar
  setConnection: (label: string | null) => void;

  // ── App env ──────────────────────────────────────
  env: string;
}

const AppContext = createContext<AppState | null>(null);

interface ProviderProps {
  children:          React.ReactNode;
  connectionService?: IConnectionService;
}

export const AppContextProvider: React.FC<ProviderProps> = ({
  children,
  connectionService = null,
}) => {
  const [focusedPanel,   setFocusedPanel]   = useState<PanelId>('schema');
  const [paletteOpen,    setPaletteOpen]    = useState(false);
  const [overlay,        setOverlay]        = useState<AppOverlay>(null);
  const [connections,    setConnections]    = useState<DbConnection[]>(() =>
    connectionService?.loadConnections() ?? [],
  );
  const [activeConnection, setActiveConnection] = useState<DbConnection | null>(null);
  const [tables,         setTables]         = useState<string[]>([]);
  const [connection,     setConnection]     = useState<string | null>(null);

  const env = (process.env['APP_ENV'] ?? 'dev').toUpperCase();

  return (
    <AppContext.Provider
      value={{
        focusedPanel,   setFocusedPanel,
        paletteOpen,    setPaletteOpen,
        overlay,        setOverlay,
        connectionService,
        connections,    setConnections,
        activeConnection, setActiveConnection,
        tables,         setTables,
        connection,     setConnection,
        env,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useAppContext(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppContextProvider');
  return ctx;
}
