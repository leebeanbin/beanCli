import React from 'react';
import { Box, Text } from 'ink';
import { SPINNER } from '../../utils/constants.js';

// ── Shared types (re-exported for use in ConnectionPickerOverlay) ──────────────

export type Field = 'label' | 'type' | 'host' | 'port' | 'database' | 'username' | 'password';
export type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

export interface FormVals extends Record<Field, string> {}

export const FIELD_LABEL: Record<Field, string> = {
  label: 'Name',
  type: 'Driver',
  host: 'Host',
  port: 'Port',
  database: 'Database',
  username: 'User',
  password: 'Password',
};

export const FIELD_EXAMPLE: Partial<Record<Field, string>> = {
  label: 'my-local',
  host: 'localhost',
  database: '(optional — pick after connect)',
  username: 'postgres',
  password: '••••••',
};

// ── ConnectionFormPane ────────────────────────────────────────────────────────

export interface ConnectionFormPaneProps {
  vals: FormVals;
  fields: Field[];
  safeFieldIdx: number; // -1 = URL field active
  urlBuf: string;
  urlPrefix: string;
  meta: { color: string; label: string };
  blink: string;
  formActive: boolean;
  isNew: boolean;
  hasConns: boolean; // connections.length > 0 || isNew
  testStatus: TestStatus;
  testMsg: string;
  spinIdx: number;
  connectErr: string | null;
  rightWidth: number;
}

export const ConnectionFormPane: React.FC<ConnectionFormPaneProps> = ({
  vals,
  fields,
  safeFieldIdx,
  urlBuf,
  urlPrefix,
  meta,
  blink,
  formActive,
  isNew,
  hasConns,
  testStatus,
  testMsg,
  spinIdx,
  connectErr,
  rightWidth,
}) => (
  <>
    {/* Form fields */}
    {hasConns ? (
      <>
        {/* URL quick-fill field — always first, fieldIdx === -1 */}
        <Box>
          <Text color={formActive && safeFieldIdx === -1 ? '#00d4ff' : '#4a5568'}>
            {'  URL        '}
          </Text>
          <Text color="#374151" dimColor>
            {urlPrefix}
          </Text>
          <Text color={formActive && safeFieldIdx === -1 ? '#e0e0e0' : '#4a5568'}>
            {urlBuf}
            {formActive && safeFieldIdx === -1 ? blink : ''}
          </Text>
        </Box>
        {fields.map((field, i) => {
          const isActiveField = formActive && i === safeFieldIdx;
          const raw = vals[field];
          const display = field === 'password' ? '•'.repeat(raw.length) : raw;
          const label = FIELD_LABEL[field] ?? field;

          return (
            <Box key={field}>
              <Text color={isActiveField ? '#00d4ff' : '#4a5568'}>{`  ${label.padEnd(9)}  `}</Text>
              {field === 'type' ? (
                <Text color={isActiveField ? meta.color : '#6b7280'} bold={isActiveField}>
                  {isActiveField ? `◀  ${meta.label.padEnd(12)} ▶` : meta.label}
                </Text>
              ) : (
                <Text color={isActiveField ? '#e0e0e0' : '#6b7280'}>
                  {display ? (
                    display
                  ) : isActiveField ? (
                    ''
                  ) : FIELD_EXAMPLE[field] ? (
                    <Text color="#374151" dimColor>
                      {FIELD_EXAMPLE[field]}
                    </Text>
                  ) : (
                    <Text color="#374151" dimColor>
                      —
                    </Text>
                  )}
                  {isActiveField ? blink : ''}
                </Text>
              )}
            </Box>
          );
        })}
        {!isNew && <></>}
      </>
    ) : (
      <Box flexDirection="column" paddingY={1}>
        <Text color="#374151" dimColor>
          {' '}
          No connection selected.
        </Text>
        <Text color="#4a5568">
          {' '}
          Press{' '}
          <Text color="#10b981" bold>
            n
          </Text>{' '}
          to add a new connection.
        </Text>
      </Box>
    )}

    <Text color="#1a2a3a">{'─'.repeat(rightWidth - 2)}</Text>

    {/* Test button + result */}
    <Box flexDirection="column">
      <Box gap={2}>
        <Text color={formActive ? '#00d4ff' : '#2d4a6e'} bold={formActive}>
          {testStatus === 'testing' ? `  ${SPINNER[spinIdx]} Testing...` : '  t: Test Connection'}
        </Text>
      </Box>
      {testStatus === 'ok' && (
        <Text color="#10b981">
          {'  ✓ Connected · '}
          {testMsg}
        </Text>
      )}
      {testStatus === 'error' && (
        <Box flexDirection="column">
          <Text color="#ef4444" bold>
            {'  ✗ Connection failed'}
          </Text>
          <Text color="#ef4444" wrap="wrap">
            {'  '}
            {testMsg}
          </Text>
        </Box>
      )}
      {connectErr && testStatus !== 'error' && (
        <Box flexDirection="column">
          <Text color="#ef4444" bold>
            {'  ✗ Connect failed'}
          </Text>
          <Text color="#ef4444" wrap="wrap">
            {'  '}
            {connectErr}
          </Text>
        </Box>
      )}
    </Box>
  </>
);
