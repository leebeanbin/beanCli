/**
 * DatabasePickerOverlay
 *
 * Shown after connecting to a server without a specific database.
 * Lists all databases on the server; allows creating or deleting one.
 *
 * Keys:
 *   j/k / ↑↓  — navigate list
 *   n          — create new database (prompts for name)
 *   d          — delete selected database (asks Y/n first)
 *   Enter      — connect to selected database
 *   Esc        — back to connection picker
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';

// System databases that users typically don't want to work in directly
const SYSTEM_DBS: Record<string, string[]> = {
  mysql:      ['information_schema', 'performance_schema', 'mysql', 'sys'],
  postgresql: ['postgres', 'template0', 'template1'],
  mongodb:    ['admin', 'config', 'local'],
};

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const DatabasePickerOverlay: React.FC = () => {
  const {
    connectionService,
    activeConnection,
    setActiveConnection,
    setTables,
    setConnection,
    setStartupPhase,
  } = useAppContext();

  const [databases,   setDatabases]   = useState<string[]>([]);
  const [cursor,      setCursor]      = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  // Create-new flow
  const [creating,    setCreating]    = useState(false);
  const [newDbBuf,    setNewDbBuf]    = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createBusy,  setCreateBusy]  = useState(false);

  // Delete confirmation flow
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null); // db name to delete
  const [dropBusy,      setDropBusy]      = useState(false);
  const [dropError,     setDropError]     = useState<string | null>(null);

  // Connecting spinner
  const [connecting,  setConnecting]  = useState(false);
  const [spinIdx,     setSpinIdx]     = useState(0);

  // Load databases on mount; pre-select the one already in the connection (if any)
  useEffect(() => {
    if (!connectionService?.listDatabases) {
      setError('listDatabases not supported for this driver');
      setLoading(false);
      return;
    }
    void connectionService.listDatabases().then(dbs => {
      setDatabases(dbs);
      // Pre-select whatever database was already filled in the connection form
      if (activeConnection?.database) {
        const idx = dbs.indexOf(activeConnection.database);
        if (idx >= 0) setCursor(idx);
      }
      setLoading(false);
    }).catch(e => {
      setError(e instanceof Error ? e.message : 'Failed to list databases');
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Spinner tick
  useEffect(() => {
    if (!connecting && !createBusy && !dropBusy) return;
    const id = setInterval(() => setSpinIdx(i => (i + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, [connecting, createBusy, dropBusy]);

  const selectDatabase = useCallback(async (dbName: string) => {
    if (!connectionService || !activeConnection) return;
    setConnecting(true);
    setError(null);
    const conn = { ...activeConnection, database: dbName };
    const result = await connectionService.testConnection(conn);
    setConnecting(false);
    if (result.error) {
      setError(result.error);
    } else {
      setActiveConnection(conn);
      setTables(result.tables);
      setConnection(conn.label);
      setStartupPhase('table-picker');
    }
  }, [connectionService, activeConnection, setActiveConnection, setTables, setConnection, setStartupPhase]);

  const createAndSelect = useCallback(async (name: string) => {
    if (!connectionService || !name.trim()) return;
    setCreateBusy(true);
    setCreateError(null);
    const result = await connectionService.createDatabase!(name.trim());
    if (result?.error) {
      setCreateError(result.error);
      setCreateBusy(false);
      return;
    }
    // Refresh list
    const dbs = await connectionService.listDatabases!();
    setDatabases(dbs);
    const newIdx = dbs.indexOf(name.trim());
    if (newIdx >= 0) setCursor(newIdx);
    setCreateBusy(false);
    setCreating(false);
    setNewDbBuf('');
    // Auto-connect to the new database
    void selectDatabase(name.trim());
  }, [connectionService, selectDatabase]);

  const dropDatabase = useCallback(async (name: string) => {
    if (!connectionService?.dropDatabase) return;
    setDropBusy(true);
    setDropError(null);
    const result = await connectionService.dropDatabase(name);
    setDropBusy(false);
    if (result?.error) {
      setDropError(result.error);
      setConfirmDelete(null);
      return;
    }
    // Refresh list
    const dbs = await connectionService.listDatabases!();
    setDatabases(dbs);
    setCursor(c => Math.min(c, Math.max(0, dbs.length - 1)));
    setConfirmDelete(null);
  }, [connectionService]);

  // ── All derived values must be computed before any early return ─────────────
  const systemDbs = useMemo(() => {
    const dbType = activeConnection?.type ?? '';
    return new Set(SYSTEM_DBS[dbType] ?? []);
  }, [activeConnection?.type]);

  const connLabel = activeConnection
    ? `${activeConnection.username ?? 'user'}@${activeConnection.host ?? 'localhost'}:${activeConnection.port ?? ''}`
    : '';

  const footerHint = confirmDelete !== null
    ? 'Delete database? [y/N]'
    : creating
      ? 'Enter: create   Esc: cancel'
      : connectionService?.dropDatabase
        ? 'j/k:move  n:new  d:delete  Enter:use  Esc:back'
        : 'j/k:move  n:new  Enter:use  Esc:back';

  useInput((inp, key) => {
    if (connecting || createBusy || dropBusy) return;

    // ── Delete confirmation mode ───────────────────────────────────────────────
    if (confirmDelete !== null) {
      if (inp === 'y' || inp === 'Y') {
        void dropDatabase(confirmDelete);
        return;
      }
      // Any other key (n, N, Esc, Enter) cancels
      setConfirmDelete(null);
      setDropError(null);
      return;
    }

    // ── Create-prompt mode ────────────────────────────────────────────────────
    if (creating) {
      if (key.escape) { setCreating(false); setNewDbBuf(''); setCreateError(null); return; }
      if (key.return) { void createAndSelect(newDbBuf); return; }
      if (key.backspace || key.delete) { setNewDbBuf(s => s.slice(0, -1)); return; }
      if (inp && inp.length === 1 && inp >= ' ' && !key.ctrl && !key.meta) {
        setNewDbBuf(s => s + inp);
      }
      return;
    }

    // ── List mode ─────────────────────────────────────────────────────────────
    if (key.upArrow   || inp === 'k') { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow || inp === 'j') { setCursor(c => Math.min(databases.length - 1, c + 1)); return; }

    if (inp === 'n') {
      setCreating(true);
      setNewDbBuf('');
      setCreateError(null);
      return;
    }

    if (inp === 'd' && databases.length > 0 && connectionService?.dropDatabase) {
      const target = databases[cursor];
      if (target) {
        setConfirmDelete(target);
        setDropError(null);
      }
      return;
    }

    if (key.escape) {
      setStartupPhase('connection-picker');
      return;
    }

    if (key.return && databases.length > 0) {
      const selected = databases[cursor];
      if (selected) void selectDatabase(selected);
    }
  });

  // ── Connecting spinner ──────────────────────────────────────────────────────

  if (connecting) {
    return (
      <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
        <Box
          flexDirection="column"
          borderStyle="double"
          borderColor="#00d4ff"
          width={50}
          paddingX={2}
          paddingY={1}
        >
          <Text color="#00d4ff" bold>  Connecting to database...</Text>
          <Text>{' '}</Text>
          <Text color="#f59e0b">{SPINNER[spinIdx]}  {databases[cursor]}</Text>
          <Text color="#4a5568">
            {'   '}{activeConnection?.type ?? 'db'}
            {activeConnection?.host ? ` · ${activeConnection.host}` : ''}
          </Text>
        </Box>
      </Box>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────────

  const blink = Math.floor(Date.now() / 600) % 2 === 0 ? '█' : '▌';

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor="#00d4ff"
        width={60}
        paddingX={0}
        paddingY={0}
      >
        {/* Title */}
        <Box paddingX={2} paddingY={0}>
          <Text color="#00d4ff" bold>SELECT DATABASE</Text>
          <Text color="#1e3a5f">  ·  {connLabel}</Text>
        </Box>

        <Text color="#1a2a3a" bold>{'─'.repeat(58)}</Text>

        {/* Database list */}
        {loading && (
          <Box paddingX={2} paddingY={1}>
            <Text color="#f59e0b">{SPINNER[spinIdx]}  Loading databases...</Text>
          </Box>
        )}
        {!loading && databases.length === 0 && !error && (
          <Box paddingX={2} paddingY={1}>
            <Text color="#374151" dimColor>  No databases found. Press <Text color="#10b981" bold>n</Text> to create one.</Text>
          </Box>
        )}
        {!loading && databases.map((db, i) => {
          const isSel   = i === cursor;
          const isSys   = systemDbs.has(db);
          const nameCol = isSel ? '#00d4ff' : isSys ? '#374151' : '#a0aec0';
          const tagCol  = isSys ? '#1e3a5f' : undefined;
          return (
            <Box key={db} paddingX={2} gap={1}>
              <Text color={nameCol} bold={isSel} dimColor={isSys && !isSel}>
                {isSel ? '▶ ' : '  '}{db}
              </Text>
              {isSys && (
                <Text color={tagCol} dimColor>sys</Text>
              )}
            </Box>
          );
        })}

        {/* Delete confirmation prompt */}
        {confirmDelete !== null && (
          <>
            <Text color="#1a2a3a" bold>{'─'.repeat(58)}</Text>
            <Box paddingX={2} paddingY={0} flexDirection="column">
              <Box>
                <Text color="#ef4444" bold>  Delete </Text>
                <Text color="#f59e0b" bold>&quot;{confirmDelete}&quot;</Text>
                <Text color="#ef4444" bold>? This cannot be undone.</Text>
              </Box>
              <Box>
                <Text color="#374151">  Press </Text>
                <Text color="#ef4444" bold>y</Text>
                <Text color="#374151"> to confirm, any other key to cancel</Text>
              </Box>
              {dropBusy && (
                <Box>
                  <Text color="#f59e0b">  {SPINNER[spinIdx]} Dropping database...</Text>
                </Box>
              )}
            </Box>
          </>
        )}

        {/* Create-new prompt */}
        {creating && (
          <>
            <Text color="#1a2a3a" bold>{'─'.repeat(58)}</Text>
            <Box paddingX={2} paddingY={0}>
              <Text color="#10b981">  New database: </Text>
              <Text color="#e0e0e0">{newDbBuf}{blink}</Text>
            </Box>
            {createError && (
              <Box paddingX={2}>
                <Text color="#ef4444">  ✗ {createError}</Text>
              </Box>
            )}
            {createBusy && (
              <Box paddingX={2}>
                <Text color="#f59e0b">  {SPINNER[spinIdx]} Creating...</Text>
              </Box>
            )}
            <Box paddingX={2}>
              <Text color="#374151" dimColor>  Enter: create   Esc: cancel</Text>
            </Box>
          </>
        )}

        {/* Drop error */}
        {dropError && !creating && confirmDelete === null && (
          <Box paddingX={2}>
            <Text color="#ef4444">  ✗ {dropError}</Text>
          </Box>
        )}

        {/* Connection or load error — full message, wraps */}
        {error && !creating && confirmDelete === null && (
          <Box paddingX={2} flexDirection="column">
            <Text color="#ef4444" bold>  ✗ Error</Text>
            <Text color="#ef4444" wrap="wrap">{'  '}{error}</Text>
            <Box paddingTop={0}>
              <Text color="#374151" dimColor>  Press <Text color="#f59e0b" bold>Esc</Text> to go back and fix credentials.</Text>
            </Box>
          </Box>
        )}

        <Text color="#1a2a3a" bold>{'─'.repeat(58)}</Text>

        {/* Footer */}
        <Box paddingX={2}>
          <Text color={confirmDelete !== null ? '#ef4444' : '#374151'}>{footerHint}</Text>
        </Box>
      </Box>
    </Box>
  );
};
