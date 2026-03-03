import { apiClient } from '../lib/api';

interface HealthData {
  status: string;
  db?: { status: string; p95LatencyMs: number };
  kafka?: { status: string; consumerLag: number };
  wsConnections?: number;
  uptime?: number;
}

async function getHealth(): Promise<HealthData | null> {
  const res = await apiClient.get<HealthData>('/health');
  return res.ok ? (res.data ?? null) : null;
}

export default async function DashboardPage() {
  const health = await getHealth();

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-6">[ Dashboard ]</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-bg-2 border border-rim shadow-px p-4">
          <div className="text-xs text-fg-2 font-mono uppercase tracking-widest mb-1">API Status</div>
          <div className={`font-pixel text-2xl ${health?.status === 'ok' ? 'text-ok' : 'text-danger'}`}>
            {health?.status ?? 'unreachable'}
          </div>
        </div>

        <div className="bg-bg-2 border border-rim shadow-px p-4">
          <div className="text-xs text-fg-2 font-mono uppercase tracking-widest mb-1">DB p95 Latency</div>
          <div className="font-pixel text-2xl text-fg">
            {health?.db?.p95LatencyMs != null ? `${health.db.p95LatencyMs}ms` : '—'}
          </div>
        </div>

        <div className="bg-bg-2 border border-rim shadow-px p-4">
          <div className="text-xs text-fg-2 font-mono uppercase tracking-widest mb-1">WS Connections</div>
          <div className="font-pixel text-2xl text-fg">
            {health?.wsConnections ?? '—'}
          </div>
        </div>
      </div>

      <div className="bg-bg-2 border border-rim shadow-px p-4">
        <div className="text-xs text-fg-2 font-mono uppercase tracking-widest mb-3">[ System Info ]</div>
        <dl className="grid grid-cols-2 gap-2 text-xs font-mono">
          <dt className="text-fg-2">Kafka Consumer Lag</dt>
          <dd className="text-fg">{health?.kafka?.consumerLag ?? '—'}</dd>
          <dt className="text-fg-2">Uptime</dt>
          <dd className="text-fg">{health?.uptime != null ? `${Math.floor(health.uptime / 1000)}s` : '—'}</dd>
        </dl>
      </div>
    </div>
  );
}
