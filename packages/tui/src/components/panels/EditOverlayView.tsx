import React from 'react';
import { Box, Text } from 'ink';

// ── Types ─────────────────────────────────────────────────────────────────────

export type EditOverlay =
  | { type: 'edit'; row: Record<string, unknown>; fieldIdx: number; buffer: string }
  | { type: 'insert'; values: Record<string, string>; fieldIdx: number }
  | { type: 'delete'; pkValue: string }
  | null;

export interface EditOverlayProps {
  type: 'edit' | 'insert';
  columns: string[];
  pk: string;
  overlay:
    | { type: 'edit'; row: Record<string, unknown>; fieldIdx: number; buffer: string }
    | { type: 'insert'; values: Record<string, string>; fieldIdx: number };
  feedback: string | null;
}

// ── EditOverlayView ───────────────────────────────────────────────────────────

export const EditOverlayView: React.FC<EditOverlayProps> = ({
  type,
  columns,
  pk,
  overlay,
  feedback,
}) => {
  const editableCols = columns.filter((c) => c !== pk);
  const fieldIdx = overlay.fieldIdx;
  const panelWidth = 46;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="#00d4ff"
      width={panelWidth}
      paddingX={1}
    >
      <Text color="#00d4ff" bold>
        {type === 'edit' ? '  EDIT ROW  ' : '  INSERT ROW  '}
      </Text>
      <Text color="#1a2a3a">{'─'.repeat(panelWidth - 4)}</Text>

      {/* PK display (read-only for edit) */}
      {type === 'edit' && (
        <Box>
          <Text color="#374151">{pk.padEnd(20)}</Text>
          <Text color="#4a5568" dimColor>
            {String((overlay as { row: Record<string, unknown> }).row[pk] ?? '').slice(0, 20)}
          </Text>
        </Box>
      )}

      {/* Editable fields */}
      {editableCols.slice(0, 8).map((col, i) => {
        const isActive = i === fieldIdx;
        const currentVal =
          type === 'edit'
            ? String((overlay as { row: Record<string, unknown> }).row[col] ?? '')
            : ((overlay as { values: Record<string, string> }).values[col] ?? '');
        const buffer = isActive
          ? type === 'edit'
            ? (overlay as { buffer: string }).buffer
            : ((overlay as { values: Record<string, string> }).values[col] ?? '')
          : currentVal;

        return (
          <Box key={col}>
            <Text color={isActive ? '#00d4ff' : '#6b7280'} bold={isActive}>
              {col.slice(0, 18).padEnd(19)}
            </Text>
            <Text
              color={isActive ? '#e0e0e0' : '#4a5568'}
              backgroundColor={isActive ? '#0a1628' : undefined}
            >
              {buffer.slice(0, 20)}
              {isActive ? '▍' : ''}
            </Text>
          </Box>
        );
      })}

      <Text color="#1a2a3a">{'─'.repeat(panelWidth - 4)}</Text>
      {feedback ? (
        <Text color={feedback.startsWith('+') ? '#10b981' : '#ef4444'}>{feedback}</Text>
      ) : (
        <Text color="#374151" dimColor>
          Tab:field Enter:save Esc:cancel
        </Text>
      )}
    </Box>
  );
};
