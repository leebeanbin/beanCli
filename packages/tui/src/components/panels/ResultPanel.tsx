import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';
import { formatValue } from '../../utils/formatValue.js';

const TYPE_COLOR: Record<string, string> = {
  select: '#10b981',
  dml:    '#f59e0b',
  ddl:    '#a855f7',
  other:  '#6b7280',
};

const COL_WINDOW = 6;
const PAGE_SIZE  = 10;

// ── Vertical detail view ──────────────────────────────────────────────────────

const VerticalView: React.FC<{
  columns:  string[];
  row:      Record<string, unknown>;
  rowIdx:   number;
  rowCount: number;
}> = ({ columns, row, rowIdx, rowCount }) => (
  <Box flexDirection="column" flexGrow={1}>
    <Box gap={2}>
      <Text color="#a855f7" bold>DETAIL</Text>
      <Text color="#4a5568" dimColor>{`Row ${rowIdx + 1} / ${rowCount}`}</Text>
    </Box>
    <Text color="#1a2a3a">{'─'.repeat(44)}</Text>
    {columns.map(col => (
      <Box key={col}>
        <Text color="#00d4ff">{col.slice(0, 22).padEnd(23)}</Text>
        <Text color="#e0e0e0" wrap="truncate">{formatValue(col, row[col], row)}</Text>
      </Box>
    ))}
    <Text color="#1a2a3a">{'─'.repeat(44)}</Text>
    <Text color="#374151" dimColor>j/k:row  v/x/Esc:table</Text>
  </Box>
);

// ── ResultPanel ───────────────────────────────────────────────────────────────

export const ResultPanel: React.FC = () => {
  const {
    focusedPanel, overlay, paletteOpen,
    queryResult, queryLoading, queryError,
    expandedMode, setExpandedMode,
  } = useAppContext();

  const [cursor,    setCursor]    = useState(0);
  const [colCursor, setColCursor] = useState(0);
  const [search,    setSearch]    = useState('');
  const [searching, setSearching] = useState(false);

  const isActive = focusedPanel === 'result' && !overlay && !paletteOpen;
  const viewMode = expandedMode ? 'vertical' : 'table';

  // Reset cursor when result changes
  React.useEffect(() => {
    setCursor(0);
    setColCursor(0);
  }, [queryResult]);

  // Filter rows
  const allRows = queryResult?.rows ?? [];
  const filteredRows = search
    ? allRows.filter(row =>
        Object.values(row).some(v =>
          String(v ?? '').toLowerCase().includes(search.toLowerCase()),
        ),
      )
    : allRows;

  const columns      = queryResult?.columns ?? [];
  const maxCursor    = Math.max(0, filteredRows.length - 1);
  const maxColCursor = Math.max(0, columns.length - 1);

  // Column sliding window — same logic as ExplorePanel
  const colWinStart = Math.max(0, Math.min(colCursor - 2, columns.length - COL_WINDOW));
  const displayCols = columns.slice(colWinStart, colWinStart + COL_WINDOW);

  // Row viewport — cursor stays ~4 rows from top
  const viewStart   = Math.max(0, Math.min(cursor - 4, Math.max(0, filteredRows.length - PAGE_SIZE)));
  const visibleRows = filteredRows.slice(viewStart, viewStart + PAGE_SIZE);

  // Column width
  const termCols   = process.stdout.columns ?? 80;
  const panelWidth = termCols - 54;
  const colWidth   = displayCols.length > 0
    ? Math.max(8, Math.floor(Math.min(panelWidth, 120) / displayCols.length))
    : 12;

  useInput((inp, key) => {
    if (!isActive) return;

    // ── Search mode ───────────────────────────────────────────────────────────
    if (searching) {
      if (key.escape || key.return) { setSearching(false); return; }
      if (key.backspace) { setSearch(s => s.slice(0, -1)); return; }
      if (inp && inp >= ' ' && !key.ctrl) { setSearch(s => s + inp); }
      return;
    }

    // ── Table mode ────────────────────────────────────────────────────────────
    if (viewMode === 'table') {
      // Row navigation
      if (key.upArrow   || inp === 'k') { setCursor(c => Math.max(0, c - 1)); return; }
      if (key.downArrow || inp === 'j') { setCursor(c => Math.min(maxCursor, c + 1)); return; }
      if (inp === 'g') { setCursor(0); return; }
      if (inp === 'G') { setCursor(maxCursor); return; }

      // Column navigation
      if (key.leftArrow  || inp === 'h') { setColCursor(c => Math.max(0, c - 1)); return; }
      if (key.rightArrow || inp === 'l') { setColCursor(c => Math.min(maxColCursor, c + 1)); return; }

      // Enter → open vertical detail view for current row
      if (key.return) { setExpandedMode(true); return; }

      // v / x — toggle vertical mode
      if (inp === 'v' || inp === 'x') { setExpandedMode(m => !m); return; }

      // / — search
      if (inp === '/') { setSearching(true); setSearch(''); return; }

      // Escape — clear search
      if (key.escape) { setSearch(''); setSearching(false); return; }
    }

    // ── Vertical mode ─────────────────────────────────────────────────────────
    if (viewMode === 'vertical') {
      if (key.upArrow   || inp === 'k') { setCursor(c => Math.max(0, c - 1)); return; }
      if (key.downArrow || inp === 'j') { setCursor(c => Math.min(maxCursor, c + 1)); return; }

      // Back to table
      if (inp === 'v' || inp === 'x' || key.escape) { setExpandedMode(false); return; }
    }
  });

  // ── Loading / Error states ────────────────────────────────────────────────

  if (queryLoading) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text color="#f59e0b">⟳ Running query...</Text>
      </Box>
    );
  }

  if (queryError) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text color="#ef4444" bold>✕ Query Error</Text>
        <Text color="#1a2a3a">{'─'.repeat(40)}</Text>
        <Text color="#fca5a5" wrap="wrap">{queryError}</Text>
      </Box>
    );
  }

  if (!queryResult) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text color="#374151">── empty ──</Text>
        <Text color="#2a3a4a">{' '}</Text>
        <Text color="#374151" dimColor>Run a query in the editor above</Text>
        <Text color="#374151" dimColor>or select a table from Schema panel</Text>
      </Box>
    );
  }

  const typeColor = TYPE_COLOR[queryResult.type] ?? '#6b7280';

  return (
    <Box flexDirection="column" flexGrow={1}>

      {/* ── Meta row ───────────────────────────────────────── */}
      <Box gap={2}>
        <Text color={typeColor} bold>{queryResult.type.toUpperCase()}</Text>
        <Text color="#4a5568">
          {filteredRows.length.toLocaleString()} row{filteredRows.length !== 1 ? 's' : ''}
          {search ? ` (from ${allRows.length})` : ''}
        </Text>
        <Text color="#374151">{queryResult.duration}ms</Text>
        {queryResult.message && (
          <Text color="#10b981">{queryResult.message}</Text>
        )}
      </Box>

      {/* ── Search bar ──────────────────────────────────────── */}
      {searching && (
        <Box>
          <Text color="#00d4ff">  / </Text>
          <Text color="#e0e0e0">{search}</Text>
          <Text color="#00d4ff">█</Text>
        </Box>
      )}
      {!searching && search && (
        <Box>
          <Text color="#f59e0b">  filter: </Text>
          <Text color="#e0e0e0">{search}</Text>
          <Text color="#4a5568">  Esc:clear</Text>
        </Box>
      )}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 80))}</Text>

      {/* ── Content ─────────────────────────────────────────── */}
      {filteredRows.length === 0 ? (
        <Text color="#4a5568" dimColor>No rows.</Text>

      ) : viewMode === 'vertical' ? (
        <VerticalView
          columns={columns}
          row={filteredRows[cursor] ?? {}}
          rowIdx={cursor}
          rowCount={filteredRows.length}
        />

      ) : (
        <Box flexDirection="column">

          {/* Column headers with scroll indicators */}
          <Box>
            {colWinStart > 0 && (
              <Text color="#4a5568" dimColor>{'‹ '}</Text>
            )}
            {displayCols.map((col, i) => {
              const absColIdx = colWinStart + i;
              const isColCur  = absColIdx === colCursor;
              return (
                <Text
                  key={col}
                  color={isColCur ? '#0a1628' : '#00d4ff'}
                  backgroundColor={isColCur ? '#00d4ff' : undefined}
                  bold
                >
                  {col.slice(0, colWidth - 1).padEnd(colWidth)}
                </Text>
              );
            })}
            {colWinStart + COL_WINDOW < columns.length && (
              <Text color="#4a5568" dimColor>{' ›'}</Text>
            )}
          </Box>
          <Text color="#1a2a3a">{'─'.repeat(displayCols.length * colWidth)}</Text>

          {/* Rows */}
          {visibleRows.map((row, ri) => {
            const absIdx   = viewStart + ri;
            const isRowCur = absIdx === cursor;
            return (
              <Box key={absIdx}>
                {colWinStart > 0 && (
                  <Text color="#1a2a4a">{'‹ '}</Text>
                )}
                {displayCols.map((col, ci) => {
                  const absColIdx = colWinStart + ci;
                  const cell      = formatValue(col, row[col], row);
                  const isCellCur = isRowCur && absColIdx === colCursor;
                  return (
                    <Text
                      key={col}
                      color={isCellCur ? '#0a1628' : (isRowCur ? '#ffffff' : '#e0e0e0')}
                      backgroundColor={isCellCur ? '#00d4ff' : (isRowCur ? '#1a2a4a' : undefined)}
                      wrap="truncate"
                    >
                      {cell.slice(0, colWidth - 1).padEnd(colWidth)}
                    </Text>
                  );
                })}
                {colWinStart + COL_WINDOW < columns.length && (
                  <Text color={isRowCur ? '#3a4a6a' : '#1a2a4a'}>{' ›'}</Text>
                )}
              </Box>
            );
          })}

        </Box>
      )}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(panelWidth, 80))}</Text>

      {/* ── Footer ──────────────────────────────────────────── */}
      <Text color="#374151" dimColor>
        {viewMode === 'table'
          ? `  j/k:row  h/l:col  Enter:detail  v/x:expand  /:search  [${cursor + 1}/${filteredRows.length}  col:${colCursor + 1}/${columns.length}]`
          : `  j/k:row  v/x/Esc:table  [${cursor + 1}/${filteredRows.length}]`}
      </Text>

    </Box>
  );
};
