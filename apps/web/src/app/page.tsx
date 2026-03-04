'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';

interface HealthData {
  status: string;
  db?: { status: string; p95LatencyMs: number };
  kafka?: { status: string; consumerLag: number };
  wsConnections?: number;
  uptime?: number;
}

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await apiClient.get<HealthData>('/health');
      setHealth(res.ok ? (res.data ?? null) : null);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-6">[ Dashboard ]</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-bg-2 border border-rim shadow-px p-4">
          <div className="font-pixel text-xl text-fg-2 mb-1">API Status</div>
          <div
            className={`font-pixel text-2xl ${
              loading
                ? 'text-fg-2'
                : health?.status === 'ok'
                  ? 'text-ok'
                  : 'text-danger'
            }`}
          >
            {loading ? '…' : (health?.status ?? 'unreachable')}
          </div>
        </div>

        <div className="bg-bg-2 border border-rim shadow-px p-4">
          <div className="font-pixel text-xl text-fg-2 mb-1">DB p95 Latency</div>
          <div className="font-pixel text-2xl text-fg">
            {loading ? '…' : health?.db?.p95LatencyMs != null ? `${health.db.p95LatencyMs}ms` : '—'}
          </div>
        </div>

        <div className="bg-bg-2 border border-rim shadow-px p-4">
          <div className="font-pixel text-xl text-fg-2 mb-1">WS Connections</div>
          <div className="font-pixel text-2xl text-fg">
            {loading ? '…' : (health?.wsConnections ?? '—')}
          </div>
        </div>
      </div>

      <div className="bg-bg-2 border border-rim shadow-px p-4">
        <div className="font-pixel text-xl text-fg-2 mb-3">[ System Info ]</div>
        <dl className="grid grid-cols-2 gap-2 text-xs font-mono">
          <dt className="text-fg-2">Kafka Consumer Lag</dt>
          <dd className="text-fg">{loading ? '…' : (health?.kafka?.consumerLag ?? '—')}</dd>
          <dt className="text-fg-2">Uptime</dt>
          <dd className="text-fg">
            {loading
              ? '…'
              : health?.uptime != null
                ? `${Math.floor(health.uptime / 1000)}s`
                : '—'}
          </dd>
        </dl>
      </div>
    </div>
  );
}
