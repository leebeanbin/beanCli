import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';
import { useConnection } from '../../hooks/useConnection.js';
import type { DbConnection } from '../../services/types.js';

const DB_TYPE_COLOR: Record<string, string> = {
  postgresql: '#3b82f6',
  mysql:      '#f59e0b',
  sqlite:     '#10b981',
  mongodb:    '#22c55e',
  redis:      '#ef4444',
};

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// ── Sub-component: Connection List ───────────────────────────────────────────

interface ListProps {
  connections:     DbConnection[];
  cursor:          number;
  activeId:        string | null;
  isActive:        boolean;
}

const ConnectionList: React.FC<ListProps> = ({ connections, cursor, activeId, isActive }) => {
  if (connections.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="#374151" dimColor>No saved connections.</Text>
        <Text color="#374151" dimColor> </Text>
        <Text color={isActive ? '#6b7280' : '#374151'}>Press n to add one.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {connections.map((conn, i) => {
        const isCursor   = i === cursor;
        const isConnected = conn.id === activeId;
        const typeColor  = DB_TYPE_COLOR[conn.type] ?? '#6b7280';
        const marker     = isConnected ? '●' : (isCursor ? '▶' : ' ');
        const star       = conn.isDefault ? '*' : ' ';

        return (
          <Box key={conn.id}>
            <Text
              color={isCursor ? '#0a1628' : (isConnected ? '#10b981' : '#e0e0e0')}
              backgroundColor={isCursor ? '#00d4ff' : undefined}
              bold={isCursor || isConnected}
            >
              {`${marker}${star}`}
            </Text>
            <Text
              color={isCursor ? '#0a1628' : (isConnected ? '#10b981' : '#e0e0e0')}
              backgroundColor={isCursor ? '#00d4ff' : undefined}
            >
              {conn.label.slice(0, 14).padEnd(14)}
            </Text>
            <Text color={isCursor ? '#0a1628' : typeColor} backgroundColor={isCursor ? '#00d4ff' : undefined}>
              {` ${conn.type.slice(0, 4)}`}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

// ── Sub-component: Table Tree ────────────────────────────────────────────────

interface TreeProps {
  tables:   string[];
  cursor:   number;
  isActive: boolean;
}

const TableTree: React.FC<TreeProps> = ({ tables, cursor, isActive }) => {
  if (tables.length === 0) {
    return <Text color="#4a5568" dimColor>No tables found.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text color="#4a5568" dimColor>{`TABLES (${tables.length})`}</Text>
      {tables.map((t, i) => {
        const isCursor = i === cursor;
        return (
          <Box key={t}>
            <Text
              color={isCursor ? '#0a1628' : '#e0e0e0'}
              backgroundColor={isCursor ? '#00d4ff' : undefined}
            >
              {isCursor ? ' ▶ ' : '   '}
            </Text>
            <Text
              color={isCursor ? '#0a1628' : '#a0aec0'}
              backgroundColor={isCursor ? '#00d4ff' : undefined}
            >
              {t.slice(0, 18).padEnd(18)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

// ── SchemaPanel ──────────────────────────────────────────────────────────────

type Phase = 'list' | 'connecting' | 'connected' | 'error';

export const SchemaPanel: React.FC = () => {
  const {
    focusedPanel, connections, activeConnection, tables,
    overlay, setOverlay,
  } = useAppContext();

  const { connect, disconnect, saveConn, deleteConn, connecting, connectError } = useConnection();

  const isActive = focusedPanel === 'schema' && !overlay;

  const [listCursor, setListCursor] = useState(0);
  const [tableCursor, setTableCursor] = useState(0);
  const [spinIdx, setSpinIdx]   = useState(0);
  const [pendingConn, setPendingConn] = useState<DbConnection | null>(null);

  // Derive phase
  const phase: Phase = connecting
    ? 'connecting'
    : connectError ? 'error'
    : activeConnection ? 'connected'
    : 'list';

  // Spinner tick
  useEffect(() => {
    if (phase !== 'connecting') return;
    const id = setInterval(() => setSpinIdx(i => (i + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, [phase]);

  // Clamp cursors
  const maxList  = Math.max(0, connections.length - 1);
  const maxTable = Math.max(0, tables.length - 1);

  useInput((input, key) => {
    if (!isActive) return;

    if (phase === 'list' || phase === 'error') {
      // List navigation
      if (key.upArrow || input === 'k')   { setListCursor(c => Math.max(0, c - 1)); return; }
      if (key.downArrow || input === 'j') { setListCursor(c => Math.min(maxList, c + 1)); return; }

      // New connection
      if (input === 'n') {
        setOverlay({ type: 'connection-form', conn: null });
        return;
      }
      // Edit connection
      if (input === 'e' && connections.length > 0) {
        const conn = connections[listCursor];
        if (conn) setOverlay({ type: 'connection-form', conn });
        return;
      }
      // Delete connection
      if (input === 'd' && connections.length > 0) {
        const conn = connections[listCursor];
        if (conn) {
          deleteConn(conn.id);
          setListCursor(c => Math.max(0, c - 1));
        }
        return;
      }
      // Toggle default
      if (input === '*' && connections.length > 0) {
        const conn = connections[listCursor];
        if (conn) saveConn({ ...conn, isDefault: !conn.isDefault });
        return;
      }
      // Connect
      if (key.return && connections.length > 0) {
        const conn = connections[listCursor];
        if (conn) {
          setPendingConn(conn);
          void connect(conn);
        }
        return;
      }
    }

    if (phase === 'connected') {
      // Table navigation
      if (key.upArrow || input === 'k')   { setTableCursor(c => Math.max(0, c - 1)); return; }
      if (key.downArrow || input === 'j') { setTableCursor(c => Math.min(maxTable, c + 1)); return; }
      // Enter → select table (future: emit event to QueryPanel)
      if (key.return) {
        // Phase 2: will trigger query panel focus + table load
        return;
      }
      // Disconnect
      if (input === 'D') { disconnect(); setPendingConn(null); return; }
    }
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderBody = () => {
    switch (phase) {

      case 'list':
      case 'error':
        return (
          <Box flexDirection="column" gap={0}>
            <ConnectionList
              connections={connections}
              cursor={listCursor}
              activeId={activeConnection?.id ?? null}
              isActive={isActive}
            />
            <Text color="#1a2a3a">{'─'.repeat(20)}</Text>
            {phase === 'error' && (
              <Text color="#ef4444" wrap="truncate">
                {connectError?.slice(0, 19)}
              </Text>
            )}
            <Text color="#374151" dimColor>
              {connections.length > 0
                ? 'n:new e:edit d:del'
                : 'n:new'}
            </Text>
            <Text color="#374151" dimColor>
              {connections.length > 0 ? '*:dflt Enter:conn' : ''}
            </Text>
          </Box>
        );

      case 'connecting':
        return (
          <Box flexDirection="column">
            <Text color="#00d4ff">
              {SPINNER[spinIdx]} Connecting...
            </Text>
            <Text color="#4a5568" dimColor>
              {(pendingConn?.label ?? '').slice(0, 19)}
            </Text>
            <Text color="#1a2a3a">{'─'.repeat(20)}</Text>
            <Text color="#374151" dimColor>Please wait...</Text>
          </Box>
        );

      case 'connected':
        return (
          <Box flexDirection="column">
            <Text color="#10b981" bold>
              {'● '}{(activeConnection?.label ?? '').slice(0, 17)}
            </Text>
            <Text color="#4a5568" dimColor>
              {activeConnection?.type} · {activeConnection?.host ?? activeConnection?.database ?? ''}
            </Text>
            <Text color="#1a2a3a">{'─'.repeat(20)}</Text>
            <TableTree
              tables={tables}
              cursor={tableCursor}
              isActive={isActive}
            />
            <Text color="#1a2a3a">{'─'.repeat(20)}</Text>
            <Text color="#374151" dimColor>j/k:move  Enter:use</Text>
            <Text color="#374151" dimColor>D:disconnect</Text>
          </Box>
        );
    }
  };

  return <Box flexDirection="column" flexGrow={1}>{renderBody()}</Box>;
};
