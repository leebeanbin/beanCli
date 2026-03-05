import React, { createContext, useContext, useState } from 'react';
import type { DbConnection, IConnectionService, QueryResult, UserRole } from '../services/types.js';

export type PanelId = 'schema' | 'query' | 'result' | 'ai';

/** Center pane display mode */
export type AppMode = 'browse' | 'query' | 'monitor' | 'index' | 'audit' | 'recovery' | 'changes' | 'approvals';

/** Startup boot phase — gates what the user sees on first launch */
export type StartupPhase = 'connection-picker' | 'database-picker' | 'table-picker' | 'ready';

export type AppOverlay =
  | { type: 'connection-form'; conn: DbConnection | null }
  | { type: 'table-picker' }
  | { type: 'create-table' }
  | { type: 'help' }
  | null;

interface AppState {
  // ── Startup phase ─────────────────────────────────
  startupPhase: StartupPhase;
  setStartupPhase: (phase: StartupPhase) => void;

  // ── Auth ──────────────────────────────────────────
  userRole: UserRole | null;
  setUserRole: (role: UserRole | null) => void;
  authToken: string | null;
  setAuthToken: (token: string | null) => void;

  // ── Panel focus ──────────────────────────────────
  focusedPanel: PanelId;
  setFocusedPanel: (panel: PanelId) => void;

  // ── Center mode ──────────────────────────────────
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  browseTable: string | null;
  setBrowseTable: (table: string | null) => void;

  // ── Palette / overlays ───────────────────────────
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  overlay: AppOverlay;
  setOverlay: (ov: AppOverlay) => void;

  // ── DB connection state ──────────────────────────
  connectionService: IConnectionService | null;
  connections: DbConnection[];
  setConnections: (conns: DbConnection[]) => void;
  activeConnection: DbConnection | null;
  setActiveConnection: (conn: DbConnection | null) => void;
  tables: string[];
  setTables: (tables: string[]) => void;
  connection: string | null; // status bar label
  setConnection: (label: string | null) => void;

  // ── Query state ──────────────────────────────────
  queryResult: QueryResult | null;
  setQueryResult: (r: QueryResult | null) => void;
  queryLoading: boolean;
  setQueryLoading: (v: boolean) => void;
  queryError: string | null;
  setQueryError: (e: string | null) => void;

  /** SQL pre-filled from SchemaPanel table select */
  pendingSql: string | null;
  setPendingSql: (sql: string | null) => void;

  /** DML confirmation: estimated row count pending user confirmation */
  dmlConfirm: { sql: string; rowCount: number } | null;
  setDmlConfirm: (v: { sql: string; rowCount: number } | null) => void;

  /** Persistent history: pre-loaded entries and callback to persist new ones */
  initialHistory: string[];
  onHistoryAdd: ((sql: string) => void) | undefined;

  /** ResultPanel: toggle between horizontal table and vertical (psql \x) display */
  expandedMode: boolean;
  setExpandedMode: (v: boolean | ((prev: boolean) => boolean)) => void;

  // ── App env ──────────────────────────────────────
  env: string;
}

const AppContext = createContext<AppState | null>(null);

interface ProviderProps {
  children: React.ReactNode;
  connectionService?: IConnectionService;
  initialHistory?: string[];
  onHistoryAdd?: (sql: string) => void;
}

export const AppContextProvider: React.FC<ProviderProps> = ({
  children,
  connectionService = null,
  initialHistory = [],
  onHistoryAdd,
}) => {
  const [startupPhase, setStartupPhase] = useState<StartupPhase>('connection-picker');
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [focusedPanel, setFocusedPanel] = useState<PanelId>('schema');
  const [appMode, setAppMode] = useState<AppMode>('query');
  const [browseTable, setBrowseTable] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [overlay, setOverlay] = useState<AppOverlay>(null);
  const [connections, setConnections] = useState<DbConnection[]>(
    () => connectionService?.loadConnections() ?? [],
  );
  const [activeConnection, setActiveConnection] = useState<DbConnection | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [connection, setConnection] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [pendingSql, setPendingSql] = useState<string | null>(null);
  const [expandedMode, setExpandedMode] = useState(false);
  const [dmlConfirm, setDmlConfirm] = useState<{ sql: string; rowCount: number } | null>(null);

  const env = (process.env['APP_ENV'] ?? 'dev').toUpperCase();

  return (
    <AppContext.Provider
      value={{
        startupPhase,
        setStartupPhase,
        userRole,
        setUserRole,
        authToken,
        setAuthToken,
        focusedPanel,
        setFocusedPanel,
        appMode,
        setAppMode,
        browseTable,
        setBrowseTable,
        paletteOpen,
        setPaletteOpen,
        overlay,
        setOverlay,
        connectionService,
        connections,
        setConnections,
        activeConnection,
        setActiveConnection,
        tables,
        setTables,
        connection,
        setConnection,
        queryResult,
        setQueryResult,
        queryLoading,
        setQueryLoading,
        queryError,
        setQueryError,
        pendingSql,
        setPendingSql,
        expandedMode,
        setExpandedMode,
        dmlConfirm,
        setDmlConfirm,
        initialHistory,
        onHistoryAdd,
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
