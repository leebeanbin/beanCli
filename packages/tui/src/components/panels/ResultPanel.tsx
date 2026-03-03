import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { useAppContext } from '../../context/AppContext.js';
import { formatValue } from '../../utils/formatValue.js';
import { COL_WINDOW } from '../../utils/constants.js';
import { useCursor } from '../../hooks/useCursor.js';

const TYPE_COLOR: Record<string, string> = {
  select: '#10b981',
  dml:    '#f59e0b',
  ddl:    '#a855f7',
  other:  '#6b7280',
};

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

  const [colCursor, setColCursor] = useState(0);
  const [search,    setSearch]    = useState('');
  const [searching, setSearching] = useState(false);

  const isActive = focusedPanel === 'result' && !overlay && !paletteOpen;
  const viewMode = expandedMode ? 'vertical' : 'table';

  // Filter rows (computed before useCursor so we can pass filteredRows.length)
  const allRows = queryResult?.rows ?? [];
  const filteredRows = search
    ? allRows.filter(row =>
        Object.values(row).some(v =>
          String(v ?? '').toLowerCase().includes(search.toLowerCase()),
        ),
      )
    : allRows;

  const [cursor, setCursor] = useCursor(filteredRows.length, isActive && !searching);

  // Reset cursor when result changes
  React.useEffect(() => {
    setCursor(0);
    setColCursor(0);
  }, [queryResult]);

  const columns      = queryResult?.columns ?? [];
  const maxColCursor = Math.max(0, columns.length - 1);

  // Column sliding window — same logic as ExplorePanel
  const colWinStart = Math.max(0, Math.min(colCursor - 2, columns.length - COL_WINDOW));
  const displayCols = columns.slice(colWinStart, colWinStart + COL_WINDOW);

  // Dynamic row viewport — adapts to terminal height
  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 24;
  // header(3) + statusbar(1) + col-header(1) + footer(2) = 7 reserved rows
  const VISIBLE_ROWS = Math.max(5, termRows - 7);

  // Row viewport — cursor stays centred
  const viewStart   = Math.max(0, Math.min(cursor - Math.floor(VISIBLE_ROWS / 2), filteredRows.length - VISIBLE_ROWS));
  const visibleRows = filteredRows.slice(viewStart, viewStart + VISIBLE_ROWS);

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
      // j/k/u/d/↑↓ row navigation handled by useCursor
      if (inp === 'g') { setCursor(0); return; }
      if (inp === 'G') { setCursor(Math.max(0, filteredRows.length - 1)); return; }

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
      // j/k/u/d/↑↓ row navigation handled by useCursor
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
