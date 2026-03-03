import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';
import { escStr } from '../../utils/sql.js';
import { SPINNER } from '../../utils/constants.js';

const DLQ_SQL = `
SELECT
  id,
  status,
  source_topic,
  error_reason,
  created_at
FROM dlq_events
WHERE status NOT IN ('REPROCESSED', 'REQUEUED')
ORDER BY created_at DESC
LIMIT 100
`.trim();

export const RecoveryPanel: React.FC = () => {
  const { focusedPanel, overlay, paletteOpen, connectionService, activeConnection } = useAppContext();

  const [rows,       setRows]       = useState<Record<string, unknown>[]>([]);
  const [cursor,     setCursor]     = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [reverting,  setReverting]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [message,    setMessage]    = useState<string | null>(null);
  const [filter,     setFilter]     = useState('');
  const [filtering,  setFiltering]  = useState(false);
  const [spinIdx,    setSpinIdx]    = useState(0);

  const isActive = (focusedPanel === 'query' || focusedPanel === 'result') && !overlay && !paletteOpen;

  useEffect(() => {
    if (!loading && !reverting) return;
    const id = setInterval(() => setSpinIdx(i => (i + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, [loading, reverting]);

  // Auto-clear message after 4s
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(id);
  }, [message]);

  const fetchData = useCallback(async () => {
    if (!connectionService || !activeConnection) return;
    setLoading(true);
    setError(null);
    const res = await connectionService.executeQuery(DLQ_SQL);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setRows(res.rows);
    setCursor(0);
  }, [connectionService, activeConnection]);

  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;
  useEffect(() => { void fetchRef.current(); }, []);

  const filtered = filter
    ? rows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(filter.toLowerCase())))
    : rows;

  const maxCursor = Math.max(0, filtered.length - 1);

  const reprocess = useCallback(async (rowId: string) => {
    if (!connectionService || reverting) return;
    setReverting(true);
    const sql = `UPDATE dlq_events SET status = 'REQUEUED' WHERE id = ${escStr(rowId)}`;
    const res = await connectionService.executeQuery(sql);
    setReverting(false);
    if (res.error) {
      setMessage(`! ${res.error.slice(0, 50)}`);
    } else {
      setMessage(`+ Requeued ${rowId.slice(0, 12)}...`);
      void fetchRef.current();
    }
  }, [connectionService, reverting]);

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
    if (inp === 'r' && !reverting) {
      const row = filtered[cursor];
      if (row?.['id']) void reprocess(String(row['id']));
      return;
    }
    if (inp === '/')  { setFiltering(true); setFilter(''); return; }
    if (key.escape)  { setFilter(''); setFiltering(false); return; }
    if (inp === 'R') { void fetchData(); return; }
  });

  const cols       = process.stdout.columns ?? 80;
  const panelWidth = cols - 54;

  if (!activeConnection) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text color="#374151">── not connected ──</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box gap={2}>
        <Text color="#f59e0b" bold>DLQ RECOVERY</Text>
        {loading && <Text color="#6b7280">{SPINNER[spinIdx]} loading...</Text>}
        {reverting && <Text color="#f59e0b">{SPINNER[spinIdx]} requeuing...</Text>}
        {message && (
          <Text color={message.startsWith('+') ? '#10b981' : '#ef4444'}>{message}</Text>
        )}
        {!loading && !reverting && !message && rows.length > 0 && (
          <Text color="#f59e0b">⚠ {rows.length} failed event(s)</Text>
        )}
        {!loading && !reverting && !message && rows.length === 0 && (
          <Text color="#10b981">✓ DLQ is clear</Text>
        )}
      </Box>

      {error && <Text color="#ef4444">{error}</Text>}

      {filtering && (
        <Box><Text color="#00d4ff">  / </Text><Text color="#e0e0e0">{filter}</Text><Text color="#00d4ff">█</Text></Box>
      )}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 80))}</Text>

      {/* Column headers */}
      <Box>
        <Text color="#00d4ff" bold>{'ID'.padEnd(12)}</Text>
        <Text color="#00d4ff" bold>{'STATUS'.padEnd(14)}</Text>
        <Text color="#00d4ff" bold>{'TOPIC'.padEnd(18)}</Text>
        <Text color="#00d4ff" bold>{'ERROR'}</Text>
      </Box>
      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 60))}</Text>

      {/* Rows */}
      {filtered.length === 0 && !loading && (
        <Text color="#4a5568" dimColor>
          {rows.length === 0 ? 'No DLQ events — all clear!' : 'No matches'}
        </Text>
      )}
      {filtered.map((row, i) => {
        const isCursor = i === cursor;
        return (
          <Box key={i}>
            <Text color={isCursor ? '#0a1628' : '#e0e0e0'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
              {String(row['id'] ?? '').slice(0, 11).padEnd(12)}
            </Text>
            <Text color={isCursor ? '#0a1628' : '#f59e0b'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
              {String(row['status'] ?? '').slice(0, 13).padEnd(14)}
            </Text>
            <Text color={isCursor ? '#0a1628' : '#a0aec0'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
              {String(row['source_topic'] ?? '').slice(0, 17).padEnd(18)}
            </Text>
            <Text color={isCursor ? '#0a1628' : '#ef4444'} backgroundColor={isCursor ? '#00d4ff' : undefined} wrap="truncate">
              {String(row['error_reason'] ?? '').slice(0, 28)}
            </Text>
          </Box>
        );
      })}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 60))}</Text>
      <Text color="#374151" dimColor>
        {`  j/k:row  r:requeue  R:refresh  /:filter  [${cursor + 1}/${filtered.length}]`}
      </Text>
    </Box>
  );
};
