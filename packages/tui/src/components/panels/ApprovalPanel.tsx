/**
 * ApprovalPanel — list and act on pending approvals.
 * Keys: a=approve  r=reject (y/n)  R=refresh  j/k=cursor
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';
import { SPINNER } from '../../utils/constants.js';
import { useCursor } from '../../hooks/useCursor.js';
import type { ChangeItem } from '../../services/types.js';

type ActionMode = 'list' | 'confirm-reject';

export const ApprovalPanel: React.FC = () => {
  const { focusedPanel, overlay, paletteOpen, connectionService } = useAppContext();

  const [items, setItems] = useState<ChangeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [spinIdx, setSpinIdx] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>('list');

  const isActive =
    (focusedPanel === 'query' || focusedPanel === 'result') && !overlay && !paletteOpen;

  const [cursor, setCursor] = useCursor(items.length, isActive && actionMode === 'list');
  const selected = items[cursor] ?? null;

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setSpinIdx((i) => (i + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, [loading]);

  const fetchData = useCallback(async () => {
    if (!connectionService?.listPendingApprovals) return;
    setLoading(true);
    setStatus(null);
    try {
      const data = await connectionService.listPendingApprovals();
      setItems(data);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Failed to load approvals');
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

    if (actionMode === 'confirm-reject') {
      if (inp === 'y' || inp === 'Y') {
        void (async () => {
          if (!connectionService?.rejectChange || !selected) return;
          setLoading(true);
          try {
            await connectionService.rejectChange(selected.id);
            setStatus(`Rejected ${selected.id}`);
            setCursor(0);
            await fetchData();
          } catch (e) {
            setStatus(e instanceof Error ? e.message : 'Reject failed');
            setLoading(false);
          }
          setActionMode('list');
        })();
        return;
      }
      if (inp === 'n' || inp === 'N' || key.escape) {
        setActionMode('list');
        return;
      }
      return;
    }

    if (inp === 'R') {
      void fetchData();
      return;
    }
    if (!selected) return;

    if (inp === 'a') {
      void (async () => {
        if (!connectionService?.approveChange) return;
        setLoading(true);
        try {
          await connectionService.approveChange(selected.id);
          setStatus(`Approved ${selected.id}`);
          setCursor(0);
          await fetchData();
        } catch (e) {
          setStatus(e instanceof Error ? e.message : 'Approve failed');
          setLoading(false);
        }
      })();
      return;
    }
    if (inp === 'r') {
      setActionMode('confirm-reject');
      return;
    }
  });

  const cols = process.stdout.columns ?? 80;
  const panelWidth = cols - 54;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box gap={2}>
        <Text color="#00d4ff" bold> PENDING APPROVALS</Text>
        {loading && <Text color="#f59e0b">{SPINNER[spinIdx]}</Text>}
        <Text color="#374151" dimColor>({items.length})</Text>
      </Box>

      {status && (
        <Text color="#10b981" wrap="truncate"> {status}</Text>
      )}

      {actionMode === 'confirm-reject' && selected && (
        <Box>
          <Text color="#ef4444" bold> Reject {selected.id}? </Text>
          <Text color="#10b981" bold>y</Text>
          <Text color="#374151">/</Text>
          <Text color="#ef4444" bold>n</Text>
        </Box>
      )}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 80))}</Text>

      {/* Header */}
      <Box>
        <Text color="#00d4ff" bold>{'ID'.padEnd(10)}</Text>
        <Text color="#00d4ff" bold>{'ACTOR'.padEnd(12)}</Text>
        <Text color="#00d4ff" bold>{'ENV'.padEnd(8)}</Text>
        <Text color="#00d4ff" bold>{'SQL'}</Text>
      </Box>
      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 70))}</Text>

      {items.length === 0 && !loading && (
        <Text color="#4a5568" dimColor>  No pending approvals</Text>
      )}

      {items.slice(0, 18).map((item, i) => {
        const isCur = i === cursor;
        return (
          <Box key={item.id}>
            <Text color={isCur ? '#0a1628' : '#a0aec0'} backgroundColor={isCur ? '#f59e0b' : undefined}>
              {item.id.slice(0, 9).padEnd(10)}
            </Text>
            <Text color={isCur ? '#0a1628' : '#a0aec0'} backgroundColor={isCur ? '#f59e0b' : undefined}>
              {String(item.actor ?? '').slice(0, 11).padEnd(12)}
            </Text>
            <Text color={isCur ? '#0a1628' : '#6b7280'} backgroundColor={isCur ? '#f59e0b' : undefined}>
              {String(item.environment ?? '').slice(0, 7).padEnd(8)}
            </Text>
            <Text color={isCur ? '#0a1628' : '#4a5568'} backgroundColor={isCur ? '#f59e0b' : undefined} wrap="truncate">
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
            <Text color="#f59e0b"> [{selected.environment}] </Text>
            <Text color="#a0aec0">{selected.actor}</Text>
          </Box>
          <Box>
            <Text color="#374151">  SQL: </Text>
            <Text color="#e0e0e0" wrap="truncate">
              {String(selected.sql ?? '').replace(/\n/g, ' ').slice(0, panelWidth - 8)}
            </Text>
          </Box>
          {selected.description && (
            <Text color="#6b7280" wrap="truncate">  {selected.description}</Text>
          )}
        </Box>
      )}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 70))}</Text>
      <Text color="#374151" dimColor>
        {'  j/k:row  a:approve  r:reject  R:refresh'}
      </Text>
    </Box>
  );
};
