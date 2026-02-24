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
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="text-xs text-gray-500 mb-1">API Status</div>
          <div className={`text-lg font-semibold ${health?.status === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {health?.status ?? 'Unreachable'}
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="text-xs text-gray-500 mb-1">DB p95 Latency</div>
          <div className="text-lg font-semibold font-mono">
            {health?.db?.p95LatencyMs != null ? `${health.db.p95LatencyMs}ms` : '—'}
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="text-xs text-gray-500 mb-1">WS Connections</div>
          <div className="text-lg font-semibold font-mono">
            {health?.wsConnections ?? '—'}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg p-4 shadow-sm border">
        <h2 className="font-semibold mb-3">System Info</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">Kafka Consumer Lag</dt>
          <dd className="font-mono">{health?.kafka?.consumerLag ?? '—'}</dd>
          <dt className="text-gray-500">Uptime</dt>
          <dd className="font-mono">{health?.uptime != null ? `${Math.floor(health.uptime / 1000)}s` : '—'}</dd>
        </dl>
      </div>
    </div>
  );
}
