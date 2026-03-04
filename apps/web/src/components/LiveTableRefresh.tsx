'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWsEvents } from '../hooks/useWsEvents';

const WS_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100').replace(/^https?/, 'ws') + '/ws';

export function LiveTableRefresh({ table }: { table: string }) {
  const router = useRouter();
  const { connected, lastEvent } = useWsEvents(WS_URL, [table]);

  useEffect(() => {
    if (lastEvent) router.refresh();
  }, [lastEvent]); // router is stable (Next.js guarantee)

  return (
    <span
      title={connected ? 'Live updates active' : 'Connecting…'}
      className={`font-mono text-xs ml-1 ${connected ? 'text-ok' : 'text-fg-2'}`}
    >
      {connected ? '●' : '○'}
    </span>
  );
}
