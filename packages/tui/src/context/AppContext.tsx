import React, { createContext, useContext, useState } from 'react';

export type PanelId = 'schema' | 'query' | 'result' | 'ai';

interface AppState {
  // Panel focus
  focusedPanel: PanelId;
  setFocusedPanel: (panel: PanelId) => void;
  // Command palette
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  // Active DB connection label
  connection: string | null;
  setConnection: (label: string | null) => void;
  // App env
  env: string;
}

const AppContext = createContext<AppState | null>(null);

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [focusedPanel, setFocusedPanel] = useState<PanelId>('query');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [connection, setConnection] = useState<string | null>(null);

  const env = (process.env['APP_ENV'] ?? 'dev').toUpperCase();

  return (
    <AppContext.Provider
      value={{
        focusedPanel, setFocusedPanel,
        paletteOpen, setPaletteOpen,
        connection, setConnection,
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
