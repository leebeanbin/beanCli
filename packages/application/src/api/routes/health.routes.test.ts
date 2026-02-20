import { healthHandler } from './health.routes.js';
import { WsConnectionManager } from '../websocket/WsConnectionManager.js';

describe('healthHandler', () => {
  it('should return ok when all services are healthy', async () => {
    const wsManager = new WsConnectionManager();
    const result = await healthHandler({
      dbCheck: async () => ({ status: 'ok', p95LatencyMs: 12 }),
      kafkaCheck: async () => ({ status: 'ok', consumerLag: 0 }),
      wsManager,
      startTime: Date.now() - 60000,
    });

    expect(result.status).toBe('ok');
    expect(result.db.status).toBe('ok');
    expect(result.kafka.status).toBe('ok');
    expect(result.uptime).toBeGreaterThanOrEqual(59);
  });

  it('should return degraded when DB is unhealthy', async () => {
    const wsManager = new WsConnectionManager();
    const result = await healthHandler({
      dbCheck: async () => ({ status: 'error', p95LatencyMs: 999 }),
      kafkaCheck: async () => ({ status: 'ok', consumerLag: 0 }),
      wsManager,
      startTime: Date.now(),
    });

    expect(result.status).toBe('degraded');
  });
});
