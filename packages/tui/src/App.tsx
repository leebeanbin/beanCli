import React from 'react';
import { Box } from 'ink';
import { useApp, useInput } from 'ink';
import { AppShell } from './components/layout/AppShell.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ConnectionPickerOverlay } from './components/overlays/ConnectionPickerOverlay.js';
import { DatabasePickerOverlay } from './components/overlays/DatabasePickerOverlay.js';
import { TablePickerOverlay } from './components/overlays/TablePickerOverlay.js';
import { useAppContext } from './context/AppContext.js';

function handleCommand(id: string, ctx: ReturnType<typeof useAppContext>): void {
  switch (id) {
    case 'schema':
      ctx.setFocusedPanel('schema');
      break;
    case 'query':
      ctx.setAppMode('query');
      ctx.setFocusedPanel('query');
      break;
    case 'result':
      ctx.setFocusedPanel('result');
      break;
    case 'ai':
      ctx.setFocusedPanel('ai');
      break;
    case 'tables':
      ctx.setOverlay({ type: 'table-picker' });
      break;
    case 'create-table':
      ctx.setOverlay({ type: 'create-table' });
      break;
    case 'monitor':
      ctx.setAppMode('monitor');
      ctx.setFocusedPanel('query');
      break;
    case 'indexes':
      ctx.setAppMode('index');
      ctx.setFocusedPanel('query');
      break;
    case 'audit':
      ctx.setAppMode('audit');
      ctx.setFocusedPanel('query');
      break;
    case 'recovery':
      ctx.setAppMode('recovery');
      ctx.setFocusedPanel('query');
      break;
    case 'disconnect':
      if (ctx.connectionService?.disconnect) void ctx.connectionService.disconnect();
      ctx.setActiveConnection(null);
      ctx.setTables([]);
      ctx.setConnection(null);
      ctx.setAppMode('query');
      break;
  }
}

export const App: React.FC = () => {
  const { exit } = useApp();
  const ctx = useAppContext();
  const { paletteOpen, setPaletteOpen, startupPhase, focusedPanel, appMode, overlay, setOverlay } =
    ctx;

  useInput((input, key) => {
    // Startup screens handle their own input
    if (startupPhase !== 'ready') return;

    // Ctrl+P: toggle command palette
    if (key.ctrl && input === 'p') {
      setPaletteOpen(!paletteOpen);
      return;
    }

    // Escape closes palette
    if (key.escape && paletteOpen) {
      setPaletteOpen(false);
      return;
    }

    // ? — open/close help overlay (works from anywhere except SQL editor)
    const isTypingSQL = appMode === 'query' && focusedPanel === 'query';
    if (input === '?' && !paletteOpen && !isTypingSQL) {
      if (overlay?.type === 'help') {
        setOverlay(null);
      } else if (!overlay) {
        setOverlay({ type: 'help' });
      }
      return;
    }

    // q quits — but NOT when the user is actively typing in the Query editor
    // (appMode==='query' && focusedPanel==='query' means the SQL text editor is active)
    if (input === 'q' && !paletteOpen && !isTypingSQL && !overlay) {
      exit();
      return;
    }
  });

  // ── Startup phase screens (full-screen, replace main UI) ──────────────────

  if (startupPhase === 'connection-picker') {
    return <ConnectionPickerOverlay />;
  }

  if (startupPhase === 'database-picker') {
    return <DatabasePickerOverlay />;
  }

  if (startupPhase === 'table-picker') {
    return <TablePickerOverlay />;
  }

  // ── Main application UI ───────────────────────────────────────────────────

  return (
    <Box flexDirection="column" flexGrow={1}>
      <AppShell />

      {/* Command palette renders as an overlay below the main layout */}
      {paletteOpen && (
        <Box position="absolute" marginLeft={4} marginTop={1}>
          <CommandPalette
            onClose={() => setPaletteOpen(false)}
            onSelect={(id) => {
              if (id === 'quit') {
                exit();
                return;
              }
              handleCommand(id, ctx);
            }}
          />
        </Box>
      )}
    </Box>
  );
};
