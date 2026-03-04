import { useState, useEffect } from 'react';
import { useInput } from 'ink';

/**
 * Shared j/k / ↑↓ cursor hook used by all list panels.
 * Clamps cursor to [0, length-1] when length changes.
 */
export function useCursor(length: number, isActive: boolean) {
  const [cursor, setCursor] = useState(0);

  // Keep cursor in bounds when data changes (e.g. filter narrows the list)
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, length - 1)));
  }, [length]);

  useInput(
    (input, key) => {
      if (key.upArrow || input === 'k') setCursor((c) => Math.max(0, c - 1));
      if (key.downArrow || input === 'j') setCursor((c) => Math.min(length - 1, c + 1));
      if (key.pageUp || input === 'u') setCursor((c) => Math.max(0, c - 10));
      if (key.pageDown || input === 'd') setCursor((c) => Math.min(length - 1, c + 10));
    },
    { isActive },
  );

  return [cursor, setCursor] as const;
}
