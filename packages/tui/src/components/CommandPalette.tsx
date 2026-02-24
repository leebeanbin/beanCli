import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';

interface Command {
  id:       string;
  label:    string;
  group:    string;
  key?:     string;   // keyboard shortcut hint
}

const COMMANDS: Command[] = [
  { id: 'connect',  label: 'Connect to Database',    group: 'Connection', key: 'c' },
  { id: 'disconnect',label:'Disconnect',             group: 'Connection' },
  { id: 'schema',   label: 'Browse Schema',           group: 'Navigation', key: 's' },
  { id: 'query',    label: 'New Query Tab',           group: 'Query',      key: 'n' },
  { id: 'history',  label: 'Query History',           group: 'Query',      key: 'h' },
  { id: 'run',      label: 'Run Current Query',       group: 'Query',      key: 'r' },
  { id: 'ai',       label: 'Ask AI (beanllm)',        group: 'AI',         key: 'a' },
  { id: 'ai-explain',label:'Explain Current Query',  group: 'AI' },
  { id: 'ai-fix',   label: 'Fix Last Error with AI', group: 'AI' },
  { id: 'monitor',  label: 'Stream Monitor',          group: 'Tools',      key: 'm' },
  { id: 'indexes',  label: 'Index Manager',           group: 'Tools',      key: 'i' },
  { id: 'settings', label: 'Settings',                group: 'Tools' },
  { id: 'quit',     label: 'Quit beanCLI',            group: 'App',        key: 'q' },
];

interface CommandPaletteProps {
  onClose:   () => void;
  onSelect?: (id: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onClose, onSelect }) => {
  const [query,  setQuery]  = useState('');
  const [cursor, setCursor] = useState(0);

  const filtered = COMMANDS.filter(c =>
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.group.toLowerCase().includes(query.toLowerCase()),
  );

  // Clamp cursor when filter changes
  const safeCursor = Math.min(cursor, Math.max(0, filtered.length - 1));

  const select = useCallback(() => {
    const cmd = filtered[safeCursor];
    if (cmd) { onSelect?.(cmd.id); }
    onClose();
  }, [filtered, safeCursor, onSelect, onClose]);

  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.upArrow)   { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow) { setCursor(c => Math.min(filtered.length - 1, c + 1)); return; }
    if (key.return)    { select(); return; }

    // Text input — backspace
    if (key.backspace || key.delete) {
      setQuery(q => q.slice(0, -1));
      setCursor(0);
      return;
    }

    // Printable characters
    if (input && input.length === 1 && input >= ' ' && !key.ctrl && !key.meta) {
      setQuery(q => q + input);
      setCursor(0);
    }
  });

  // Group rows for display
  type Row = { type: 'group'; label: string } | { type: 'cmd'; cmd: Command; idx: number };
  const rows: Row[] = [];
  let flatIdx = 0;
  const grouped = filtered.reduce<Record<string, Command[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});

  for (const [group, cmds] of Object.entries(grouped)) {
    if (query === '') rows.push({ type: 'group', label: group });
    for (const cmd of cmds) {
      rows.push({ type: 'cmd', cmd, idx: flatIdx++ });
    }
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="#00d4ff"
      width={52}
      paddingX={1}
      paddingY={0}
    >
      {/* Title */}
      <Text color="#00d4ff" bold>  Command Palette  </Text>

      {/* Search box */}
      <Box
        borderStyle="single"
        borderColor="#1a2a3a"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        marginTop={0}
      >
        <Text color="#6b7280">❯ </Text>
        <Text color="#e0e0e0">{query || ' '}</Text>
        <Text color="#00d4ff">█</Text>
        {query === '' && (
          <Text color="#374151"> Search commands...</Text>
        )}
      </Box>

      {/* Command list */}
      <Box flexDirection="column" marginTop={1}>
        {rows.length === 0 ? (
          <Text color="#4a5568">  No commands match "{query}"</Text>
        ) : (
          rows.map((row, i) => {
            if (row.type === 'group') {
              return (
                <Text key={`g-${i}`} color="#374151" dimColor>
                  {' '}{row.label.toUpperCase()}
                </Text>
              );
            }
            const isActive = row.idx === safeCursor;
            return (
              <Box key={row.cmd.id}>
                <Text
                  backgroundColor={isActive ? '#00d4ff' : undefined}
                  color={isActive ? '#0a1628' : '#e0e0e0'}
                  bold={isActive}
                >
                  {' '}{row.cmd.label.padEnd(36)}{row.cmd.key ? `[${row.cmd.key}]` : '   '}
                  {' '}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* Footer hint */}
      <Box
        borderStyle="single"
        borderColor="#1a2a3a"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        marginTop={1}
      >
        <Text color="#374151">↑↓:navigate  Enter:run  Esc:close</Text>
      </Box>
    </Box>
  );
};
