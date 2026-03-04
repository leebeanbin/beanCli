import React from 'react';
import { Box, Text } from 'ink';
import type { PanelId, AppMode } from '../../context/AppContext.js';
import type { UserRole } from '../../services/types.js';

const PANEL_HINTS: Record<PanelId, string> = {
  schema: 'j/k:navigate  Enter:browse  e:edit  d:delete  n:new',
  query: 'Enter:run  ↑/↓:history  Ctrl+L:clear',
  result: 'j/k:scroll  /:search  v:vertical',
  ai: 'Enter:send  Esc:clear  /model:switch',
};

const EXPLORE_HINTS: Record<'query' | 'result', string> = {
  query: 'j/k:row  v:detail  [/]:table  /:filter  r:reload  Q:query mode',
  result: 'j/k:row  v:detail  [/]:table  /:filter  r:reload  Q:query mode',
};

const ROLE_COLOR: Record<UserRole, string> = {
  DBA: '#ef4444',
  MANAGER: '#f59e0b',
  ANALYST: '#10b981',
  SECURITY_ADMIN: '#a855f7',
};

interface StatusBarProps {
  version: string;
  env: string;
  connection: string | null;
  focused: PanelId;
  appMode: AppMode;
  userRole?: UserRole | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  version,
  env,
  connection,
  focused,
  appMode,
  userRole,
}) => {
  const hint =
    appMode === 'browse' && (focused === 'query' || focused === 'result')
      ? EXPLORE_HINTS[focused]
      : PANEL_HINTS[focused];

  return (
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
        <Text color="#00d4ff" bold>
          beanCLI
        </Text>
        <Text color="#374151">v{version}</Text>
        <Text> </Text>
        <Text color={env === 'PROD' ? '#ef4444' : '#f59e0b'} bold>
          [{env}]
        </Text>
        <Text> </Text>
        <Text color={connection ? '#10b981' : '#6b7280'}>
          {connection ? `● ${connection}` : '○ no connection'}
        </Text>
        {userRole && (
          <>
            <Text color="#374151">{'  │  '}</Text>
            <Text color={ROLE_COLOR[userRole]} bold>
              {userRole}
            </Text>
          </>
        )}
      </Box>

      {/* Spacer */}
      <Box flexGrow={1} />

      {/* Center: panel hints */}
      <Text color="#4a5568">{hint}</Text>

      {/* Spacer */}
      <Box flexGrow={1} />

      {/* Right: global shortcuts */}
      <Text color="#374151">Tab:panel Ctrl+P:cmd q:quit</Text>
    </Box>
  );
};
