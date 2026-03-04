import { useCallback } from 'react';
import { useAppContext, type PanelId } from '../context/AppContext.js';

const PANEL_ORDER: PanelId[] = ['schema', 'query', 'result', 'ai'];

export function usePanelFocus() {
  const { focusedPanel, setFocusedPanel } = useAppContext();

  const nextPanel = useCallback(() => {
    const idx = PANEL_ORDER.indexOf(focusedPanel);
    setFocusedPanel(PANEL_ORDER[(idx + 1) % PANEL_ORDER.length]!);
  }, [focusedPanel, setFocusedPanel]);

  const prevPanel = useCallback(() => {
    const idx = PANEL_ORDER.indexOf(focusedPanel);
    setFocusedPanel(PANEL_ORDER[(idx - 1 + PANEL_ORDER.length) % PANEL_ORDER.length]!);
  }, [focusedPanel, setFocusedPanel]);

  const focusPanel = useCallback(
    (panel: PanelId) => {
      setFocusedPanel(panel);
    },
    [setFocusedPanel],
  );

  return { focusedPanel, nextPanel, prevPanel, focusPanel };
}
