import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';
import { SPINNER } from '../../utils/constants.js';

type Category = 'ALL' | 'AUTH' | 'CHANGE' | 'APPROVAL' | 'SYSTEM';
const CATEGORIES: Category[] = ['ALL', 'AUTH', 'CHANGE', 'APPROVAL', 'SYSTEM'];
const CAT_COLORS: Record<Category, string> = {
  ALL:      '#00d4ff',
  AUTH:     '#ef4444',
  CHANGE:   '#f59e0b',
  APPROVAL: '#10b981',
  SYSTEM:   '#6b7280',
};

const AUDIT_SQL = `
SELECT
  id,
  category,
  actor,
  action,
  result,
  created_at
FROM audit_events
ORDER BY created_at DESC
LIMIT 200
`.trim();

function fmtTime(ts: unknown): string {
  if (!ts) return '—';
  try {
    const d = new Date(String(ts));
    return d.toLocaleTimeString('en-US', { hour12: false });
  } catch { return String(ts).slice(0, 8); }
}

export const AuditPanel: React.FC = () => {
  const { focusedPanel, overlay, paletteOpen, connectionService, activeConnection } = useAppContext();

  const [allRows,    setAllRows]    = useState<Record<string, unknown>[]>([]);
  const [catIdx,     setCatIdx]     = useState(0);
  const [cursor,     setCursor]     = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [filter,     setFilter]     = useState('');
  const [filtering,  setFiltering]  = useState(false);
  const [spinIdx,    setSpinIdx]    = useState(0);

  const isActive = (focusedPanel === 'query' || focusedPanel === 'result') && !overlay && !paletteOpen;
  const cat      = CATEGORIES[catIdx] ?? 'ALL';

  const catFiltered = cat === 'ALL'
    ? allRows
    : allRows.filter(r => String(r['category'] ?? '').toUpperCase() === cat);

  const filtered = filter
    ? catFiltered.filter(r =>
        Object.values(r).some(v => String(v ?? '').toLowerCase().includes(filter.toLowerCase())),
      )
    : catFiltered;

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setSpinIdx(i => (i + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, [loading]);

  const fetchData = useCallback(async () => {
    if (!connectionService || !activeConnection) return;
    setLoading(true);
    setError(null);
    const res = await connectionService.executeQuery(AUDIT_SQL);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setAllRows(res.rows);
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
    if (inp === 'f') { setCatIdx(i => (i + 1) % CATEGORIES.length); setCursor(0); return; }
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
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Category tabs */}
      <Box gap={1}>
        {CATEGORIES.map((c, i) => (
          <Text
            key={c}
            color={i === catIdx ? '#0a1628' : CAT_COLORS[c]}
            backgroundColor={i === catIdx ? CAT_COLORS[c] : undefined}
            bold={i === catIdx}
          >
            {` ${c} `}
          </Text>
        ))}
        {loading && <Text color="#f59e0b">{SPINNER[spinIdx]}</Text>}
        <Text color="#374151" dimColor>({filtered.length})</Text>
      </Box>

      {error && <Text color="#ef4444" wrap="truncate">{error}</Text>}

      {filtering && (
        <Box><Text color="#00d4ff">  / </Text><Text color="#e0e0e0">{filter}</Text><Text color="#00d4ff">█</Text></Box>
      )}
      {!filtering && filter && (
        <Box><Text color="#f59e0b">  filter: </Text><Text color="#e0e0e0">{filter}</Text></Box>
      )}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 80))}</Text>

      {/* Column headers */}
      <Box>
        <Text color="#00d4ff" bold>{'TIME'.padEnd(10)}</Text>
        <Text color="#00d4ff" bold>{'CATEGORY'.padEnd(12)}</Text>
        <Text color="#00d4ff" bold>{'ACTOR'.padEnd(14)}</Text>
        <Text color="#00d4ff" bold>{'ACTION'.padEnd(24)}</Text>
        <Text color="#00d4ff" bold>{'RESULT'}</Text>
      </Box>
      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 65))}</Text>

      {/* Rows */}
      {filtered.length === 0 && !loading && (
        <Text color="#4a5568" dimColor>
          {allRows.length === 0 ? 'No audit events (audit_events table may be empty)' : 'No matches'}
        </Text>
      )}
      {filtered.slice(0, 20).map((row, i) => {
        const isCursor = i === cursor;
        const result   = String(row['result'] ?? '');
        const isOk     = result.toUpperCase() === 'OK' || result.toUpperCase() === 'SUCCESS';
        return (
          <Box key={i}>
            <Text color={isCursor ? '#0a1628' : '#6b7280'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
              {fmtTime(row['created_at']).padEnd(10)}
            </Text>
            <Text
              color={isCursor ? '#0a1628' : (CAT_COLORS[String(row['category'] ?? '').toUpperCase() as Category] ?? '#6b7280')}
              backgroundColor={isCursor ? '#00d4ff' : undefined}
            >
              {String(row['category'] ?? '').slice(0, 11).padEnd(12)}
            </Text>
            <Text color={isCursor ? '#0a1628' : '#a0aec0'} backgroundColor={isCursor ? '#00d4ff' : undefined}>
              {String(row['actor'] ?? '').slice(0, 13).padEnd(14)}
            </Text>
            <Text color={isCursor ? '#0a1628' : '#e0e0e0'} backgroundColor={isCursor ? '#00d4ff' : undefined} wrap="truncate">
              {String(row['action'] ?? '').slice(0, 23).padEnd(24)}
            </Text>
            <Text
              color={isCursor ? '#0a1628' : (isOk ? '#10b981' : '#ef4444')}
              backgroundColor={isCursor ? '#00d4ff' : undefined}
            >
              {isOk ? '+ OK' : `! ${result.slice(0, 4)}`}
            </Text>
          </Box>
        );
      })}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 65))}</Text>
      <Text color="#374151" dimColor>
        {`  j/k:row  f:category  /:filter  r:refresh  [${cursor + 1}/${filtered.length}]`}
      </Text>
    </Box>
  );
};
