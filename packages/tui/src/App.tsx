import React from 'react';
import { Box } from 'ink';
import { useApp, useInput } from 'ink';
import { AppShell } from './components/layout/AppShell.js';
import { CommandPalette } from './components/CommandPalette.js';
import { useAppContext } from './context/AppContext.js';

function handleCommand(id: string, ctx: ReturnType<typeof useAppContext>): void {
  switch (id) {
    case 'schema':  ctx.setFocusedPanel('schema'); break;
    case 'query':   ctx.setFocusedPanel('query');  break;
    case 'result':  ctx.setFocusedPanel('result'); break;
    case 'ai':      ctx.setFocusedPanel('ai');     break;
    // Future: connect, history, monitor, indexes, quit handled by caller
  }
}

export const App: React.FC = () => {
  const { exit } = useApp();
  const ctx = useAppContext();
  const { paletteOpen, setPaletteOpen } = ctx;

  useInput((input, key) => {
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

    // q quits (only when palette is closed)
    if (input === 'q' && !paletteOpen) {
      exit();
      return;
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <AppShell />

      {/* Command palette renders as an overlay below the main layout */}
      {paletteOpen && (
        <Box
          position="absolute"
          marginLeft={4}
          marginTop={1}
        >
          <CommandPalette
            onClose={() => setPaletteOpen(false)}
            onSelect={(id) => {
              if (id === 'quit') { exit(); return; }
              handleCommand(id, ctx);
            }}
          />
        </Box>
      )}
    </Box>
  );
};
