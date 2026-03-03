import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ColumnDef {
  name:    string;
  type:    string;
  notNull: boolean;
  pk:      boolean;
}

type Area     = 'tablename' | 'cols';
type ColField = 'name' | 'type' | 'notnull' | 'pk';

// ── Constants ─────────────────────────────────────────────────────────────────

const PG_TYPES = [
  'bigserial', 'serial', 'integer', 'bigint', 'smallint',
  'text', 'varchar(255)', 'char(1)',
  'boolean',
  'timestamptz', 'timestamp', 'date', 'time',
  'numeric', 'real', 'double precision',
  'uuid', 'jsonb', 'json',
];

const COL_FIELDS: ColField[] = ['name', 'type', 'notnull', 'pk'];

const DEFAULT_COLS: ColumnDef[] = [
  { name: 'id',         type: 'bigserial',   notNull: true,  pk: true  },
  { name: 'created_at', type: 'timestamptz', notNull: false, pk: false },
];

// ── DDL generator ─────────────────────────────────────────────────────────────

function generateDDL(tableName: string, cols: ColumnDef[]): string {
  const tn    = tableName.trim();
  const valid = cols.filter(c => c.name.trim());
  if (!tn || valid.length === 0) {
    return '-- fill in table name and at least one column';
  }
  const pkCols = valid.filter(c => c.pk);
  const defs = valid.map(c => {
    const isSerial = c.type === 'serial' || c.type === 'bigserial' || c.type === 'smallserial';
    let line = `  "${c.name.trim()}" ${c.type}`;
    if (c.notNull && !isSerial) line += ' NOT NULL';
    if (c.pk && pkCols.length === 1) line += ' PRIMARY KEY';
    return line;
  });
  if (pkCols.length > 1) {
    defs.push(`  PRIMARY KEY (${pkCols.map(c => `"${c.name.trim()}"`).join(', ')})`);
  }
  return `CREATE TABLE "${tn}" (\n${defs.join(',\n')}\n);`;
}

// ── CreateTableOverlay ────────────────────────────────────────────────────────

export const CreateTableOverlay: React.FC = () => {
  const { setOverlay, connectionService, setTables } = useAppContext();

  const [tableName, setTableName] = useState('');
  const [cols,      setCols]      = useState<ColumnDef[]>(DEFAULT_COLS);
  const [area,      setArea]      = useState<Area>('tablename');
  const [rowIdx,    setRowIdx]    = useState(0);
  const [colField,  setColField]  = useState<ColField>('name');
  const [phase,     setPhase]     = useState<'edit' | 'confirm'>('edit');
  const [feedback,  setFeedback]  = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  const ddl = generateDDL(tableName, cols);
  const canRun = tableName.trim().length > 0 && cols.some(c => c.name.trim());

  // ── Column helpers ────────────────────────────────────────────────────────

  const addCol = useCallback(() => {
    setCols(prev => [...prev, { name: '', type: 'text', notNull: false, pk: false }]);
    setArea('cols');
    setRowIdx(cols.length);  // cols.length = new last index after push
    setColField('name');
  }, [cols.length]);

  const delCol = useCallback(() => {
    if (cols.length <= 1) return;
    setCols(prev => prev.filter((_, i) => i !== rowIdx));
    setRowIdx(r => Math.max(0, r - 1));
  }, [cols.length, rowIdx]);

  const cycleType = useCallback((dir: 1 | -1) => {
    const current = cols[rowIdx]?.type ?? 'text';
    const idx  = PG_TYPES.indexOf(current);
    const next = PG_TYPES[(idx + dir + PG_TYPES.length) % PG_TYPES.length] ?? 'text';
    setCols(prev => prev.map((c, i) => i === rowIdx ? { ...c, type: next } : c));
  }, [cols, rowIdx]);

  const toggleBool = useCallback((field: 'notNull' | 'pk') => {
    setCols(prev => prev.map((c, i) => i === rowIdx ? { ...c, [field]: !c[field] } : c));
  }, [rowIdx]);

  // ── Field navigation ──────────────────────────────────────────────────────

  const nextField = useCallback(() => {
    if (area === 'tablename') {
      setArea('cols'); setRowIdx(0); setColField('name');
      return;
    }
    const fi = COL_FIELDS.indexOf(colField);
    if (fi < COL_FIELDS.length - 1) {
      setColField(COL_FIELDS[fi + 1]!);
    } else if (rowIdx < cols.length - 1) {
      setRowIdx(r => r + 1); setColField('name');
    } else {
      setArea('tablename');
    }
  }, [area, colField, rowIdx, cols.length]);

  const prevField = useCallback(() => {
    if (area === 'tablename') {
      setArea('cols'); setRowIdx(cols.length - 1); setColField('pk');
      return;
    }
    const fi = COL_FIELDS.indexOf(colField);
    if (fi > 0) {
      setColField(COL_FIELDS[fi - 1]!);
    } else if (rowIdx > 0) {
      setRowIdx(r => r - 1); setColField('pk');
    } else {
      setArea('tablename');
    }
  }, [area, colField, rowIdx, cols.length]);

  // ── Execute ───────────────────────────────────────────────────────────────

  const execute = useCallback(async () => {
    if (!connectionService) return;
    setExecuting(true);
    const res = await connectionService.executeQuery(ddl);
    setExecuting(false);
    if (res.error) {
      setFeedback(`✗ ${res.error.slice(0, 70)}`);
      setPhase('edit');
    } else {
      // Refresh table list
      const listRes = await connectionService.executeQuery(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
      );
      if (!listRes.error) {
        setTables(listRes.rows.map(r => String(r['table_name'] ?? '')));
      }
      setOverlay(null);
    }
  }, [connectionService, ddl, setOverlay, setTables]);

  // ── Input ─────────────────────────────────────────────────────────────────

  useInput((inp, key) => {
    if (executing) return;

    // ── Confirm phase ─────────────────────────────────────────────────────
    if (phase === 'confirm') {
      if (inp === 'y' || inp === 'Y') { void execute(); return; }
      setPhase('edit');
      setFeedback(null);
      return;
    }

    // ── Edit phase ────────────────────────────────────────────────────────

    if (key.escape) { setOverlay(null); return; }

    // Tab navigation
    if (key.tab && !key.shift) { nextField(); return; }
    if (key.tab &&  key.shift) { prevField(); return; }

    // N — add column (uppercase, avoids text-field conflict)
    if (inp === 'N') { addCol(); return; }

    // D — delete column row (uppercase, consistent with ExplorePanel)
    if (inp === 'D' && area === 'cols') { delCol(); return; }

    // Ctrl+X — jump to DDL preview/confirm
    if (key.ctrl && inp === 'x') {
      if (canRun) setPhase('confirm');
      else setFeedback('! Fill in table name and at least one column name');
      return;
    }

    // ── Table-name field ──────────────────────────────────────────────────
    if (area === 'tablename') {
      if (key.return) { nextField(); return; }
      if (key.backspace || key.delete) { setTableName(s => s.slice(0, -1)); return; }
      if (inp && inp >= ' ' && !key.ctrl && !key.meta) { setTableName(s => s + inp); return; }
      return;
    }

    // ── Columns area ──────────────────────────────────────────────────────

    // Row navigation with arrow keys
    if (key.upArrow)   { setRowIdx(r => Math.max(0, r - 1)); return; }
    if (key.downArrow) { setRowIdx(r => Math.min(cols.length - 1, r + 1)); return; }

    // Name field
    if (colField === 'name') {
      if (key.return) { nextField(); return; }
      if (key.backspace || key.delete) {
        setCols(prev => prev.map((c, i) =>
          i === rowIdx ? { ...c, name: c.name.slice(0, -1) } : c,
        ));
        return;
      }
      if (inp && inp >= ' ' && !key.ctrl && !key.meta) {
        setCols(prev => prev.map((c, i) =>
          i === rowIdx ? { ...c, name: c.name + inp } : c,
        ));
        return;
      }
    }

    // Type field — ←→ to cycle
    if (colField === 'type') {
      if (key.leftArrow  || inp === 'h') { cycleType(-1); return; }
      if (key.rightArrow || inp === 'l') { cycleType(1);  return; }
      if (key.return) { nextField(); return; }
    }

    // NOT NULL checkbox
    if (colField === 'notnull') {
      if (inp === ' ') { toggleBool('notNull'); return; }
      if (key.return)  { toggleBool('notNull'); nextField(); return; }
    }

    // PK checkbox
    if (colField === 'pk') {
      if (inp === ' ') { toggleBool('pk'); return; }
      if (key.return) {
        toggleBool('pk');
        // Last field of last row → go to confirm if ready
        if (rowIdx === cols.length - 1 && canRun) {
          setPhase('confirm');
        } else {
          nextField();
        }
        return;
      }
    }
  });

  // ── Render: executing spinner ─────────────────────────────────────────────

  const termW = (process.stdout.columns ?? 80) - 4;

  if (executing) {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color="#00d4ff">⟳ Creating table "{tableName}"...</Text>
      </Box>
    );
  }

  // ── Render: DDL confirm ───────────────────────────────────────────────────

  if (phase === 'confirm') {
    return (
      <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="#a855f7" bold>  Preview DDL  </Text>
        <Text color="#1a2a3a">{'─'.repeat(Math.min(termW, 68))}</Text>
        <Box flexDirection="column" marginY={1}>
          {ddl.split('\n').map((line, i) => (
            <Text key={i} color="#e0e0e0">{line}</Text>
          ))}
        </Box>
        <Text color="#1a2a3a">{'─'.repeat(Math.min(termW, 68))}</Text>
        {feedback && <Text color="#ef4444">{feedback}</Text>}
        <Box gap={1} marginTop={1}>
          <Text color="#e0e0e0">Execute?</Text>
          <Text color="#10b981" bold>y</Text>
          <Text color="#4a5568">/</Text>
          <Text color="#ef4444" bold>n</Text>
          <Text color="#4a5568">(back to edit)</Text>
        </Box>
      </Box>
    );
  }

  // ── Render: edit form ─────────────────────────────────────────────────────

  return (
    <Box flexGrow={1} flexDirection="column" paddingX={1} paddingY={1}>

      {/* Title */}
      <Text color="#00d4ff" bold>  Create Table  </Text>
      <Text color="#1a2a3a">{'─'.repeat(Math.min(termW, 68))}</Text>

      {/* Table name */}
      <Box marginBottom={1} marginTop={0}>
        <Text color={area === 'tablename' ? '#00d4ff' : '#6b7280'}>Table name  </Text>
        <Text
          color={area === 'tablename' ? '#e0e0e0' : '#a0aec0'}
          backgroundColor={area === 'tablename' ? '#0a1628' : undefined}
        >
          {tableName || ' '}
          {area === 'tablename' ? '▍' : ''}
        </Text>
      </Box>

      <Text color="#1a2a3a">{'─'.repeat(Math.min(termW, 68))}</Text>

      {/* Column header */}
      <Box>
        <Text color="#00d4ff" bold>{'  #  '}</Text>
        <Text color="#00d4ff" bold>{'Column name         '}</Text>
        <Text color="#00d4ff" bold>{'Type               '}</Text>
        <Text color="#00d4ff" bold>{'NN   '}</Text>
        <Text color="#00d4ff" bold>PK</Text>
      </Box>
      <Text color="#1a2a3a">{'─'.repeat(Math.min(termW, 68))}</Text>

      {/* Column rows */}
      {cols.map((col, i) => {
        const isRow = area === 'cols' && i === rowIdx;

        const nameBg  = isRow && colField === 'name'    ? '#0a1628' : undefined;
        const typeBg  = isRow && colField === 'type'    ? '#0a1628' : undefined;
        const nnBg    = isRow && colField === 'notnull' ? '#0a1628' : undefined;
        const pkBg    = isRow && colField === 'pk'      ? '#0a1628' : undefined;

        return (
          <Box key={i}>
            {/* Row number */}
            <Text color={isRow ? '#00d4ff' : '#374151'}>
              {`  ${String(i + 1).padStart(2)} `}
            </Text>

            {/* Name */}
            <Text color={nameBg ? '#e0e0e0' : '#a0aec0'} backgroundColor={nameBg}>
              {(col.name || ' ').slice(0, 19).padEnd(19)}
              {isRow && colField === 'name' ? '▍' : ' '}
            </Text>

            {/* Type */}
            <Text color={typeBg ? '#e0e0e0' : '#4a5568'} backgroundColor={typeBg}>
              {isRow && colField === 'type' ? '‹ ' : '  '}
              {col.type.slice(0, 14).padEnd(14)}
              {isRow && colField === 'type' ? ' ›' : '   '}
            </Text>

            {/* NOT NULL checkbox */}
            <Text color={nnBg ? '#00d4ff' : '#6b7280'} backgroundColor={nnBg}>
              {col.notNull ? '[✓]   ' : '[ ]   '}
            </Text>

            {/* PK checkbox */}
            <Text color={pkBg ? '#f59e0b' : '#6b7280'} backgroundColor={pkBg}>
              {col.pk ? '[✓]' : '[ ]'}
            </Text>
          </Box>
        );
      })}

      <Text color="#1a2a3a">{'─'.repeat(Math.min(termW, 68))}</Text>

      {/* Compact DDL preview */}
      <Box flexDirection="column" marginTop={0}>
        <Text color="#374151" dimColor>Preview:</Text>
        {ddl.split('\n').map((line, i) => (
          <Text key={i} color="#4a5568" dimColor>{line}</Text>
        ))}
      </Box>

      <Text color="#1a2a3a">{'─'.repeat(Math.min(termW, 68))}</Text>

      {/* Footer */}
      {feedback ? (
        <Text color="#ef4444">{feedback}</Text>
      ) : (
        <Text color="#374151" dimColor>
          Tab:field  ↑↓:row  ←→:type  Spc:toggle  N:add col  D:del col  Ctrl+X:run  Esc:cancel
        </Text>
      )}

    </Box>
  );
};
