'use client';

import { useEffect, useRef, useState } from 'react';
import { WsEventManager } from '@tfsdc/ui-web';

export function useWsEvents(wsUrl: string, tables: string[]) {
  const managerRef = useRef<WsEventManager | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<unknown>(null);

  useEffect(() => {
    const manager = new WsEventManager();
    managerRef.current = manager;
    manager.connect(wsUrl, tables);
    const timer = setInterval(() => setConnected(manager.isConnected()), 1000);
    const unsub = manager.onMessage(msg => setLastEvent(msg));
    return () => {
      clearInterval(timer);
      unsub();
      manager.disconnect();
    };
    // tables.join(',') used as stable primitive dep — intentional
  }, [wsUrl, tables.join(',')]); // deps: primitive join avoids array referential instability

  return { connected, lastEvent };
}
