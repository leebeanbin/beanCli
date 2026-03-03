import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';

const PAGE_SIZE = 18;

// ── TablePickerOverlay ────────────────────────────────────────────────────────
// IDE-style full-screen table browser (lazygit / k9s UX pattern).
// Shown after connecting to a DB. Also accessible in-app via 't' key.

export const TablePickerOverlay: React.FC = () => {
  const {
    tables,
    activeConnection,
    connectionService,
    setBrowseTable,
    setAppMode,
    setFocusedPanel,
    startupPhase,
    setStartupPhase,
    setOverlay,
  } = useAppContext();

  const [cursor,    setCursor]    = useState(0);
  const [filter,    setFilter]    = useState('');
  const [filtering, setFiltering] = useState(false);

  // Table metadata: row count per table (loaded async)
  const [rowCounts, setRowCounts] = useState<Record<string, number | null>>({});
  const loadedRef = useRef(false);

  // Async: fetch row counts for visible tables
  useEffect(() => {
    if (loadedRef.current || !connectionService || tables.length === 0) return;
    loadedRef.current = true;

    // Quote table name per driver type
    const dbType = activeConnection?.type ?? 'postgresql';
    const quoteTable = (name: string) =>
      dbType === 'mysql' ? `\`${name.replace(/`/g, '``')}\`` : `"${name.replace(/"/g, '""')}"`;

    void (async () => {
      const counts: Record<string, number | null> = {};
      // Load in batches to avoid overwhelming the DB
      for (let i = 0; i < Math.min(tables.length, 30); i++) {
        const t = tables[i]!;
        try {
          const res = await connectionService.executeQuery(
            `SELECT COUNT(*) AS n FROM ${quoteTable(t)}`,
          );
          const n = res.rows[0]?.['n'] ?? res.rows[0]?.['count'] ?? null;
          counts[t] = n !== null ? Number(n) : null;
        } catch {
          counts[t] = null;
        }
        setRowCounts(prev => ({ ...prev, [t]: counts[t] ?? null }));
      }
    })();
  }, [tables, connectionService, activeConnection?.type]);

  const filtered = filter
    ? tables.filter(t => t.toLowerCase().includes(filter.toLowerCase()))
    : tables;

  const maxCursor = Math.max(0, filtered.length - 1);

  const openTable = useCallback((tableName: string) => {
    setBrowseTable(tableName);
    setAppMode('browse');
    setFocusedPanel('query');
    // Close: either end startup phase or close overlay
    if (startupPhase === 'table-picker') {
      setStartupPhase('ready');
    } else {
      setOverlay(null);
    }
  }, [setBrowseTable, setAppMode, setFocusedPanel, startupPhase, setStartupPhase, setOverlay]);

  const closeWithoutSelect = useCallback(() => {
    if (startupPhase === 'table-picker') {
      setStartupPhase('ready');
    } else {
      setOverlay(null);
    }
  }, [startupPhase, setStartupPhase, setOverlay]);

  useInput((inp, key) => {
    // ── Filter mode ────────────────────────────────────────────────────────
    if (filtering) {
      if (key.escape) { setFiltering(false); setFilter(''); return; }
      if (key.return) { setFiltering(false); return; }
      if (key.backspace) {
        setFilter(s => {
          const next = s.slice(0, -1);
          if (next === '') setFiltering(false);
          return next;
        });
        return;
      }
      if (inp && inp >= ' ' && !key.ctrl && !key.meta) {
        setFilter(s => s + inp);
        setCursor(0);
      }
      return;
    }

    // ── Navigation ─────────────────────────────────────────────────────────
    if (key.upArrow   || inp === 'k') { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow || inp === 'j') { setCursor(c => Math.min(maxCursor, c + 1)); return; }
    if (key.pageUp)   { setCursor(c => Math.max(0, c - PAGE_SIZE)); return; }
    if (key.pageDown) { setCursor(c => Math.min(maxCursor, c + PAGE_SIZE)); return; }
    if (inp === 'g')  { setCursor(0); return; }
    if (inp === 'G')  { setCursor(maxCursor); return; }

    // ── Filter ─────────────────────────────────────────────────────────────
    if (inp === '/') { setFiltering(true); setFilter(''); return; }
    if (key.escape && filter) { setFilter(''); setCursor(0); return; }

    // ── Open table ─────────────────────────────────────────────────────────
    if (key.return && filtered.length > 0) {
      const t = filtered[cursor];
      if (t) openTable(t);
      return;
    }

    // ── Proceed to main UI even with no tables (e.g. empty new database) ───
    if (key.return && tables.length === 0) {
      closeWithoutSelect();
      return;
    }

    // ── Close without selecting ────────────────────────────────────────────
    if (key.escape || inp === 'q') {
      closeWithoutSelect();
    }
  });

  // ── Layout ─────────────────────────────────────────────────────────────────

  const cols     = process.stdout.columns ?? 100;
  const W        = Math.min(72, cols - 4);
  const conn     = activeConnection;
  const typeStr  = conn?.type ?? '';
  const hostStr  = conn?.host ?? conn?.database ?? '';
  const portStr  = conn?.port ? `:${conn.port}` : '';

  // Sliding window of visible rows
  const windowStart = Math.max(0, cursor - Math.floor(PAGE_SIZE / 2));
  const visible     = filtered.slice(windowStart, windowStart + PAGE_SIZE);

  const fmtCount = (t: string): string => {
    const n = rowCounts[t];
    if (n === undefined) return '      ';      // loading
    if (n === null)      return '  err ';
    return n.toLocaleString().padStart(6);
  };

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor="#00d4ff"
        width={W}
        paddingX={1}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <Box gap={1} marginTop={0}>
          <Text color="#10b981" bold>●</Text>
          <Text color="#00d4ff" bold>{conn?.label ?? 'Connected'}</Text>
          <Text color="#1a2a3a">·</Text>
          <Text color="#4a5568">{typeStr}</Text>
          <Text color="#1a2a3a">·</Text>
          <Text color="#374151">{hostStr}{portStr}</Text>
          <Box flexGrow={1} />
          <Text color="#4a5568">{filtered.length}/{tables.length} tables</Text>
        </Box>

        {/* ── Filter bar ─────────────────────────────────────────────── */}
        <Box borderStyle="single" borderColor="#1a2a3a"
          borderTop borderBottom={false} borderLeft={false} borderRight={false}>
          <Text color="#00d4ff">{'/ '}</Text>
          {filtering ? (
            <>
              <Text color="#e0e0e0">{filter}</Text>
              <Text color="#00d4ff">█</Text>
            </>
          ) : filter ? (
            <>
              <Text color="#f59e0b">{filter}</Text>
              <Text color="#4a5568">  (Esc:clear)</Text>
            </>
          ) : (
            <Text color="#374151" dimColor>type to filter...</Text>
          )}
        </Box>

        {/* ── Column header ──────────────────────────────────────────── */}
        <Box>
          <Text color="#4a5568" dimColor>{'  '}</Text>
          <Text color="#4a5568" dimColor bold>{'TABLE NAME'.padEnd(W - 22)}</Text>
          <Text color="#4a5568" dimColor bold>{'   ROWS'}</Text>
        </Box>
        <Text color="#1a2a3a">{'─'.repeat(W - 4)}</Text>

        {/* ── Table rows ─────────────────────────────────────────────── */}
        <Box flexDirection="column">
          {tables.length === 0 ? (
            <Box paddingX={1} flexDirection="column" paddingY={1}>
              <Text color="#4a5568">  No tables found in this database.</Text>
              <Text color="#374151" dimColor>
                {'  Press '}
                <Text color="#00d4ff" bold>Enter</Text>
                {' or '}
                <Text color="#f59e0b" bold>Esc</Text>
                {' to open the query editor and create tables.'}
              </Text>
            </Box>
          ) : filtered.length === 0 ? (
            <Box paddingX={1}>
              <Text color="#4a5568">No tables match &quot;{filter}&quot;</Text>
            </Box>
          ) : (
            visible.map((tableName, i) => {
              const absIdx   = windowStart + i;
              const isCursor = absIdx === cursor;
              const marker   = isCursor ? '▶ ' : '  ';
              const count    = fmtCount(tableName);
              const nameW    = W - 18;

              return (
                <Box key={tableName}>
                  <Text
                    color={isCursor ? '#0a1628' : '#e0e0e0'}
                    backgroundColor={isCursor ? '#00d4ff' : undefined}
                    bold={isCursor}
                  >
                    {marker}
                    {tableName.slice(0, nameW - 2).padEnd(nameW - 2)}
                  </Text>
                  <Text
                    color={isCursor ? '#0a1628' : '#4a5568'}
                    backgroundColor={isCursor ? '#00d4ff' : undefined}
                  >
                    {count}
                  </Text>
                </Box>
              );
            })
          )}

          {/* Scroll indicator */}
          {filtered.length > PAGE_SIZE && (
            <Text color="#374151" dimColor>
              {'  '}
              {windowStart > 0 ? '↑ ' : '  '}
              {`[${cursor + 1}/${filtered.length}]`}
              {windowStart + PAGE_SIZE < filtered.length ? ' ↓' : ''}
            </Text>
          )}
        </Box>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <Text color="#1a2a3a">{'─'.repeat(W - 4)}</Text>
        <Box gap={2} marginBottom={0}>
          {tables.length > 0 && <Text color="#374151">j/k:move</Text>}
          <Text color="#374151">{tables.length === 0 ? 'Enter/Esc:open editor' : 'Enter:open'}</Text>
          {tables.length > 0 && <Text color="#374151">/:filter</Text>}
          {tables.length > 0 && <Text color="#374151">g/G:top/bot</Text>}
          <Text color="#374151">Esc/q:close</Text>
        </Box>
      </Box>
    </Box>
  );
};
