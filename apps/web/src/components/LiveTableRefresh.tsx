'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWsEvents } from '../hooks/useWsEvents';

const WS_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000')
  .replace(/^https?/, 'ws') + '/ws';

export function LiveTableRefresh({ table }: { table: string }) {
  const router = useRouter();
  const { connected, lastEvent } = useWsEvents(WS_URL, [table]);

  useEffect(() => {
    if (lastEvent) router.refresh();
  }, [lastEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span
      title={connected ? 'Live updates active' : 'Connecting…'}
      className={`inline-block w-2 h-2 rounded-full ml-2 ${connected ? 'bg-green-500' : 'bg-gray-400'}`}
    />
  );
}
