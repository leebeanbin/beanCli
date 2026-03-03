import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';
import { SPINNER } from '../../utils/constants.js';

const INDEXES_SQL = `
SELECT
  tablename   AS "table",
  indexname   AS name,
  idx_scan    AS scans,
  idx_tup_read AS tuples,
  CASE WHEN indisunique THEN '[U]' ELSE '   ' END AS unique_flag,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
JOIN pg_index ON indexrelid = pg_index.indexrelid
ORDER BY tablename, indexname
`.trim();

const TABLES_SQL = `
SELECT
  relname     AS "table",
  seq_scan,
  idx_scan,
  n_live_tup  AS live_rows,
  n_dead_tup  AS dead_rows,
  pg_size_pretty(pg_total_relation_size(quote_ident(relname))) AS size
FROM pg_stat_user_tables
ORDER BY relname
`.trim();

type TabKey = 'indexes' | 'tables';
const TABS: TabKey[] = ['indexes', 'tables'];
const TAB_LABELS: Record<TabKey, string> = { indexes: 'INDEXES', tables: 'TABLE STATS' };

function idxBar(seqScan: number, idxScan: number): string {
  const total = seqScan + idxScan;
  if (total === 0) return '[░░░░░░░░░░]  0%';
  const pct    = Math.round((idxScan / total) * 100);
  const filled = Math.floor((idxScan / total) * 10);
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${String(pct).padStart(3)}%`;
}

export const IndexPanel: React.FC = () => {
  const { focusedPanel, overlay, paletteOpen, connectionService, activeConnection } = useAppContext();

  const [tabIdx,     setTabIdx]     = useState(0);
  const [idxRows,    setIdxRows]    = useState<Record<string, unknown>[]>([]);
  const [tableRows,  setTableRows]  = useState<Record<string, unknown>[]>([]);
  const [cursor,     setCursor]     = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [filter,     setFilter]     = useState('');
  const [filtering,  setFiltering]  = useState(false);
  const [spinIdx,    setSpinIdx]    = useState(0);

  const isActive = (focusedPanel === 'query' || focusedPanel === 'result') && !overlay && !paletteOpen;
  const tab      = TABS[tabIdx] ?? 'indexes';
  const allRows  = tab === 'indexes' ? idxRows : tableRows;
  const filtered = filter
    ? allRows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(filter.toLowerCase())))
    : allRows;

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setSpinIdx(i => (i + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, [loading]);

  const fetchData = useCallback(async () => {
    if (!connectionService || !activeConnection) return;
    setLoading(true);
    setError(null);
    const [iRes, tRes] = await Promise.all([
      connectionService.executeQuery(INDEXES_SQL),
      connectionService.executeQuery(TABLES_SQL),
    ]);
    setLoading(false);
    if (iRes.error) { setError(iRes.error); return; }
    if (tRes.error) { setError(tRes.error); return; }
    setIdxRows(iRes.rows);
    setTableRows(tRes.rows);
    setCursor(0);
  }, [connectionService, activeConnection]);

  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;
  useEffect(() => { void fetchRef.current(); }, []);

  const maxCursor = Math.max(0, filtered.length - 1);

  useInput((inp, key) => {
    if (!isActive) return;
    if (filtering) {
      if (key.escape || key.return) { setFiltering(false); return; }
      if (key.backspace) { setFilter(s => s.slice(0, -1)); return; }
      if (inp && inp >= ' ' && !key.ctrl) { setFilter(s => s + inp); }
      return;
    }
    if (key.upArrow   || inp === 'k') { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow || inp === 'j') { setCursor(c => Math.min(maxCursor, c + 1)); return; }
    if (inp === 'f') { setTabIdx(t => (t + 1) % TABS.length); setCursor(0); return; }
    if (inp === '/')  { setFiltering(true); setFilter(''); return; }
    if (key.escape)  { setFilter(''); setFiltering(false); return; }
    if (inp === 'r') { void fetchData(); return; }
  });

  const cols       = process.stdout.columns ?? 80;
  const panelWidth = cols - 54;

  if (!activeConnection) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text color="#374151">── not connected ──</Text>
        <Text color="#4a5568" dimColor>Connect to a PostgreSQL database first</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Tab bar */}
      <Box gap={2}>
        {TABS.map((t, i) => (
          <Text
            key={t}
            color={i === tabIdx ? '#0a1628' : '#6b7280'}
            backgroundColor={i === tabIdx ? '#00d4ff' : undefined}
            bold={i === tabIdx}
          >
            {` ${TAB_LABELS[t]} `}
          </Text>
        ))}
        {loading && <Text color="#f59e0b">{SPINNER[spinIdx]}</Text>}
      </Box>

      {error && <Text color="#ef4444" wrap="truncate">{error}</Text>}

      {filtering && (
        <Box><Text color="#00d4ff">  / </Text><Text color="#e0e0e0">{filter}</Text><Text color="#00d4ff">█</Text></Box>
      )}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 80))}</Text>

      {/* INDEXES tab */}
      {tab === 'indexes' && (
        <>
          <Box>
            <Text color="#00d4ff" bold>{'TABLE'.padEnd(16)}</Text>
            <Text color="#00d4ff" bold>{'INDEX NAME'.padEnd(24)}</Text>
            <Text color="#00d4ff" bold>{'SCANS'.padEnd(8)}</Text>
            <Text color="#00d4ff" bold>{'SIZE'.padEnd(8)}</Text>
            <Text color="#00d4ff" bold>{'U'}</Text>
          </Box>
          <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 60))}</Text>
          {filtered.length === 0 && !loading && (
            <Text color="#4a5568" dimColor>No indexes found (PostgreSQL system catalog)</Text>
          )}
          {filtered.map((row, i) => {
            const isCursor = i === cursor;
            return (
              <Box key={i}>
                <Text color={isCursor ? '#0a1628' : '#e0e0e0'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
                  {String(row['table'] ?? '').slice(0, 15).padEnd(16)}
                </Text>
                <Text color={isCursor ? '#0a1628' : '#a0aec0'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
                  {String(row['name'] ?? '').slice(0, 23).padEnd(24)}
                </Text>
                <Text color={isCursor ? '#0a1628' : '#6b7280'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
                  {String(row['scans'] ?? '0').padStart(7) + ' '}
                </Text>
                <Text color={isCursor ? '#0a1628' : '#6b7280'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
                  {String(row['size'] ?? '').slice(0, 7).padEnd(8)}
                </Text>
                <Text color={isCursor ? '#0a1628' : '#10b981'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
                  {String(row['unique_flag'] ?? '')}
                </Text>
              </Box>
            );
          })}
        </>
      )}

      {/* TABLE STATS tab */}
      {tab === 'tables' && (
        <>
          <Box>
            <Text color="#00d4ff" bold>{'TABLE'.padEnd(20)}</Text>
            <Text color="#00d4ff" bold>{'IDX EFFICIENCY'.padEnd(18)}</Text>
            <Text color="#00d4ff" bold>{'LIVE'.padEnd(8)}</Text>
            <Text color="#00d4ff" bold>{'DEAD'.padEnd(6)}</Text>
            <Text color="#00d4ff" bold>{'SIZE'}</Text>
          </Box>
          <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 60))}</Text>
          {filtered.length === 0 && !loading && (
            <Text color="#4a5568" dimColor>No tables found</Text>
          )}
          {filtered.map((row, i) => {
            const isCursor = i === cursor;
            const bar = idxBar(Number(row['seq_scan'] ?? 0), Number(row['idx_scan'] ?? 0));
            return (
              <Box key={i}>
                <Text color={isCursor ? '#0a1628' : '#e0e0e0'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
                  {String(row['table'] ?? '').slice(0, 19).padEnd(20)}
                </Text>
                <Text color={isCursor ? '#0a1628' : '#10b981'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
                  {bar.padEnd(18)}
                </Text>
                <Text color={isCursor ? '#0a1628' : '#6b7280'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
                  {String(row['live_rows'] ?? '0').padStart(7) + ' '}
                </Text>
                <Text color={isCursor ? '#0a1628' : '#ef4444'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
                  {String(row['dead_rows'] ?? '0').padStart(5) + ' '}
                </Text>
                <Text color={isCursor ? '#0a1628' : '#6b7280'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
                  {String(row['size'] ?? '')}
                </Text>
              </Box>
            );
          })}
        </>
      )}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 60))}</Text>
      <Text color="#374151" dimColor>
        {`  j/k:row  f:tab  /:filter  r:refresh  [${cursor + 1}/${filtered.length}]`}
      </Text>
    </Box>
  );
};
