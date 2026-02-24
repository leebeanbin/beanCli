import React from 'react';
import { Box, Text } from 'ink';
import type { PanelId } from '../../context/AppContext.js';

// Contextual keyhints per focused panel
const PANEL_HINTS: Record<PanelId, string> = {
  schema: 'j/k:navigate  Enter:select  r:refresh  e:expand',
  query:  'Enter:run  Ctrl+L:clear  ↑/↓:history  Ctrl+Space:complete',
  result: 'j/k:scroll  /:search  v:vertical  y:copy  e:export',
  ai:     'Enter:send  Esc:clear  y:insert SQL  m:change model',
};

interface StatusBarProps {
  version: string;
  env: string;
  connection: string | null;
  focused: PanelId;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  version, env, connection, focused,
}) => (
  <Box
    borderStyle="single"
    borderColor="#1a2a3a"
    borderTop
    borderBottom={false}
    borderLeft={false}
    borderRight={false}
    paddingX={1}
  >
    {/* Left: identity */}
    <Box gap={1} flexShrink={0}>
      <Text color="#00d4ff" bold>beanCLI</Text>
      <Text color="#374151">v{version}</Text>
      <Text> </Text>
      <Text
        color={env === 'PROD' ? '#ef4444' : '#f59e0b'}
        bold
      >
        [{env}]
      </Text>
      <Text> </Text>
      <Text color={connection ? '#10b981' : '#6b7280'}>
        {connection ? `● ${connection}` : '○ no connection'}
      </Text>
    </Box>

    {/* Spacer */}
    <Box flexGrow={1} />

    {/* Center: panel hints */}
    <Text color="#4a5568">{PANEL_HINTS[focused]}</Text>

    {/* Spacer */}
    <Box flexGrow={1} />

    {/* Right: global shortcuts */}
    <Text color="#374151">
      Tab:panel  Ctrl+P:cmd  q:quit
    </Text>
  </Box>
);
