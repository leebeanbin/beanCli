import React from 'react';
import { Box, Text } from 'ink';

// Brand palette (mirrors existing TUI theme)
const COLOR_BRAND  = '#00d4ff';
const COLOR_MUTED  = '#4a5568';
const COLOR_DIM    = '#2a3a4a';

interface PanelProps {
  title: string;
  isFocused: boolean;
  /** Number shortcut hint shown in title, e.g. "1" */
  hint?: string;
  width?: number | string;
  height?: number | string;
  flexGrow?: number;
  flexDirection?: 'row' | 'column';
  children?: React.ReactNode;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  isFocused,
  hint,
  width,
  height,
  flexGrow,
  flexDirection = 'column',
  children,
}) => {
  const borderColor = isFocused ? COLOR_BRAND : COLOR_DIM;
  const titleColor  = isFocused ? COLOR_BRAND : COLOR_MUTED;
  const marker      = isFocused ? '▶ ' : '  ';

  return (
    <Box
      flexDirection="column"
      borderStyle={isFocused ? 'double' : 'single'}
      borderColor={borderColor}
      width={width}
      height={height}
      flexGrow={flexGrow}
    >
      {/* Title row */}
      <Box>
        <Text color={titleColor} bold={isFocused}>
          {marker}{title}
        </Text>
        {hint && (
          <Text color={COLOR_MUTED}> [{hint}]</Text>
        )}
      </Box>

      {/* Content */}
      <Box flexDirection={flexDirection} flexGrow={1} paddingX={1} paddingTop={0}>
        {children}
      </Box>
    </Box>
  );
};
