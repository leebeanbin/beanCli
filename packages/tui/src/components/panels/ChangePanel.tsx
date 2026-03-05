/**
 * ChangePanel — list, create, submit, execute, and revert change requests.
 * Keys: n=new  s=submit  x=execute  r=revert  f=filter  R=refresh  j/k=cursor
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';
import { SPINNER } from '../../utils/constants.js';
import { useCursor } from '../../hooks/useCursor.js';
import type { ChangeItem } from '../../services/types.js';

type StatusFilter = 'ALL' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'DONE' | 'FAILED';
const STATUS_FILTERS: StatusFilter[] = ['ALL', 'DRAFT', 'PENDING', 'APPROVED', 'DONE', 'FAILED'];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6b7280',
  PENDING: '#f59e0b',
  APPROVED: '#3b82f6',
  EXECUTING: '#a855f7',
  DONE: '#10b981',
  FAILED: '#ef4444',
  REVERTED: '#6b7280',
};

function fmtAge(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
    return `${Math.floor(ms / 86_400_000)}d`;
  } catch {
    return '—';
  }
}

type InputMode = 'list' | 'new-sql' | 'new-desc' | 'confirm-reject';

export const ChangePanel: React.FC = () => {
  const { focusedPanel, overlay, paletteOpen, connectionService, activeConnection } =
    useAppContext();

  const [items, setItems] = useState<ChangeItem[]>([]);
  const [filterIdx, setFilterIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [spinIdx, setSpinIdx] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>('list');
  const [newSql, setNewSql] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const isActive =
    (focusedPanel === 'query' || focusedPanel === 'result') && !overlay && !paletteOpen;

  const filter = STATUS_FILTERS[filterIdx] ?? 'ALL';
  const filtered = useMemo(
    () =>
      filter === 'ALL' ? items : items.filter((c) => c.status.toUpperCase() === filter),
    [items, filter],
  );

  const [cursor, setCursor] = useCursor(filtered.length, isActive && inputMode === 'list');
  const selected = filtered[cursor] ?? null;

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setSpinIdx((i) => (i + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, [loading]);

  const fetchData = useCallback(async () => {
    if (!connectionService?.listChanges) return;
    setLoading(true);
    setStatus(null);
    try {
      const data = await connectionService.listChanges({ limit: 100 });
      setItems(data);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Failed to load changes');
    }
    setLoading(false);
  }, [connectionService]);

  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;
  useEffect(() => {
    void fetchRef.current();
  }, []);

  useInput((inp, key) => {
    if (!isActive) return;

    // ── New Change form ─────────────────────────────────────────────────────
    if (inputMode === 'new-sql') {
      if (key.escape) {
        setInputMode('list');
        setNewSql('');
        setNewDesc('');
        return;
      }
      if (key.return) {
        setInputMode('new-desc');
        return;
      }
      if (key.backspace) {
        setNewSql((s) => s.slice(0, -1));
        return;
      }
      if (inp && inp >= ' ' && !key.ctrl) {
        setNewSql((s) => s + inp);
      }
      return;
    }

    if (inputMode === 'new-desc') {
      if (key.escape) {
        setInputMode('new-sql');
        return;
      }
      if (key.return) {
        void (async () => {
          if (!connectionService?.createChange) return;
          setLoading(true);
          try {
            await connectionService.createChange(newSql, newDesc || undefined);
            setStatus('Change created');
            setNewSql('');
            setNewDesc('');
            setInputMode('list');
            await fetchData();
          } catch (e) {
            setStatus(e instanceof Error ? e.message : 'Failed to create change');
            setInputMode('list');
          }
          setLoading(false);
        })();
        return;
      }
      if (key.backspace) {
        setNewDesc((s) => s.slice(0, -1));
        return;
      }
      if (inp && inp >= ' ' && !key.ctrl) {
        setNewDesc((s) => s + inp);
      }
      return;
    }

    // ── List mode ──────────────────────────────────────────────────────────
    if (inp === 'n') {
      setInputMode('new-sql');
      setNewSql('');
      setNewDesc('');
      return;
    }
    if (inp === 'f') {
      setFilterIdx((i) => (i + 1) % STATUS_FILTERS.length);
      setCursor(0);
      return;
    }
    if (inp === 'R') {
      void fetchData();
      return;
    }
    if (!selected) return;

    if (inp === 's') {
      void (async () => {
        if (!connectionService?.submitChange) return;
        setLoading(true);
        try {
          await connectionService.submitChange(selected.id);
          setStatus(`Submitted ${selected.id}`);
          await fetchData();
        } catch (e) {
          setStatus(e instanceof Error ? e.message : 'Submit failed');
          setLoading(false);
        }
      })();
      return;
    }
    if (inp === 'x') {
      void (async () => {
        if (!connectionService?.executeChange) return;
        setLoading(true);
        try {
          const res = await connectionService.executeChange(selected.id);
          setStatus(`Executed — ${res.affectedRows ?? 0} rows`);
          await fetchData();
        } catch (e) {
          setStatus(e instanceof Error ? e.message : 'Execute failed');
          setLoading(false);
        }
      })();
      return;
    }
    if (inp === 'r') {
      void (async () => {
        if (!connectionService?.revertChange) return;
        setLoading(true);
        try {
          await connectionService.revertChange(selected.id);
          setStatus(`Reverted ${selected.id}`);
          await fetchData();
        } catch (e) {
          setStatus(e instanceof Error ? e.message : 'Revert failed');
          setLoading(false);
        }
      })();
      return;
    }
  });

  const cols = process.stdout.columns ?? 80;
  const panelWidth = cols - 54;

  if (!activeConnection && !connectionService?.listChanges) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text color="#374151">── not connected ──</Text>
      </Box>
    );
  }

  if (inputMode === 'new-sql') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text color="#00d4ff" bold> NEW CHANGE REQUEST</Text>
        <Text color="#374151">{'─'.repeat(40)}</Text>
        <Box>
          <Text color="#f59e0b"> SQL: </Text>
          <Text color="#e0e0e0">{newSql}</Text>
          <Text color="#00d4ff">█</Text>
        </Box>
        <Text color="#374151" dimColor>  Enter:next  Esc:cancel</Text>
      </Box>
    );
  }

  if (inputMode === 'new-desc') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text color="#00d4ff" bold> NEW CHANGE REQUEST</Text>
        <Text color="#374151">{'─'.repeat(40)}</Text>
        <Box>
          <Text color="#6b7280"> SQL: </Text>
          <Text color="#4a5568" wrap="truncate">{newSql.slice(0, 50)}</Text>
        </Box>
        <Box>
          <Text color="#f59e0b"> Desc: </Text>
          <Text color="#e0e0e0">{newDesc}</Text>
          <Text color="#00d4ff">█</Text>
        </Box>
        <Text color="#374151" dimColor>  Enter:save  Esc:back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Filter tabs */}
      <Box gap={1}>
        {STATUS_FILTERS.map((f, i) => (
          <Text
            key={f}
            color={i === filterIdx ? '#0a1628' : (STATUS_COLORS[f] ?? '#6b7280')}
            backgroundColor={i === filterIdx ? '#00d4ff' : undefined}
            bold={i === filterIdx}
          >
            {` ${f} `}
          </Text>
        ))}
        {loading && <Text color="#f59e0b">{SPINNER[spinIdx]}</Text>}
        <Text color="#374151" dimColor>({filtered.length})</Text>
      </Box>

      {status && (
        <Text color="#10b981" wrap="truncate"> {status}</Text>
      )}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 80))}</Text>

      {/* Header */}
      <Box>
        <Text color="#00d4ff" bold>{'ID'.padEnd(10)}</Text>
        <Text color="#00d4ff" bold>{'STATUS'.padEnd(12)}</Text>
        <Text color="#00d4ff" bold>{'ACTOR'.padEnd(12)}</Text>
        <Text color="#00d4ff" bold>{'AGE'.padEnd(6)}</Text>
        <Text color="#00d4ff" bold>{'SQL'}</Text>
      </Box>
      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 70))}</Text>

      {filtered.length === 0 && !loading && (
        <Text color="#4a5568" dimColor>  No change requests</Text>
      )}

      {filtered.slice(0, 18).map((item, i) => {
        const isCur = i === cursor;
        const stColor = STATUS_COLORS[item.status.toUpperCase()] ?? '#6b7280';
        return (
          <Box key={item.id}>
            <Text color={isCur ? '#0a1628' : '#a0aec0'} backgroundColor={isCur ? '#00d4ff' : undefined}>
              {item.id.slice(0, 9).padEnd(10)}
            </Text>
            <Text color={isCur ? '#0a1628' : stColor} backgroundColor={isCur ? '#00d4ff' : undefined}>
              {item.status.slice(0, 11).padEnd(12)}
            </Text>
            <Text color={isCur ? '#0a1628' : '#a0aec0'} backgroundColor={isCur ? '#00d4ff' : undefined}>
              {String(item.actor ?? '').slice(0, 11).padEnd(12)}
            </Text>
            <Text color={isCur ? '#0a1628' : '#6b7280'} backgroundColor={isCur ? '#00d4ff' : undefined}>
              {fmtAge(item.created_at).padEnd(6)}
            </Text>
            <Text color={isCur ? '#0a1628' : '#4a5568'} backgroundColor={isCur ? '#00d4ff' : undefined} wrap="truncate">
              {String(item.sql ?? '').replace(/\n/g, ' ').slice(0, 30)}
            </Text>
          </Box>
        );
      })}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 70))}</Text>

      {/* Detail */}
      {selected && (
        <Box flexDirection="column" marginTop={0}>
          <Box>
            <Text color="#f59e0b"> [{selected.status}] </Text>
            <Text color="#a0aec0">{selected.id}</Text>
            {selected.description && (
              <Text color="#6b7280"> — {selected.description}</Text>
            )}
          </Box>
          <Box>
            <Text color="#374151">  </Text>
            <Text color="#e0e0e0" wrap="truncate">
              {String(selected.sql ?? '').replace(/\n/g, ' ').slice(0, panelWidth - 4)}
            </Text>
          </Box>
          {selected.failure_reason && (
            <Text color="#ef4444" wrap="truncate">  ! {selected.failure_reason}</Text>
          )}
        </Box>
      )}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 70))}</Text>
      <Text color="#374151" dimColor>
        {'  j/k:row  n:new  s:submit  x:exec  r:revert  f:filter  R:refresh'}
      </Text>
    </Box>
  );
};
