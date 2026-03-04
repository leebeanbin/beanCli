'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../lib/api';

interface StreamStats {
  entity_type?: string;
  event_count?: number;
  last_event_at?: string | number;
  consumer_lag?: number;
  error_rate?: number;
}

interface LiveEvent {
  id?: number | string;
  entity_type?: string;
  event_type?: string;
  created_at_ms?: number;
  [key: string]: unknown;
}

const BAR_MAX = 20;

function AsciiBar({ value, max }: { value: number; max: number }) {
  const filled = Math.round((value / Math.max(max, 1)) * BAR_MAX);
  return (
    <span className="font-mono text-xs text-accent">
      {'█'.repeat(filled)}
      {'░'.repeat(BAR_MAX - filled)}
    </span>
  );
}

export default function MonitorPage() {
  const [stats, setStats] = useState<StreamStats[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('—');

  const fetchStats = useCallback(async () => {
    const res = await apiClient.get<StreamStats[] | { stats: StreamStats[] }>(
      '/api/v1/monitoring/stream-stats',
    );
    if (res.ok && res.data) {
      const data = res.data;
      setStats(Array.isArray(data) ? data : data.stats ?? []);
      setLastUpdated(new Date().toLocaleTimeString());
      setError(null);
    } else {
      setError(res.error ?? 'Failed to load stats');
    }
  }, []);

  useEffect(() => {
    void fetchStats();
    const interval = setInterval(() => void fetchStats(), 10_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // SSE live events
  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';
    const es = new EventSource(
      `${apiBase}/api/v1/stream?tables=events_raw,audit_events`,
    );
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data as string) as LiveEvent;
        setEvents((prev) => [data, ...prev].slice(0, 50));
      } catch {
        /* skip */
      }
    };
    return () => es.close();
  }, []);

  const maxCount = Math.max(...stats.map((s) => s.event_count ?? 0), 1);

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-6">[ Monitor ]</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Stream stats */}
        <div className="bg-bg-2 border border-rim shadow-px p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-pixel text-xl text-fg-2">[ Stream Stats ]</div>
            <span className="font-mono text-xs text-fg-2">Updated: {lastUpdated}</span>
          </div>
          {error && <p className="text-danger text-xs font-mono mb-2">{error}</p>}
          {stats.length === 0 && !error && (
            <p className="font-mono text-xs text-fg-2">Loading…</p>
          )}
          <div className="space-y-2">
            {stats.map((s, i) => (
              <div key={i} className="font-mono text-xs">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-accent w-24 truncate">{s.entity_type ?? `entity_${i}`}</span>
                  <span className="text-fg w-10 text-right">{s.event_count ?? 0}</span>
                  {s.consumer_lag != null && (
                    <span className="text-fg-2 ml-2">lag:{s.consumer_lag}</span>
                  )}
                </div>
                <AsciiBar value={s.event_count ?? 0} max={maxCount} />
              </div>
            ))}
          </div>
        </div>

        {/* Live events */}
        <div className="bg-bg-2 border border-rim shadow-px p-4">
          <div className="font-pixel text-xl text-fg-2 mb-3">[ Live Events (SSE) ]</div>
          {events.length === 0 ? (
            <p className="font-mono text-xs text-fg-2">Waiting for events…</p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {events.map((evt, i) => (
                <div key={i} className="font-mono text-xs border-b border-rim pb-1">
                  <span className="text-accent">{evt.entity_type ?? '—'}</span>
                  <span className="text-fg-2 mx-1">·</span>
                  <span className="text-fg">{evt.event_type ?? '—'}</span>
                  {evt.created_at_ms && (
                    <span className="text-fg-2 ml-2">
                      {new Date(evt.created_at_ms).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
