import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { DbConnection, DbType } from '../../services/types.js';

const DB_TYPES: DbType[] = ['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis'];
const DEFAULT_PORTS: Partial<Record<DbType, number>> = {
  postgresql: 5432,
  mysql: 3306,
  mongodb: 27017,
  redis: 6379,
};

type Field = 'label' | 'type' | 'host' | 'port' | 'database' | 'username' | 'password';
const FIELDS: Field[] = ['label', 'type', 'host', 'port', 'database', 'username', 'password'];
const SQLITE_FIELDS: Field[] = ['label', 'type', 'database'];

function genId(): string {
  return crypto.randomUUID().slice(0, 10);
}

interface Props {
  initial?: DbConnection | null;
  onSave: (conn: DbConnection) => void;
  onCancel: () => void;
}

export const ConnectionFormOverlay: React.FC<Props> = ({ initial, onSave, onCancel }) => {
  const [fieldIdx, setFieldIdx] = useState(0);
  const [vals, setVals] = useState<Record<Field, string>>({
    label: initial?.label ?? '',
    type: initial?.type ?? 'postgresql',
    host: initial?.host ?? 'localhost',
    port: String(initial?.port ?? 5432),
    database: initial?.database ?? '',
    username: initial?.username ?? '',
    password: initial?.password ?? '',
  });

  const dbType = vals.type as DbType;
  const fields = dbType === 'sqlite' ? SQLITE_FIELDS : FIELDS;
  const safeIdx = Math.min(fieldIdx, fields.length - 1);

  function setVal(f: Field, v: string) {
    setVals((prev) => ({ ...prev, [f]: v }));
  }

  function cycleType(dir: 1 | -1) {
    const idx = DB_TYPES.indexOf(vals.type as DbType);
    const next = DB_TYPES[(idx + dir + DB_TYPES.length) % DB_TYPES.length]!;
    const defPort = DEFAULT_PORTS[next];
    setVals((prev) => ({
      ...prev,
      type: next,
      port: defPort != null ? String(defPort) : '',
      host: next === 'sqlite' ? '' : prev.host || 'localhost',
    }));
  }

  function submit() {
    const conn: DbConnection = {
      id: initial?.id ?? genId(),
      label: vals.label.trim() || `${vals.type}-${genId().slice(0, 4)}`,
      type: vals.type as DbType,
      host: dbType !== 'sqlite' ? vals.host.trim() || undefined : undefined,
      port: vals.port ? Number(vals.port) : undefined,
      database: vals.database.trim() || undefined,
      username: vals.username.trim() || undefined,
      password: vals.password || undefined,
      isDefault: initial?.isDefault,
    };
    onSave(conn);
  }

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      submit();
      return;
    }

    if (key.tab && !key.shift) {
      setFieldIdx((i) => (i + 1) % fields.length);
      return;
    }
    if (key.tab && key.shift) {
      setFieldIdx((i) => (i - 1 + fields.length) % fields.length);
      return;
    }

    const field = fields[safeIdx]!;

    if (field === 'type') {
      if (key.upArrow || key.leftArrow) {
        cycleType(-1);
        return;
      }
      if (key.downArrow || key.rightArrow) {
        cycleType(1);
        return;
      }
      return;
    }

    if (key.backspace || key.delete) {
      setVal(field, vals[field].slice(0, -1));
      return;
    }
    if (input && input.length === 1 && input >= ' ' && !key.ctrl) {
      setVal(field, vals[field] + input);
    }
  });

  const blink = Math.floor(Date.now() / 500) % 2 === 0 ? '█' : ' ';
  const isEdit = !!initial;

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="#00d4ff" width={50} paddingX={1}>
      {/* Title */}
      <Text color="#00d4ff" bold>
        {isEdit ? '  ✎  EDIT CONNECTION  ' : '  +  NEW CONNECTION  '}
      </Text>

      {/* Divider */}
      <Text color="#1a2a3a">{'─'.repeat(46)}</Text>

      {/* Fields */}
      <Box flexDirection="column">
        {fields.map((field, i) => {
          const isActive = i === safeIdx;
          const raw = vals[field];
          const display = field === 'password' ? '•'.repeat(raw.length) : raw;

          return (
            <Box key={field}>
              <Text color={isActive ? '#00d4ff' : '#4a5568'}>{`  ${field.padEnd(10)}: `}</Text>
              {field === 'type' ? (
                <Text color={isActive ? '#e0e0e0' : '#6b7280'} bold={isActive}>
                  {`◀ ${vals.type} ▶`}
                </Text>
              ) : (
                <Text color={isActive ? '#e0e0e0' : '#6b7280'}>
                  {display}
                  {isActive ? blink : ''}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Divider */}
      <Text color="#1a2a3a">{'─'.repeat(46)}</Text>

      {/* Footer */}
      <Text color="#374151">{'  Tab:next  ↑↓:type  Enter:save  Esc:cancel'}</Text>
    </Box>
  );
};
