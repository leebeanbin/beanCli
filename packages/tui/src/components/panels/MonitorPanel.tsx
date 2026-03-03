import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';
import { SPINNER } from '../../utils/constants.js';

const REFRESH_MS = 10_000;

const STREAM_SQL = `
SELECT
  COALESCE(entity_type, 'unknown') AS entity_type,
  COUNT(*) AS total_events,
  COUNT(*) FILTER (
    WHERE event_time_ms > (EXTRACT(epoch FROM NOW()) * 1000 - 300000)::bigint
  ) AS events_5min,
  MAX(event_time_ms) AS latest_ms
FROM events_raw
GROUP BY entity_type
ORDER BY latest_ms DESC NULLS LAST
LIMIT 30
`.trim();

const DLQ_SQL = `
SELECT entity_type, COUNT(*) AS dlq_count
FROM dlq_events
GROUP BY entity_type
`.trim();

interface StreamRow {
  entity_type: string;
  total_events: number;
  events_5min:  number;
  latest_ms:    number | null;
  dlq_count:    number;
}

function fmtAgo(ms: number | null): string {
  if (!ms) return '—';
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function activityBar(eventsPerMin: number, width = 14): string {
  const max   = 100;
  const pct   = Math.min(1, eventsPerMin / max);
  const filled = Math.floor(pct * width);
  const bar   = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `[${bar}]`;
}

export const MonitorPanel: React.FC = () => {
  const { focusedPanel, overlay, paletteOpen, connectionService, activeConnection } = useAppContext();

  const [rows,      setRows]      = useState<StreamRow[]>([]);
  const [cursor,    setCursor]    = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [filter,    setFilter]    = useState('');
  const [filtering, setFiltering] = useState(false);
  const [spinIdx,   setSpinIdx]   = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const isActive = (focusedPanel === 'query' || focusedPanel === 'result') && !overlay && !paletteOpen;

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setSpinIdx(i => (i + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, [loading]);

  const fetchData = useCallback(async () => {
    if (!connectionService || !activeConnection) return;
    setLoading(true);
    setError(null);

    const [streamRes, dlqRes] = await Promise.all([
      connectionService.executeQuery(STREAM_SQL),
      connectionService.executeQuery(DLQ_SQL),
    ]);
    setLoading(false);

    if (streamRes.error) { setError(streamRes.error); return; }

    // Build dlq map
    const dlqMap: Record<string, number> = {};
    for (const r of dlqRes.rows) {
      dlqMap[String(r['entity_type'] ?? '')] = Number(r['dlq_count'] ?? 0);
    }

    const merged: StreamRow[] = streamRes.rows.map(r => ({
      entity_type: String(r['entity_type'] ?? ''),
      total_events: Number(r['total_events'] ?? 0),
      events_5min:  Number(r['events_5min'] ?? 0),
      latest_ms:    r['latest_ms'] != null ? Number(r['latest_ms']) : null,
      dlq_count:    dlqMap[String(r['entity_type'] ?? '')] ?? 0,
    }));

    setRows(merged);
    setLastRefresh(new Date());
  }, [connectionService, activeConnection]);

  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;

  useEffect(() => { void fetchRef.current(); }, []);

  // Auto-refresh
  useEffect(() => {
    const id = setInterval(() => void fetchRef.current(), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const filtered = filter
    ? rows.filter(r => r.entity_type.toLowerCase().includes(filter.toLowerCase()))
    : rows;

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
    if (inp === '/')  { setFiltering(true); setFilter(''); return; }
    if (key.escape)  { setFilter(''); setFiltering(false); return; }
    if (inp === 'r') { void fetchData(); return; }
  });

  const cols = process.stdout.columns ?? 80;
  const panelWidth = cols - 54;

  if (!activeConnection) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text color="#374151">── not connected ──</Text>
        <Text color="#4a5568" dimColor>Connect to a database first</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box gap={2}>
        <Text color="#00d4ff" bold>STREAM MONITOR</Text>
        {loading && <Text color="#f59e0b">{SPINNER[spinIdx]} refreshing...</Text>}
        {!loading && lastRefresh && (
          <Text color="#374151" dimColor>
            updated {lastRefresh.toLocaleTimeString()}
          </Text>
        )}
        <Text color="#374151" dimColor>auto-refresh 10s</Text>
      </Box>

      {error && <Text color="#ef4444">{error}</Text>}

      {filtering && (
        <Box><Text color="#00d4ff">  / </Text><Text color="#e0e0e0">{filter}</Text><Text color="#00d4ff">█</Text></Box>
      )}
      {!filtering && filter && (
        <Box><Text color="#f59e0b">  filter: </Text><Text color="#e0e0e0">{filter}</Text></Box>
      )}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 80))}</Text>

      {/* Column headers */}
      <Box>
        <Text color="#00d4ff" bold>{'STREAM'.padEnd(18)}</Text>
        <Text color="#00d4ff" bold>{'ACTIVITY'.padEnd(16)}</Text>
        <Text color="#00d4ff" bold>{'5MIN'.padEnd(6)}</Text>
        <Text color="#00d4ff" bold>{'LAST'.padEnd(10)}</Text>
        <Text color="#00d4ff" bold>{'DLQ'.padEnd(5)}</Text>
      </Box>
      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 60))}</Text>

      {/* Rows */}
      {filtered.length === 0 && !loading && (
        <Text color="#4a5568" dimColor>
          {rows.length === 0 ? 'No stream data (events_raw table may be empty)' : 'No matches'}
        </Text>
      )}
      {filtered.map((row, i) => {
        const isCursor = i === cursor;
        const epm      = row.events_5min / 5;
        const bar      = activityBar(epm);
        const hasDlq   = row.dlq_count > 0;
        return (
          <Box key={row.entity_type}>
            <Text
              color={isCursor ? '#0a1628' : (hasDlq ? '#f59e0b' : '#e0e0e0')}
              backgroundColor={isCursor ? '#00d4ff' : undefined}
            >
              {row.entity_type.slice(0, 17).padEnd(18)}
            </Text>
            <Text
              color={isCursor ? '#0a1628' : '#10b981'}
              backgroundColor={isCursor ? '#00d4ff' : undefined}
            >
              {bar.padEnd(16)}
            </Text>
            <Text
              color={isCursor ? '#0a1628' : '#a0aec0'}
              backgroundColor={isCursor ? '#00d4ff' : undefined}
            >
              {String(row.events_5min).padStart(5) + ' '}
            </Text>
            <Text
              color={isCursor ? '#0a1628' : '#6b7280'}
              backgroundColor={isCursor ? '#00d4ff' : undefined}
            >
              {fmtAgo(row.latest_ms).padEnd(10)}
            </Text>
            <Text
              color={isCursor ? '#0a1628' : (hasDlq ? '#ef4444' : '#374151')}
              backgroundColor={isCursor ? '#00d4ff' : undefined}
            >
              {hasDlq ? `! ${row.dlq_count}` : '  0'}
            </Text>
          </Box>
        );
      })}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 60))}</Text>
      <Text color="#374151" dimColor>  j/k:row  /:filter  r:refresh  [${cursor + 1}/${filtered.length}]</Text>
    </Box>
  );
};
