import type { WsConnectionManager } from '../websocket/WsConnectionManager.js';

export interface HealthDeps {
  dbCheck: () => Promise<{ status: string; p95LatencyMs: number }>;
  kafkaCheck: () => Promise<{ status: string; consumerLag: number }>;
  wsManager: WsConnectionManager;
  startTime: number;
}

export interface HealthResponse {
  status: string;
  db: { status: string; p95LatencyMs: number };
  kafka: { status: string; consumerLag: number };
  websocket: { connections: number };
  uptime: number;
}

export async function healthHandler(deps: HealthDeps): Promise<HealthResponse> {
  const [db, kafka] = await Promise.all([deps.dbCheck(), deps.kafkaCheck()]);

  const overallStatus = db.status === 'ok' && kafka.status === 'ok' ? 'ok' : 'degraded';

  return {
    status: overallStatus,
    db,
    kafka,
    websocket: { connections: deps.wsManager.getConnectionCount() },
    uptime: Math.floor((Date.now() - deps.startTime) / 1000),
  };
}
