import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Panel } from './Panel.js';
import { StatusBar } from './StatusBar.js';
import { SchemaPanel } from '../panels/SchemaPanel.js';
import { ConnectionFormOverlay } from '../connection/ConnectionFormOverlay.js';
import { usePanelFocus } from '../../hooks/usePanelFocus.js';
import { useAppContext } from '../../context/AppContext.js';
import { useConnection } from '../../hooks/useConnection.js';

const VERSION = '0.1.2';

// ── Placeholder panel contents ───────────────────────────────────────────────

const QueryContent: React.FC<{ focused: boolean }> = ({ focused }) => (
  <Box flexDirection="column">
    <Text color={focused ? '#6b7280' : '#374151'}>
      {'> '}
      <Text color={focused ? '#e0e0e0' : '#4a5568'}>_</Text>
    </Text>
    <Text color="#2a3a4a">{' '}</Text>
    <Text color="#374151" dimColor>Phase 2: Query editor</Text>
    <Text color="#374151" dimColor>  syntax highlight</Text>
    <Text color="#374151" dimColor>  history  completion</Text>
  </Box>
);

const ResultContent: React.FC = () => (
  <Box flexDirection="column">
    <Text color="#374151">── empty ──</Text>
    <Text color="#2a3a4a">{' '}</Text>
    <Text color="#374151" dimColor>Phase 2: Result viewer</Text>
    <Text color="#374151" dimColor>  scroll / search / export</Text>
    <Text color="#374151" dimColor>  table ↔ vertical mode</Text>
  </Box>
);

const AiContent: React.FC<{ focused: boolean }> = ({ focused }) => (
  <Box flexDirection="column">
    <Text color="#00d4ff" bold>beanllm</Text>
    <Text color="#374151">──────────</Text>
    <Text color="#2a3a4a">{' '}</Text>
    <Text color={focused ? '#6b7280' : '#374151'}>Ask anything about</Text>
    <Text color={focused ? '#6b7280' : '#374151'}>your database.</Text>
    <Text color="#2a3a4a">{' '}</Text>
    <Text color="#374151" dimColor>Phase 3: AI panel</Text>
    <Text color="#374151" dimColor>  NL → SQL</Text>
    <Text color="#374151" dimColor>  error analysis</Text>
  </Box>
);

// ── AppShell ─────────────────────────────────────────────────────────────────

export const AppShell: React.FC = () => {
  const { focusedPanel, nextPanel, prevPanel, focusPanel } = usePanelFocus();
  const { paletteOpen, overlay, setOverlay, connection, env } = useAppContext();
  const { saveConn } = useConnection();

  const isBlocked = paletteOpen || overlay !== null;

  useInput((input, key) => {
    if (isBlocked) return;

    // Panel cycling
    if (key.tab && !key.shift) { nextPanel(); return; }
    if (key.tab && key.shift)  { prevPanel(); return; }

    // Direct panel jump
    if (input === '1') { focusPanel('schema'); return; }
    if (input === '2') { focusPanel('query');  return; }
    if (input === '3') { focusPanel('result'); return; }
    if (input === '4') { focusPanel('ai');     return; }
  });

  // ── Overlay: ConnectionForm ─────────────────────────────────────────────────
  const showConnForm = overlay?.type === 'connection-form';

  return (
    <Box flexDirection="column" flexGrow={1}>

      {/* ── 3-pane area ─────────────────────────────────── */}
      <Box flexGrow={1}>

        {/* Left: Schema tree */}
        <Panel
          title="Schema"
          isFocused={focusedPanel === 'schema'}
          hint="1"
          width={26}
        >
          <SchemaPanel />
        </Panel>

        {/* Center: Query (top) + Result (bottom) */}
        <Box flexDirection="column" flexGrow={1}>
          <Panel
            title="Query Editor"
            isFocused={focusedPanel === 'query'}
            hint="2"
            flexGrow={1}
          >
            <QueryContent focused={focusedPanel === 'query'} />
          </Panel>

          <Panel
            title="Results"
            isFocused={focusedPanel === 'result'}
            hint="3"
            flexGrow={1}
          >
            <ResultContent />
          </Panel>
        </Box>

        {/* Right: AI Copilot */}
        <Panel
          title="AI · beanllm"
          isFocused={focusedPanel === 'ai'}
          hint="4"
          width={24}
        >
          <AiContent focused={focusedPanel === 'ai'} />
        </Panel>

      </Box>

      {/* ── Status bar ──────────────────────────────────── */}
      <StatusBar
        version={VERSION}
        env={env}
        connection={connection}
        focused={focusedPanel}
      />

      {/* ── ConnectionForm overlay ───────────────────────── */}
      {showConnForm && (
        <Box position="absolute" marginLeft={4} marginTop={2}>
          <ConnectionFormOverlay
            initial={overlay?.conn}
            onSave={(conn) => {
              saveConn(conn);
              setOverlay(null);
            }}
            onCancel={() => setOverlay(null)}
          />
        </Box>
      )}

    </Box>
  );
};
