/**
 * HelpOverlay — `?` key, k9s/btop 스타일 전체 키바인딩 표
 * Esc 또는 ? 로 닫기
 */
import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';

interface Row {
  key:  string;
  desc: string;
}

const SECTIONS: Array<{ title: string; rows: Row[] }> = [
  {
    title: 'GLOBAL',
    rows: [
      { key: 'Ctrl+P',      desc: 'Command palette' },
      { key: '?',           desc: 'This help screen' },
      { key: 'q',           desc: 'Quit (not in SQL editor)' },
      { key: '1 / 2 / 3 / 4', desc: 'Focus Schema / Query / Result / AI' },
      { key: 'Tab / S-Tab', desc: 'Cycle panel focus' },
      { key: 't',           desc: 'Table picker overlay' },
    ],
  },
  {
    title: 'MODE SWITCH',
    rows: [
      { key: 'm',  desc: 'Stream Monitor' },
      { key: 'A',  desc: 'Audit Log' },
      { key: 'R',  desc: 'DLQ Recovery' },
      { key: 'I',  desc: 'Index Lab' },
      { key: 'b',  desc: 'Browse (Explore) mode' },
    ],
  },
  {
    title: 'QUERY PANEL',
    rows: [
      { key: 'Enter',       desc: 'Run query' },
      { key: 'Shift+Enter', desc: 'New line (multi-line)' },
      { key: '↑ / ↓',       desc: 'History navigation' },
      { key: 'Ctrl+L',      desc: 'Clear editor' },
      { key: 'Ctrl+A / E',  desc: 'Start / end of line' },
      { key: '\\dt',        desc: 'Open table picker' },
      { key: '\\d <table>', desc: 'Describe table schema' },
      { key: '\\x',         desc: 'Toggle expanded mode' },
      { key: '\\ping',      desc: 'Connection roundtrip test' },
      { key: '\\status',    desc: 'Connection info' },
      { key: '\\q',         desc: 'Quit' },
    ],
  },
  {
    title: 'RESULT PANEL',
    rows: [
      { key: 'j / k',  desc: 'Navigate rows' },
      { key: 'h / l',  desc: 'Scroll columns' },
      { key: 'Enter',  desc: 'Detail view (expand row)' },
      { key: 'v / x',  desc: 'Toggle expanded mode' },
      { key: '/',      desc: 'Filter rows' },
      { key: 'Esc',    desc: 'Close detail / clear filter' },
    ],
  },
  {
    title: 'SCHEMA PANEL (1)',
    rows: [
      { key: 'j / k',  desc: 'Navigate connections / tables' },
      { key: 'n',      desc: 'New connection' },
      { key: 'e',      desc: 'Edit connection' },
      { key: 'd',      desc: 'Delete connection' },
      { key: '*',      desc: 'Toggle default connection' },
      { key: 'Enter',  desc: 'Connect' },
      { key: 'c',      desc: 'Create table wizard' },
      { key: 'D',      desc: 'Disconnect' },
    ],
  },
  {
    title: 'CONNECTION PICKER',
    rows: [
      { key: 'j / k',  desc: 'Navigate list' },
      { key: 'Tab',    desc: 'Switch list ↔ form' },
      { key: 'n',      desc: 'Add new connection' },
      { key: 'd',      desc: 'Delete selected' },
      { key: '*',      desc: 'Set as default' },
      { key: 'Enter',  desc: 'Connect to selected' },
      { key: 'Esc',    desc: 'Skip (if connections exist)' },
    ],
  },
  {
    title: 'DATABASE PICKER',
    rows: [
      { key: 'j / k',  desc: 'Navigate databases' },
      { key: 'n',      desc: 'Create new database' },
      { key: 'd',      desc: 'Delete database (Y/n confirm)' },
      { key: 'Enter',  desc: 'Connect to database' },
      { key: 'Esc',    desc: 'Back to connection picker' },
    ],
  },
  {
    title: 'TABLE PICKER',
    rows: [
      { key: 'j / k',    desc: 'Navigate tables' },
      { key: 'g / G',    desc: 'Jump to top / bottom' },
      { key: 'PgUp/Dn',  desc: 'Page up / down' },
      { key: '/',        desc: 'Filter tables' },
      { key: 'Enter',    desc: 'Open table in browse mode' },
      { key: 'Esc / q',  desc: 'Close picker' },
    ],
  },
];

const COL_W = 15;  // key column width

export const HelpOverlay: React.FC = () => {
  const { setOverlay } = useAppContext();

  useInput((inp, key) => {
    if (key.escape || inp === '?') setOverlay(null);
  });

  // Split sections into 2 columns
  const half  = Math.ceil(SECTIONS.length / 2);
  const left  = SECTIONS.slice(0, half);
  const right = SECTIONS.slice(half);

  const renderSection = (sec: typeof SECTIONS[0]) => (
    <Box key={sec.title} flexDirection="column" marginBottom={1}>
      <Text color="#00d4ff" bold>{sec.title}</Text>
      {sec.rows.map(r => (
        <Box key={r.key}>
          <Text color="#f59e0b">{r.key.padEnd(COL_W)}</Text>
          <Text color="#a0aec0">{r.desc}</Text>
        </Box>
      ))}
    </Box>
  );

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor="#00d4ff"
        paddingX={2}
        paddingY={1}
      >
        {/* Title */}
        <Box marginBottom={1} justifyContent="center">
          <Text color="#00d4ff" bold>beanCLI — KEYBOARD SHORTCUTS</Text>
        </Box>

        {/* Two-column layout */}
        <Box gap={4}>
          <Box flexDirection="column">{left.map(renderSection)}</Box>
          <Box flexDirection="column">{right.map(renderSection)}</Box>
        </Box>

        {/* Footer */}
        <Box justifyContent="center" marginTop={1}>
          <Text color="#374151" dimColor>Press </Text>
          <Text color="#f59e0b" bold>?</Text>
          <Text color="#374151" dimColor> or </Text>
          <Text color="#f59e0b" bold>Esc</Text>
          <Text color="#374151" dimColor> to close</Text>
        </Box>
      </Box>
    </Box>
  );
};
