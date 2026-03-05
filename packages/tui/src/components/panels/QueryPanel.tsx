import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import * as fs from 'fs';
import { useAppContext } from '../../context/AppContext.js';
import { useQuery } from '../../hooks/useQuery.js';
import { rowsToCsv, rowsToJson } from '../../utils/exportUtils.js';

// ── SQL keyword highlighter ───────────────────────────────────────────────────

const KEYWORD_RE =
  /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|FULL|ON|USING|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|VIEW|SEQUENCE|AND|OR|NOT|IN|IS|NULL|AS|DISTINCT|COUNT|SUM|AVG|MIN|MAX|WITH|RETURNING|CASE|WHEN|THEN|ELSE|END|EXISTS|BETWEEN|LIKE|ILIKE|CAST|COALESCE|NULLIF)\b/gi;

function splitKeywords(sql: string): Array<[string, boolean]> {
  const result: Array<[string, boolean]> = [];
  let last = 0;
  let match: RegExpExecArray | null;
  KEYWORD_RE.lastIndex = 0;
  while ((match = KEYWORD_RE.exec(sql)) !== null) {
    if (match.index > last) result.push([sql.slice(last, match.index), false]);
    result.push([match[0]!.toUpperCase(), true]);
    last = match.index + match[0].length;
  }
  if (last < sql.length) result.push([sql.slice(last), false]);
  return result;
}

// ── Cursor geometry ───────────────────────────────────────────────────────────

interface CursorPos {
  line: number;
  col: number;
}

function getCursorGeometry(text: string, cursorPos: number): CursorPos {
  const before = text.slice(0, cursorPos);
  const lines = before.split('\n');
  return { line: lines.length - 1, col: (lines[lines.length - 1] ?? '').length };
}

// ── Line renderer ─────────────────────────────────────────────────────────────

const LineRow: React.FC<{
  lineNum: number;
  text: string;
  isCurrent: boolean;
  cursorCol: number; // only used when isCurrent
  isActive: boolean;
  totalLines: number;
}> = ({ lineNum, text, isCurrent, cursorCol, isActive, totalLines }) => {
  const numWidth = String(totalLines).length;
  const numStr = String(lineNum).padStart(numWidth);

  const before = isCurrent ? text.slice(0, cursorCol) : text;
  const atCur = isCurrent ? (text[cursorCol] ?? ' ') : null;
  const after = isCurrent ? text.slice(cursorCol + 1) : null;

  const renderSegments = (s: string, dim?: boolean) =>
    splitKeywords(s).map(([t, kw], i) => (
      <Text key={i} color={kw ? '#00d4ff' : dim ? '#4a5568' : '#e0e0e0'} bold={kw}>
        {t}
      </Text>
    ));

  return (
    <Box>
      <Text color="#374151" dimColor>
        {numStr}{' '}
      </Text>
      {isCurrent ? (
        <>
          {renderSegments(before)}
          {isActive && (
            <Text color="#0a1628" backgroundColor="#00d4ff">
              {atCur}
            </Text>
          )}
          {!isActive && <Text color="#e0e0e0">{atCur === ' ' ? '' : atCur}</Text>}
          {after !== null && renderSegments(after, true)}
        </>
      ) : (
        renderSegments(text, !isCurrent)
      )}
    </Box>
  );
};

// ── QueryPanel ────────────────────────────────────────────────────────────────

export const QueryPanel: React.FC = () => {
  const {
    focusedPanel,
    overlay,
    paletteOpen,
    activeConnection,
    queryLoading,
    queryResult,
    tables,
    setOverlay,
    setExpandedMode,
    expandedMode,
    setQueryError,
    dmlConfirm,
  } = useAppContext();

  const {
    input,
    setInput,
    cursorPos,
    insertAtCursor,
    deleteAtCursor,
    moveCursor,
    history,
    histIdx,
    execute,
    confirmDml,
    cancelDml,
    navHistory,
    clearInput,
  } = useQuery();

  const isActive = focusedPanel === 'query' && !overlay && !paletteOpen;

  const lines = input.split('\n');
  const isMulti = lines.length > 1;
  const curGeo = useMemo(() => getCursorGeometry(input, cursorPos), [input, cursorPos]);

  // ── Meta command handler ───────────────────────────────────────────────────

  const runMeta = async (cmd: string): Promise<boolean> => {
    const parts = cmd.trim().split(/\s+/);
    const verb = (parts[0] ?? '').toLowerCase();

    // \dt  /  \tables  — open table picker
    if (verb === '\\dt' || verb === '\\tables' || verb === '\\l') {
      setOverlay({ type: 'table-picker' });
      setInput('');
      return true;
    }

    // \d <tablename>  — describe table schema
    if (verb === '\\d') {
      const tbl = parts[1];
      if (!tbl) {
        // No table name: list all tables
        setOverlay({ type: 'table-picker' });
        setInput('');
        return true;
      }
      // SEC-002/003: validate table name against known tables list only
      const knownTable = tables.find((t) => t === tbl);
      if (!knownTable) {
        setQueryError(`Table "${tbl}" not found. Use \\dt to see available tables.`);
        setInput('');
        return true;
      }
      // Safe: knownTable is an exact match from the server-returned list
      const safeTbl = knownTable.replace(/'/g, "''");
      const sql = [
        `SELECT`,
        `  c.column_name       AS "column",`,
        `  c.data_type         AS "type",`,
        `  CASE WHEN c.is_nullable = 'YES' THEN 'YES' ELSE 'NO' END AS "nullable",`,
        `  COALESCE(c.column_default, '')   AS "default"`,
        `FROM information_schema.columns c`,
        `WHERE c.table_name = '${safeTbl}'`,
        `ORDER BY c.ordinal_position`,
      ].join(' ');
      await execute(sql);
      setInput('');
      return true;
    }

    // \x  — toggle expanded mode (psql \x parity)
    if (verb === '\\x') {
      setExpandedMode((v) => !v);
      setInput('');
      return true;
    }

    // \q  — quit
    if (verb === '\\q') {
      process.exit(0);
    }

    // \ping  — roundtrip latency + server info
    if (verb === '\\ping') {
      const sql = [
        'SELECT',
        '  1                      AS ping,',
        '  version()              AS server_version,',
        '  current_database()     AS database,',
        '  NOW()                  AS server_time',
      ].join(' ');
      await execute(sql);
      setInput('');
      return true;
    }

    // \status  — current connection summary
    if (verb === '\\status') {
      const sql = [
        'SELECT',
        '  current_user          AS db_user,',
        '  current_database()    AS database,',
        '  inet_server_addr()    AS server_host,',
        '  inet_server_port()    AS server_port,',
        '  pg_postmaster_start_time() AS started_at',
      ].join(' ');
      await execute(sql);
      setInput('');
      return true;
    }

    // \export csv|json <filename>  — export current result set
    if (verb === '\\export') {
      const fmt = (parts[1] ?? '').toLowerCase();
      const filename = parts[2] ?? '';
      if (!filename || (fmt !== 'csv' && fmt !== 'json')) {
        setQueryError('Usage: \\export csv|json <filename>');
        setInput('');
        return true;
      }
      if (!queryResult || queryResult.rows.length === 0) {
        setQueryError('No results to export — run a query first');
        setInput('');
        return true;
      }
      try {
        const content = fmt === 'csv'
          ? rowsToCsv(queryResult.columns, queryResult.rows)
          : rowsToJson(queryResult.rows);
        fs.writeFileSync(filename, content, 'utf8');
        setQueryError(null);
        // Show success via a transient message — we reuse setQueryError with a success prefix
        setQueryError(`✓ Exported ${queryResult.rows.length} rows → ${filename}`);
      } catch (e) {
        setQueryError(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      setInput('');
      return true;
    }

    // \explain <sql>  — run EXPLAIN ANALYZE on the given SQL
    if (verb === '\\explain') {
      const explainSql = parts.slice(1).join(' ');
      if (!explainSql) {
        setQueryError('Usage: \\explain <sql>');
        setInput('');
        return true;
      }
      await execute(`EXPLAIN ANALYZE ${explainSql}`);
      setInput('');
      return true;
    }

    // \pw  — change password
    if (verb === '\\pw') {
      setOverlay({ type: 'password-change' });
      setInput('');
      return true;
    }

    // \?  /  \help  — show meta help as result
    if (verb === '\\?' || verb === '\\help') {
      setInput('');
      return true;
    }

    return false;
  };

  // ── Input handling ─────────────────────────────────────────────────────────

  useInput((inp, key) => {
    if (!isActive) return;

    // ── DML confirmation mode ────────────────────────────────────────────────
    if (dmlConfirm) {
      if (inp === 'y' || inp === 'Y') {
        void confirmDml();
        return;
      }
      if (inp === 'n' || inp === 'N' || key.escape) {
        cancelDml();
        return;
      }
      return; // swallow all other keys while confirming
    }

    // ── Execute (Enter without Shift) ────────────────────────────────────────
    if (key.return && !key.shift) {
      const trimmed = input.trim();
      if (trimmed.startsWith('\\')) {
        void runMeta(trimmed);
      } else {
        void execute();
      }
      return;
    }

    // ── Shift+Enter = newline (multi-line mode) ───────────────────────────────
    if (key.return && key.shift) {
      insertAtCursor('\n');
      return;
    }

    // ── History / line navigation (Up arrow) ─────────────────────────────────
    if (key.upArrow) {
      if (isMulti && curGeo.line > 0) {
        // Move cursor up one line (to end of previous line for simplicity)
        const prevLine = lines[curGeo.line - 1] ?? '';
        const targetCol = Math.min(curGeo.col, prevLine.length);
        let newPos = 0;
        for (let i = 0; i < curGeo.line - 1; i++) {
          newPos += (lines[i]?.length ?? 0) + 1; // +1 for \n
        }
        newPos += targetCol;
        moveCursor(newPos - cursorPos);
      } else {
        navHistory(-1);
      }
      return;
    }

    // ── History / line navigation (Down arrow) ────────────────────────────────
    if (key.downArrow) {
      if (isMulti && curGeo.line < lines.length - 1) {
        const nextLine = lines[curGeo.line + 1] ?? '';
        const targetCol = Math.min(curGeo.col, nextLine.length);
        let newPos = 0;
        for (let i = 0; i <= curGeo.line; i++) {
          newPos += (lines[i]?.length ?? 0) + 1;
        }
        newPos += targetCol;
        moveCursor(newPos - cursorPos);
      } else {
        navHistory(1);
      }
      return;
    }

    // ── Cursor left / right ───────────────────────────────────────────────────
    if (key.leftArrow) {
      moveCursor(-1);
      return;
    }
    if (key.rightArrow) {
      moveCursor(1);
      return;
    }

    // ── Home / End ────────────────────────────────────────────────────────────
    if (key.ctrl && inp === 'a') {
      // Move to start of current line
      let lineStart = 0;
      for (let i = 0; i < curGeo.line; i++) {
        lineStart += (lines[i]?.length ?? 0) + 1;
      }
      moveCursor(lineStart - cursorPos);
      return;
    }
    if (key.ctrl && inp === 'e') {
      // Move to end of current line
      let lineStart = 0;
      for (let i = 0; i < curGeo.line; i++) {
        lineStart += (lines[i]?.length ?? 0) + 1;
      }
      const lineEnd = lineStart + (lines[curGeo.line]?.length ?? 0);
      moveCursor(lineEnd - cursorPos);
      return;
    }

    // ── Ctrl+L — clear ────────────────────────────────────────────────────────
    if (key.ctrl && inp === 'l') {
      clearInput();
      return;
    }

    // ── Backspace / Delete ────────────────────────────────────────────────────
    if (key.backspace || key.delete) {
      deleteAtCursor();
      return;
    }

    // ── Printable characters ──────────────────────────────────────────────────
    if (inp && inp.length === 1 && inp >= ' ' && !key.ctrl && !key.meta) {
      insertAtCursor(inp);
    }
  });

  // ── Layout variables ───────────────────────────────────────────────────────

  const cols = process.stdout.columns ?? 80;
  const inputWidth = cols - 32;
  const lineCount = lines.length;
  const MAX_VISIBLE_LINES = 12;

  // Scroll window: show lines around the cursor line
  const winStart = Math.max(0, curGeo.line - Math.floor(MAX_VISIBLE_LINES / 2));
  const visLines = lines.slice(winStart, winStart + MAX_VISIBLE_LINES);

  // Recent history (last 3, shown above editor)
  const recentHistory = history.slice(0, 3);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* ── Recent history ──────────────────────────────── */}
      {recentHistory.length > 0 && (
        <Box flexDirection="column" marginBottom={0}>
          {recentHistory.map((h, i) => (
            <Box key={i}>
              <Text color="#374151" dimColor>{`  ${i + 1}. `}</Text>
              <Text color="#4a5568" dimColor wrap="truncate">
                {h.replace(/\n/g, ' ↵ ').slice(0, inputWidth)}
              </Text>
            </Box>
          ))}
          <Text color="#1a2a3a">{'─'.repeat(Math.min(inputWidth + 6, 60))}</Text>
        </Box>
      )}

      {/* ── History indicator ───────────────────────────── */}
      {histIdx >= 0 && (
        <Text color="#f59e0b" dimColor>{`  ↑ history #${histIdx + 1}/${history.length}`}</Text>
      )}

      {/* ── Expanded mode badge ─────────────────────────── */}
      {expandedMode && (
        <Text color="#a855f7" dimColor>
          {'  \\x EXPANDED MODE  '}
        </Text>
      )}

      {/* ── DML confirmation prompt ─────────────────────── */}
      {dmlConfirm && (
        <Box flexDirection="column" marginBottom={0}>
          <Text color="#1a2a3a">{'─'.repeat(Math.min(inputWidth + 6, 60))}</Text>
          <Box>
            <Text color="#ef4444" bold>
              {' '}
              ⚠ Execute DML?{' '}
            </Text>
            {dmlConfirm.rowCount > 0 && (
              <Text color="#f59e0b" bold>
                ~{dmlConfirm.rowCount.toLocaleString()} rows affected
              </Text>
            )}
          </Box>
          <Box>
            <Text color="#374151">{'  '}</Text>
            <Text color="#a0aec0" wrap="truncate">
              {dmlConfirm.sql.replace(/\n/g, ' ').slice(0, inputWidth)}
            </Text>
          </Box>
          <Box>
            <Text color="#374151"> Press </Text>
            <Text color="#10b981" bold>
              y
            </Text>
            <Text color="#374151"> to confirm or </Text>
            <Text color="#ef4444" bold>
              n
            </Text>
            <Text color="#374151"> / </Text>
            <Text color="#ef4444" bold>
              Esc
            </Text>
            <Text color="#374151"> to cancel</Text>
          </Box>
          <Text color="#1a2a3a">{'─'.repeat(Math.min(inputWidth + 6, 60))}</Text>
        </Box>
      )}

      {/* ── Multi-line editor ───────────────────────────── */}
      {queryLoading ? (
        <Box>
          <Text color="#f59e0b" bold>
            {'  ⟳ '}
          </Text>
          <Text color="#f59e0b">Executing...</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {/* Prompt line for single-line mode */}
          {!isMulti && (
            <Box>
              <Text color={activeConnection ? '#00d4ff' : '#374151'} bold>
                {'  ❯ '}
              </Text>
              <LineRow
                lineNum={1}
                text={lines[0] ?? ''}
                isCurrent={true}
                cursorCol={curGeo.col}
                isActive={isActive}
                totalLines={1}
              />
            </Box>
          )}

          {/* Multi-line editor with line numbers */}
          {isMulti && (
            <Box flexDirection="column">
              {/* Scroll indicator */}
              {winStart > 0 && (
                <Text color="#374151" dimColor>{`  ↑ (line ${winStart + 1}..)`}</Text>
              )}
              {visLines.map((line, i) => {
                const absLine = winStart + i;
                return (
                  <LineRow
                    key={absLine}
                    lineNum={absLine + 1}
                    text={line}
                    isCurrent={absLine === curGeo.line}
                    cursorCol={curGeo.col}
                    isActive={isActive}
                    totalLines={lineCount}
                  />
                );
              })}
              {winStart + MAX_VISIBLE_LINES < lineCount && (
                <Text color="#374151" dimColor>{`  ↓ (..line ${lineCount})`}</Text>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* ── Divider ─────────────────────────────────────── */}
      <Text color="#1a2a3a">{'─'.repeat(Math.min(inputWidth + 6, 60))}</Text>

      {/* ── Footer hints ────────────────────────────────── */}
      {!activeConnection ? (
        <Text color="#ef4444" dimColor>
          {' '}
          Not connected — press 1 to focus Schema panel, then n to add a connection
        </Text>
      ) : (
        <Box flexDirection="column">
          <Text color="#374151" dimColor>
            {'  Enter:run  Shift+Enter:newline  ↑↓:history  Ctrl+L:clear  ←→:cursor'}
          </Text>
          <Text color="#374151" dimColor>
            {'  \\dt:tables  \\d <tbl>:schema  \\x:expanded  \\ping:test  \\status  \\q:quit'}
          </Text>
          <Text color="#374151" dimColor>
            {'  \\export csv|json <file>:export  \\explain <sql>:explain  \\pw:change-pw'}
          </Text>
        </Box>
      )}
    </Box>
  );
};
