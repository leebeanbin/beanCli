import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';
import { formatValue } from '../../utils/formatValue.js';
import { quoteIdent, escStr, detectPk } from '../../utils/sql.js';
import { SPINNER, PAGE_SIZE, COL_WINDOW } from '../../utils/constants.js';
import { useCursor } from '../../hooks/useCursor.js';
import { EditOverlayView } from './EditOverlayView.js';
import type { EditOverlay } from './EditOverlayView.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type LocalView = 'table' | 'detail' | 'schema';

// ── Detail View ───────────────────────────────────────────────────────────────

const DetailView: React.FC<{
  tableName: string;
  columns: string[];
  row: Record<string, unknown>;
  rowIdx: number;
  rowCount: number;
  panelWidth: number;
}> = ({ tableName, columns, row, rowIdx, rowCount, panelWidth }) => (
  <Box flexDirection="column" flexGrow={1}>
    <Box gap={2}>
      <Text color="#00d4ff" bold>
        {tableName}
      </Text>
      <Text color="#4a5568">
        Row {rowIdx + 1} / {rowCount}
      </Text>
    </Box>
    <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 80))}</Text>
    {columns.map((col) => (
      <Box key={col}>
        <Text color="#00d4ff">{col.slice(0, 22).padEnd(23)}</Text>
        <Text color="#e0e0e0" wrap="truncate">
          {formatValue(col, row[col], row)}
        </Text>
      </Box>
    ))}
    <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 80))}</Text>
    <Text color="#374151" dimColor>
      j/k:row v:table e:edit d:delete [/]:cycle r:reload Q:query
    </Text>
  </Box>
);

// ── ExplorePanel ──────────────────────────────────────────────────────────────

export const ExplorePanel: React.FC = () => {
  const {
    focusedPanel,
    overlay: appOverlay,
    paletteOpen,
    browseTable,
    setBrowseTable,
    tables,
    connectionService,
    activeConnection,
    setAppMode,
    setFocusedPanel,
    setPendingSql,
    userRole,
  } = useAppContext();

  // Role-based CRUD permissions
  const canWrite = userRole === 'DBA' || userRole === 'MANAGER' || userRole === null;
  const canDelete = userRole === 'DBA' || userRole === null;

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [colCursor, setColCursor] = useState(0);
  const [view, setView] = useState<LocalView>('table');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [spinIdx, setSpinIdx] = useState(0);
  const [editOvl, setEditOvl] = useState<EditOverlay>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [schema, setSchema] = useState<
    Array<{ column: string; type: string; nullable: string; default: string }>
  >([]);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const isActive =
    (focusedPanel === 'query' || focusedPanel === 'result') && !appOverlay && !paletteOpen;

  // Auto-clear feedback
  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(id);
  }, [feedback]);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setSpinIdx((i) => (i + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, [loading]);

  const fetchData = useCallback(
    async (tableName: string) => {
      if (!connectionService || !activeConnection) return;
      setLoading(true);
      setError(null);
      const result = await connectionService.executeQuery(
        `SELECT * FROM ${quoteIdent(tableName, activeConnection?.type)} LIMIT 500`,
      );
      setLoading(false);
      if (result.error) {
        setError(result.error);
      } else {
        setRows(result.rows);
        setColumns(result.columns);
        setCursor(0);
        setColCursor(0);
        setFilter('');
        setView('table');
        setEditOvl(null);
      }
    },
    [connectionService, activeConnection],
  );

  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;
  useEffect(() => {
    if (browseTable) void fetchRef.current(browseTable);
  }, [browseTable]);

  // Filtered rows — useMemo so filter re-runs only when rows or filter change
  const filteredRows = useMemo(
    () =>
      filter
        ? rows.filter((row) =>
            Object.values(row).some((v) =>
              String(v ?? '')
                .toLowerCase()
                .includes(filter.toLowerCase()),
            ),
          )
        : rows,
    [rows, filter],
  );

  const [cursor, setCursor] = useCursor(
    filteredRows.length,
    isActive && !filtering && editOvl === null,
  );

  const maxCursor = Math.max(0, filteredRows.length - 1);
  const maxColCursor = Math.max(0, columns.length - 1);
  const pk = detectPk(columns);

  // Sliding column window — show up to 6 columns centred on colCursor
  const colWinStart = Math.max(0, Math.min(colCursor - 2, columns.length - COL_WINDOW));
  const displayCols = columns.slice(colWinStart, colWinStart + COL_WINDOW);
  const editableCols = columns.filter((c) => c !== pk);

  // Schema fetch (information_schema)
  const fetchSchema = useCallback(
    async (tableName: string) => {
      if (!connectionService) return;
      setSchemaLoading(true);
      const safeName = tableName.replace(/'/g, "''");
      const dbType = activeConnection?.type;
      const schemaFilter =
        dbType === 'mysql'
          ? `table_name = '${safeName}' AND table_schema = DATABASE()`
          : `table_name = '${safeName}'`;
      const sql = `SELECT column_name AS "column", data_type AS "type", is_nullable AS "nullable", COALESCE(column_default, '') AS "default" FROM information_schema.columns WHERE ${schemaFilter} ORDER BY ordinal_position`;
      const res = await connectionService.executeQuery(sql);
      setSchemaLoading(false);
      if (!res.error) {
        setSchema(
          res.rows as Array<{ column: string; type: string; nullable: string; default: string }>,
        );
      }
    },
    [connectionService, activeConnection],
  );

  // Table cycling
  const switchTable = useCallback(
    (dir: 1 | -1) => {
      if (tables.length === 0) return;
      const idx = browseTable ? tables.indexOf(browseTable) : -1;
      const next = (idx + dir + tables.length) % tables.length;
      setBrowseTable(tables[next] ?? null);
    },
    [tables, browseTable, setBrowseTable],
  );

  // ── CRUD helpers ────────────────────────────────────────────────────────────

  const runSql = useCallback(
    async (sql: string, onSuccess: () => void) => {
      if (!connectionService) return;
      const res = await connectionService.executeQuery(sql);
      if (res.error) {
        setFeedback(`! ${res.error.slice(0, 40)}`);
      } else {
        setFeedback('+ OK');
        onSuccess();
      }
    },
    [connectionService],
  );

  const commitEdit = useCallback(
    async (ov: {
      type: 'edit';
      row: Record<string, unknown>;
      fieldIdx: number;
      buffer: string;
    }) => {
      const col = editableCols[ov.fieldIdx];
      const pkValue = ov.row[pk];
      if (!col || pkValue === undefined || !browseTable) return;
      const dbType = activeConnection?.type;
      const sql = `UPDATE ${quoteIdent(browseTable, dbType)} SET ${quoteIdent(col, dbType)} = ${escStr(ov.buffer)} WHERE ${quoteIdent(pk, dbType)} = ${escStr(pkValue)}`;
      await runSql(sql, () => {
        setEditOvl(null);
        void fetchRef.current(browseTable);
      });
    },
    [editableCols, pk, browseTable, runSql, activeConnection],
  );

  const commitInsert = useCallback(
    async (ov: { type: 'insert'; values: Record<string, string>; fieldIdx: number }) => {
      if (!browseTable) return;
      const cols = editableCols.filter((c) => ov.values[c]?.trim());
      if (cols.length === 0) {
        setEditOvl(null);
        return;
      }
      const dbType = activeConnection?.type;
      const sql = `INSERT INTO ${quoteIdent(browseTable, dbType)} (${cols.map((c) => quoteIdent(c, dbType)).join(', ')}) VALUES (${cols.map((c) => escStr(ov.values[c])).join(', ')})`;
      await runSql(sql, () => {
        setEditOvl(null);
        void fetchRef.current(browseTable);
      });
    },
    [editableCols, browseTable, runSql, activeConnection],
  );

  const commitDelete = useCallback(
    async (pkValue: string) => {
      if (!browseTable) return;
      const dbType = activeConnection?.type;
      const sql = `DELETE FROM ${quoteIdent(browseTable, dbType)} WHERE ${quoteIdent(pk, dbType)} = ${escStr(pkValue)}`;
      await runSql(sql, () => {
        setEditOvl(null);
        setCursor((c) => Math.max(0, c - 1));
        void fetchRef.current(browseTable);
      });
    },
    [browseTable, pk, runSql, activeConnection],
  );

  // ── Input handling ────────────────────────────────────────────────────────

  useInput((inp, key) => {
    if (!isActive) return;

    // ── Edit overlay input ───────────────────────────────────────────────────
    if (editOvl) {
      if (editOvl.type === 'delete') {
        if (inp === 'y' || inp === 'Y') {
          void commitDelete(editOvl.pkValue);
          return;
        }
        setEditOvl(null);
        return;
      }

      if (editOvl.type === 'edit') {
        if (key.escape) {
          setEditOvl(null);
          return;
        }
        if (key.return) {
          void commitEdit(editOvl);
          return;
        }
        if (key.tab) {
          const next = (editOvl.fieldIdx + 1) % editableCols.length;
          const nextVal = String(editOvl.row[editableCols[next] ?? ''] ?? '');
          setEditOvl({ ...editOvl, fieldIdx: next, buffer: nextVal });
          return;
        }
        if (key.backspace) {
          setEditOvl({ ...editOvl, buffer: editOvl.buffer.slice(0, -1) });
          return;
        }
        if (inp && inp >= ' ' && !key.ctrl) {
          setEditOvl({ ...editOvl, buffer: editOvl.buffer + inp });
          return;
        }
        return;
      }

      if (editOvl.type === 'insert') {
        const col = editableCols[editOvl.fieldIdx] ?? '';
        if (key.escape) {
          setEditOvl(null);
          return;
        }
        if (key.return) {
          void commitInsert(editOvl);
          return;
        }
        if (key.tab) {
          const next = (editOvl.fieldIdx + 1) % editableCols.length;
          setEditOvl({ ...editOvl, fieldIdx: next });
          return;
        }
        if (key.backspace) {
          const cur = editOvl.values[col] ?? '';
          setEditOvl({ ...editOvl, values: { ...editOvl.values, [col]: cur.slice(0, -1) } });
          return;
        }
        if (inp && inp >= ' ' && !key.ctrl) {
          const cur = editOvl.values[col] ?? '';
          setEditOvl({ ...editOvl, values: { ...editOvl.values, [col]: cur + inp } });
          return;
        }
        return;
      }
    }

    // ── Filter mode ──────────────────────────────────────────────────────────
    if (filtering) {
      if (key.escape || key.return) {
        setFiltering(false);
        return;
      }
      if (key.backspace) {
        setFilter((s) => s.slice(0, -1));
        return;
      }
      if (inp && inp >= ' ' && !key.ctrl) {
        setFilter((s) => s + inp);
      }
      return;
    }

    // ── Normal navigation ────────────────────────────────────────────────────
    // j/k/u/d/↑↓ are handled by useCursor
    if (inp === 'g') {
      setCursor(0);
      return;
    }
    if (inp === 'G') {
      setCursor(maxCursor);
      return;
    }

    // Column cursor (table mode only)
    if (view === 'table') {
      if (key.leftArrow || inp === 'h') {
        setColCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow || inp === 'l') {
        setColCursor((c) => Math.min(maxColCursor, c + 1));
        return;
      }
    }

    // Table cycling
    if (inp === '[' || inp === '<') {
      switchTable(-1);
      return;
    }
    if (inp === ']' || inp === '>') {
      switchTable(1);
      return;
    }
    if (key.tab) {
      switchTable(1);
      return;
    }

    // View toggle
    if (inp === 'v') {
      setView((v) => (v === 'table' ? 'detail' : 'table'));
      return;
    }

    // Schema view
    if (inp === 's') {
      if (view !== 'schema') {
        setView('schema');
        if (browseTable) void fetchSchema(browseTable);
      } else {
        setView('table');
      }
      return;
    }

    // Filter
    if (inp === '/') {
      setFiltering(true);
      setFilter('');
      return;
    }
    if (key.escape) {
      setFilter('');
      setFiltering(false);
      return;
    }

    // Refresh
    if (inp === 'r') {
      if (browseTable) {
        if (view === 'schema') void fetchSchema(browseTable);
        else void fetchData(browseTable);
      }
      return;
    }

    // ── CRUD (role-gated) ────────────────────────────────────────────────────
    if (inp === 'e' && filteredRows.length > 0) {
      if (!canWrite) {
        setFeedback('! Read-only (ANALYST role)');
        return;
      }
      const row = filteredRows[cursor]!;
      const col = editableCols[colCursor] ?? editableCols[0] ?? columns[0] ?? '';
      setEditOvl({
        type: 'edit',
        row,
        fieldIdx: editableCols.indexOf(col),
        buffer: String(row[col] ?? ''),
      });
      return;
    }

    if (inp === 'i') {
      if (!canWrite) {
        setFeedback('! Read-only (ANALYST role)');
        return;
      }
      const initVals = Object.fromEntries(editableCols.map((c) => [c, '']));
      setEditOvl({ type: 'insert', values: initVals, fieldIdx: 0 });
      return;
    }

    if (inp === 'D' && filteredRows.length > 0) {
      if (!canDelete) {
        setFeedback('! DBA role required for DELETE');
        return;
      }
      const row = filteredRows[cursor]!;
      const pkValue = String(row[pk] ?? '');
      setEditOvl({ type: 'delete', pkValue });
      return;
    }

    // Switch to query mode
    if (inp === 'Q') {
      if (browseTable)
        setPendingSql(`SELECT * FROM ${quoteIdent(browseTable, activeConnection?.type)} LIMIT 50;`);
      setAppMode('query');
      setFocusedPanel('query');
      return;
    }

    // Note: 't' key is handled at AppShell level (opens TablePickerOverlay)
  });

  // ── Layout ────────────────────────────────────────────────────────────────

  const cols = process.stdout.columns ?? 80;
  const panelWidth = cols - 54;
  const colWidth =
    displayCols.length > 0
      ? Math.max(8, Math.floor(Math.min(panelWidth, 120) / displayCols.length))
      : 12;
  const colWidths = displayCols.map(() => colWidth);

  // ── Empty / error states ──────────────────────────────────────────────────

  if (!browseTable) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text color="#374151">── no table selected ──</Text>
        <Text color="#4a5568" dimColor>
          Select a table from Schema panel → Enter
        </Text>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text color="#00d4ff">
          {SPINNER[spinIdx]} Loading {browseTable}...
        </Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" flexGrow={1} minWidth={0}>
        <Text color="#ef4444" bold>
          ✕ {browseTable}
        </Text>
        <Box minWidth={0}>
          <Text color="#fca5a5" wrap="wrap">
            {error}
          </Text>
        </Box>
        <Text color="#374151" dimColor>
          r:retry Q:query mode
        </Text>
      </Box>
    );
  }

  // ── Delete confirmation ───────────────────────────────────────────────────

  if (editOvl?.type === 'delete') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text color="#ef4444" bold>
          DELETE ROW
        </Text>
        <Text color="#1a2a3a">{'─'.repeat(30)}</Text>
        <Text color="#fca5a5">
          {pk}: {editOvl.pkValue.slice(0, 30)}
        </Text>
        <Text color="#1a2a3a">{'─'.repeat(30)}</Text>
        <Text color="#e0e0e0">
          Confirm delete?{' '}
          <Text color="#10b981" bold>
            y
          </Text>
          /
          <Text color="#ef4444" bold>
            n
          </Text>
        </Text>
      </Box>
    );
  }

  // ── Edit / Insert overlay ─────────────────────────────────────────────────

  if (editOvl?.type === 'edit' || editOvl?.type === 'insert') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <EditOverlayView
          type={editOvl.type}
          columns={columns}
          pk={pk}
          overlay={editOvl as Parameters<typeof EditOverlayView>[0]['overlay']}
          feedback={feedback}
        />
      </Box>
    );
  }

  // ── Schema view (\\d equivalent) ──────────────────────────────────────────

  if (view === 'schema') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box gap={2}>
          <Text color="#00d4ff" bold>
            {browseTable}
          </Text>
          <Text color="#a855f7">SCHEMA</Text>
          {schemaLoading && <Text color="#f59e0b">loading...</Text>}
        </Box>
        <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 80))}</Text>

        {/* Column header */}
        <Box>
          <Text color="#00d4ff" bold>
            {'COLUMN'.padEnd(26)}
          </Text>
          <Text color="#00d4ff" bold>
            {'TYPE'.padEnd(22)}
          </Text>
          <Text color="#00d4ff" bold>
            {'NULL'.padEnd(6)}
          </Text>
          <Text color="#00d4ff" bold>
            DEFAULT
          </Text>
        </Box>
        <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 80))}</Text>

        {schema.map((col, i) => (
          <Box key={i}>
            <Text color="#e0e0e0">{(col.column ?? '').slice(0, 25).padEnd(26)}</Text>
            <Text color="#a0aec0">{(col.type ?? '').slice(0, 21).padEnd(22)}</Text>
            <Text color={col.nullable === 'YES' ? '#f59e0b' : '#10b981'}>
              {(col.nullable === 'YES' ? 'YES' : 'NO').padEnd(6)}
            </Text>
            <Text color="#4a5568">{(col.default ?? '').slice(0, 20)}</Text>
          </Box>
        ))}

        {schema.length === 0 && !schemaLoading && (
          <Text color="#4a5568" dimColor>
            No schema info found for this table.
          </Text>
        )}

        <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 80))}</Text>
        <Text color="#374151" dimColor>
          s:back to table [/]:cycle table r:reload schema
        </Text>
      </Box>
    );
  }

  // ── Detail view ───────────────────────────────────────────────────────────

  if (view === 'detail') {
    return (
      <DetailView
        tableName={browseTable}
        columns={columns}
        row={filteredRows[cursor] ?? {}}
        rowIdx={cursor}
        rowCount={filteredRows.length}
        panelWidth={panelWidth}
      />
    );
  }

  // ── Table view ────────────────────────────────────────────────────────────

  const windowStart = Math.max(0, cursor - 4);
  const visible = filteredRows.slice(windowStart, windowStart + PAGE_SIZE);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box gap={2}>
        <Text color="#00d4ff" bold>
          {browseTable}
        </Text>
        <Text color="#4a5568">
          {filteredRows.length.toLocaleString()} rows{filter ? ` (/${filter})` : ''}
        </Text>
        {feedback && (
          <Text color={feedback.startsWith('+') ? '#10b981' : '#ef4444'}>{feedback}</Text>
        )}
      </Box>

      {filtering && (
        <Box>
          <Text color="#00d4ff"> / </Text>
          <Text color="#e0e0e0">{filter}</Text>
          <Text color="#00d4ff">█</Text>
        </Box>
      )}
      {!filtering && filter && (
        <Box>
          <Text color="#f59e0b"> filter: </Text>
          <Text color="#e0e0e0">{filter}</Text>
          <Text color="#4a5568"> Esc:clear</Text>
        </Box>
      )}

      <Text color="#1a2a3a">{'─'.repeat(colWidths.reduce((a, b) => a + b, 0))}</Text>

      {/* Column headers — show window indicator when columns are scrolled */}
      <Box>
        {colWinStart > 0 && (
          <Text color="#4a5568" dimColor>
            {'‹ '}
          </Text>
        )}
        {displayCols.map((col, i) => {
          const absColIdx = colWinStart + i;
          const isColCur = absColIdx === colCursor;
          return (
            <Text
              key={col}
              color={isColCur ? '#0a1628' : '#00d4ff'}
              backgroundColor={isColCur ? '#00d4ff' : undefined}
              bold
            >
              {col.slice(0, colWidths[i]! - 1).padEnd(colWidths[i]!)}
            </Text>
          );
        })}
        {colWinStart + COL_WINDOW < columns.length && (
          <Text color="#4a5568" dimColor>
            {' ›'}
          </Text>
        )}
      </Box>
      <Text color="#1a2a3a">{'─'.repeat(colWidths.reduce((a, b) => a + b, 0))}</Text>

      {/* Rows */}
      {filteredRows.length === 0 ? (
        <Text color="#4a5568" dimColor>
          No rows.
        </Text>
      ) : (
        visible.map((row, ri) => {
          const absIdx = windowStart + ri;
          const isRowCur = absIdx === cursor;
          return (
            <Box key={absIdx}>
              {colWinStart > 0 && <Text color="#1a2a4a">{'‹ '}</Text>}
              {displayCols.map((col, ci) => {
                const absColIdx = colWinStart + ci;
                const cell = formatValue(col, row[col], row);
                const isCellCur = isRowCur && absColIdx === colCursor;
                return (
                  <Text
                    key={col}
                    color={isCellCur ? '#0a1628' : isRowCur ? '#ffffff' : '#e0e0e0'}
                    backgroundColor={isCellCur ? '#00d4ff' : isRowCur ? '#1a2a4a' : undefined}
                    wrap="truncate"
                  >
                    {cell.slice(0, colWidths[ci]! - 1).padEnd(colWidths[ci]!)}
                  </Text>
                );
              })}
              {colWinStart + COL_WINDOW < columns.length && <Text color="#1a2a4a">{' ›'}</Text>}
            </Box>
          );
        })
      )}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 80))}</Text>
      <Text color="#374151" dimColor>
        {`  j/k:row  h/l:col  v:detail  t:tables  /:filter  r:reload  Q:query  [${cursor + 1}/${filteredRows.length}  col:${colCursor + 1}/${columns.length}]`}
        {canWrite ? (
          <Text color="#374151" dimColor>
            {'  e:edit  i:ins'}
          </Text>
        ) : null}
        {canWrite ? (
          <Text color="#374151" dimColor>
            {canDelete ? '  D:del' : ''}
          </Text>
        ) : null}
        {userRole ? (
          <Text color="#4a5568">
            {'  · '}
            {userRole}
          </Text>
        ) : null}
      </Text>
    </Box>
  );
};
