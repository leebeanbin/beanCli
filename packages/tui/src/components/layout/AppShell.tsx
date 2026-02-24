import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Panel } from './Panel.js';
import { StatusBar } from './StatusBar.js';
import { usePanelFocus } from '../../hooks/usePanelFocus.js';
import { useAppContext } from '../../context/AppContext.js';

const VERSION = '0.1.2';

// ── Placeholder panel contents ───────────────────────────────────────────────

const SchemaContent: React.FC<{ focused: boolean }> = ({ focused }) => (
  <Box flexDirection="column" gap={0}>
    <Text color="#4a5568">○  no connection</Text>
    <Text color="#2a3a4a">{' '}</Text>
    <Text color={focused ? '#6b7280' : '#374151'}>
      Ctrl+P → Connect Database
    </Text>
    <Text color="#2a3a4a">{' '}</Text>
    <Text color="#374151" dimColor>Phase 1: Schema tree</Text>
    <Text color="#374151" dimColor>  tables / views / indexes</Text>
    <Text color="#374151" dimColor>  columns / types</Text>
  </Box>
);

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
    <Text color={focused ? '#6b7280' : '#374151'}>
      Ask anything about
    </Text>
    <Text color={focused ? '#6b7280' : '#374151'}>
      your database.
    </Text>
    <Text color="#2a3a4a">{' '}</Text>
    <Text color="#374151" dimColor>Phase 3: AI panel</Text>
    <Text color="#374151" dimColor>  NL → SQL</Text>
    <Text color="#374151" dimColor>  error analysis</Text>
    <Text color="#374151" dimColor>  query explain</Text>
  </Box>
);

// ── AppShell ─────────────────────────────────────────────────────────────────

export const AppShell: React.FC = () => {
  const { focusedPanel, nextPanel, prevPanel, focusPanel } = usePanelFocus();
  const { paletteOpen, connection, env } = useAppContext();

  useInput((input, key) => {
    if (paletteOpen) return; // palette captures all input

    // Panel cycling
    if (key.tab && !key.shift) { nextPanel(); return; }
    if (key.tab && key.shift)  { prevPanel(); return; }

    // Direct panel jump by number
    if (input === '1') { focusPanel('schema'); return; }
    if (input === '2') { focusPanel('query');  return; }
    if (input === '3') { focusPanel('result'); return; }
    if (input === '4') { focusPanel('ai');     return; }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>

      {/* ── 3-pane area ─────────────────────────────────── */}
      <Box flexGrow={1}>

        {/* Left: Schema 22 cols */}
        <Panel
          title="Schema"
          isFocused={focusedPanel === 'schema'}
          hint="1"
          width={24}
        >
          <SchemaContent focused={focusedPanel === 'schema'} />
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

        {/* Right: AI 22 cols */}
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

    </Box>
  );
};
