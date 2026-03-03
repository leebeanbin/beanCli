import { useState, useCallback, useEffect } from 'react';
import { useAppContext } from '../context/AppContext.js';
import { detectQueryType } from '../utils/formatValue.js';

// Rough row-count estimate from EXPLAIN output (PG and MySQL)
function parseExplainRows(rows: Record<string, unknown>[]): number {
  if (!rows.length) return 0;
  // PostgreSQL: "QUERY PLAN" column, look for "rows=N"
  const pgPlan = String(rows[0]?.['QUERY PLAN'] ?? '');
  const pgMatch = pgPlan.match(/rows=(\d+)/);
  if (pgMatch) return Number(pgMatch[1]);
  // MySQL: "rows" column
  const mysqlRows = rows[0]?.['rows'];
  if (mysqlRows !== undefined) return Number(mysqlRows);
  return 0;
}

const MAX_HISTORY = 50;

export interface UseQueryReturn {
  input:           string;
  setInput:        (s: string) => void;
  cursorPos:       number;
  insertAtCursor:  (text: string) => void;
  deleteAtCursor:  () => void;
  moveCursor:      (delta: number) => void;
  history:         string[];
  histIdx:         number;
  loading:         boolean;
  execute:         (sql?: string) => Promise<void>;
  confirmDml:      () => Promise<void>;
  cancelDml:       () => void;
  navHistory:      (dir: 1 | -1) => void;
  clearInput:      () => void;
}

export function useQuery(): UseQueryReturn {
  const {
    connectionService, activeConnection,
    setQueryResult, setQueryLoading, setQueryError,
    setFocusedPanel, pendingSql, setPendingSql,
    dmlConfirm, setDmlConfirm,
    initialHistory, onHistoryAdd,
  } = useAppContext();

  const [input,     setInputRaw]  = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [history,   setHistory]   = useState<string[]>(initialHistory);
  const [histIdx,   setHistIdx]   = useState(-1);
  const [loading,   setLoading]   = useState(false);

  // setInput also resets cursor to end
  const setInput = useCallback((s: string) => {
    setInputRaw(s);
    setCursorPos(s.length);
  }, []);

  // Pick up SQL injected by other panels
  useEffect(() => {
    if (pendingSql) {
      setInput(pendingSql);
      setPendingSql(null);
      setHistIdx(-1);
    }
  }, [pendingSql, setPendingSql, setInput]);

  const insertAtCursor = useCallback((text: string) => {
    setInputRaw(s => s.slice(0, cursorPos) + text + s.slice(cursorPos));
    setCursorPos(p => p + text.length);
  }, [cursorPos]);

  const deleteAtCursor = useCallback(() => {
    setCursorPos(p => {
      if (p === 0) return p;
      setInputRaw(s => s.slice(0, p - 1) + s.slice(p));
      return p - 1;
    });
  }, []);

  const moveCursor = useCallback((delta: number) => {
    setCursorPos(p => {
      // Can't easily read input.length here without closure capture, so
      // we use a functional update with setInputRaw
      return Math.max(0, p + delta);
    });
    // Clamp to input length separately via effect — avoid stale closure
  }, []);

  const runQuery = useCallback(async (query: string) => {
    if (!connectionService || !activeConnection) {
      setQueryError('Not connected — select a connection in the Schema panel.');
      return;
    }
    setLoading(true);
    setQueryLoading(true);
    setQueryError(null);
    setFocusedPanel('result');

    const result = await connectionService.executeQuery(query);
    if (!result.type) result.type = detectQueryType(query);

    setLoading(false);
    setQueryLoading(false);

    if (result.error) {
      setQueryError(result.error);
      setQueryResult(null);
    } else {
      setQueryResult(result);
      setQueryError(null);
      setHistory(prev =>
        [query, ...prev.filter(h => h !== query)].slice(0, MAX_HISTORY),
      );
      onHistoryAdd?.(query);
      setHistIdx(-1);
    }
  }, [connectionService, activeConnection,
      setQueryResult, setQueryLoading, setQueryError, setFocusedPanel]);

  const execute = useCallback(async (sql?: string) => {
    const query = (sql ?? input).trim();
    if (!query) return;
    if (!connectionService || !activeConnection) {
      setQueryError('Not connected — select a connection in the Schema panel.');
      return;
    }

    const qType = detectQueryType(query);

    // DML (UPDATE / DELETE / INSERT) — estimate row count, ask for confirmation
    if (qType === 'dml') {
      try {
        const explainRes = await connectionService.executeQuery(`EXPLAIN ${query}`);
        const estimated  = parseExplainRows(explainRes.rows);
        setDmlConfirm({ sql: query, rowCount: estimated });
        return; // wait for user confirmation
      } catch {
        // EXPLAIN failed (e.g. MySQL INSERT, non-supported driver) — just run
      }
    }

    await runQuery(query);
  }, [input, connectionService, activeConnection, runQuery,
      setQueryError, setDmlConfirm]);

  /** Confirm pending DML — called when user presses y */
  const confirmDml = useCallback(async () => {
    if (!dmlConfirm) return;
    const query = dmlConfirm.sql;
    setDmlConfirm(null);
    await runQuery(query);
  }, [dmlConfirm, setDmlConfirm, runQuery]);

  /** Cancel pending DML — called when user presses n/Esc */
  const cancelDml = useCallback(() => {
    setDmlConfirm(null);
  }, [setDmlConfirm]);

  const navHistory = useCallback((dir: 1 | -1) => {
    setHistIdx(prev => {
      const next = prev + dir;
      if (next < -1) return prev;
      if (next >= history.length) return prev;
      const entry = next === -1 ? '' : (history[next] ?? '');
      setInputRaw(entry);
      setCursorPos(entry.length);
      return next;
    });
  }, [history]);

  const clearInput = useCallback(() => {
    setInputRaw('');
    setCursorPos(0);
    setHistIdx(-1);
  }, []);

  return {
    input, setInput,
    cursorPos, insertAtCursor, deleteAtCursor, moveCursor,
    history, histIdx, loading,
    execute, confirmDml, cancelDml, navHistory, clearInput,
  };
}
