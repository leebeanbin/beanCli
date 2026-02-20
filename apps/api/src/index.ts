import { buildServer } from './server.js';
import { WsConnectionManager } from '@tfsdc/application';

const PORT = Number(process.env.API_PORT ?? 3000);
const HOST = process.env.API_HOST ?? '0.0.0.0';

async function main() {
  const wsManager = new WsConnectionManager();
  const startTime = Date.now();

  const app = await buildServer({
    jwtVerifier: {
      verify: async () => ({ sub: 'system', role: 'DBA' }),
    },
    auditWriter: {
      write: async (entry) => {
        console.log('[audit]', JSON.stringify(entry));
      },
    },
    dbSessionFactory: () => ({
      query: async () => ({ rows: [], rowCount: 0 }),
    }),
    healthDeps: {
      dbCheck: async () => ({ status: 'ok', p95LatencyMs: 0 }),
      kafkaCheck: async () => ({ status: 'ok', consumerLag: 0 }),
      wsManager,
      startTime,
    },
  });

  await app.listen({ port: PORT, host: HOST });
  console.log(`API server running on ${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
