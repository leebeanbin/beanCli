import { createHmac } from 'crypto';
import { buildServer } from './server.js';
import { WsConnectionManager } from '@tfsdc/application';
import { PgPool } from '@tfsdc/infrastructure';

const PORT = Number(process.env.APP_PORT ?? 3000);
const HOST = process.env.API_HOST ?? '0.0.0.0';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/tfsdc';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-in-prod';

async function main() {
  const pgPool = new PgPool({ connectionString: DATABASE_URL, max: 10 });
  const wsManager = new WsConnectionManager();
  const startTime = Date.now();

  const app = await buildServer({
    jwtVerifier: {
      verify: async (token: string) => {
        const [headerB64, payloadB64, sig] = token.split('.');
        if (!headerB64 || !payloadB64 || !sig) throw new Error('Invalid token format');

        const expectedSig = createHmac('sha256', JWT_SECRET)
          .update(`${headerB64}.${payloadB64}`)
          .digest('base64url');

        if (sig !== expectedSig) throw new Error('Invalid signature');

        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          throw new Error('Token expired');
        }

        return { sub: payload.sub, role: payload.role };
      },
    },
    auditWriter: {
      write: async (entry) => {
        const correlationId = entry.correlationId ?? crypto.randomUUID();
        await pgPool.query(
          `INSERT INTO audit_events (category, actor, action, resource, result, correlation_id, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [entry.category, entry.actor, entry.action, entry.resource, entry.result, correlationId, JSON.stringify(entry.data ?? {})],
        ).catch((err) => console.error('[audit] write failed:', err.message));
      },
    },
    dbSessionFactory: () => pgPool.createSession(),
    healthDeps: {
      dbCheck: () => pgPool.healthCheck(),
      kafkaCheck: async () => ({ status: 'ok', consumerLag: 0 }),
      wsManager,
      startTime,
    },
  });

  const shutdown = async () => {
    console.log('[api] Shutting down...');
    await app.close();
    await pgPool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: PORT, host: HOST });
  console.log(`[api] Server running on ${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error('[api] Fatal error:', err);
  process.exit(1);
});
