'use client';

import { useEffect, useRef, useState } from 'react';
import { WsEventManager } from '@tfsdc/ui-web';

export function useWsEvents(wsUrl: string, tables: string[]) {
  const managerRef = useRef<WsEventManager | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<unknown>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [wsUrl, tables.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return { connected, lastEvent };
}
