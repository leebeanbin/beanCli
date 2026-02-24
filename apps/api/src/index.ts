import { createHmac, randomBytes } from 'crypto';
import { Client } from 'pg';
import { buildServer } from './server.js';
import {
  WsConnectionManager,
  ChangeRouteHandlerImpl,
  ApprovalRouteHandlerImpl,
} from '@tfsdc/application';
import { PgPool, PgChangeRequestRepository } from '@tfsdc/infrastructure';
import { SqlAstValidatorImpl } from '@tfsdc/dsl';
import { AuditEventWriter } from '@tfsdc/audit';

const PORT = Number(process.env.APP_PORT ?? 3000);
const HOST = process.env.API_HOST ?? '0.0.0.0';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/tfsdc';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-in-prod';

// Map Kafka entity types to state table names
const ENTITY_TO_TABLE: Record<string, string> = {
  orders: 'state_orders',
  payments: 'state_payments',
  products: 'state_products',
  shipments: 'state_shipments',
  users: 'state_users',
};

async function startNotificationListener(
  wsManager: WsConnectionManager,
  connectionString: string,
): Promise<Client> {
  const client = new Client({ connectionString });
  await client.connect();
  await client.query('LISTEN tfsdc_stream_event');

  client.on('notification', (msg) => {
    if (msg.channel !== 'tfsdc_stream_event' || !msg.payload) return;
    try {
      const data = JSON.parse(msg.payload) as { entityType: string; count: number };
      const stateTable = ENTITY_TO_TABLE[data.entityType] ?? `state_${data.entityType}`;
      wsManager.broadcast(stateTable, {
        type: 'STREAM_EVENT',
        entityType: data.entityType,
        count: data.count,
      });
    } catch {
      // ignore malformed notification payloads
    }
  });

  client.on('error', (err) => {
    console.error('[api] PG listener error:', err.message);
  });

  console.log('[api] PostgreSQL LISTEN tfsdc_stream_event — ready');
  return client;
}

async function main() {
  const pgPool = new PgPool({ connectionString: DATABASE_URL, max: 10 });
  const wsManager = new WsConnectionManager();
  const startTime = Date.now();

  const validator = new SqlAstValidatorImpl();
  const repo = new PgChangeRequestRepository(pgPool, validator);
  const auditWriter = new AuditEventWriter(pgPool);

  const changeHandler = new ChangeRouteHandlerImpl(repo, validator, wsManager);
  const approvalHandler = new ApprovalRouteHandlerImpl(repo);

  // Set up PostgreSQL LISTEN for projector → WS bridge
  const listenerClient = await startNotificationListener(wsManager, DATABASE_URL);

  function jwtSign(sub: string, role: string): string {
    const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub,
      role,
      jti: randomBytes(8).toString('hex'),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400, // 24h
    })).toString('base64url');
    const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${sig}`;
  }

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
    jwtSign,
    auditWriter,
    dbSessionFactory: () => pgPool.createSession(),
    healthDeps: {
      dbCheck: () => pgPool.healthCheck(),
      kafkaCheck: async () => ({ status: 'ok', consumerLag: 0 }),
      wsManager,
      startTime,
    },
    changeHandler,
    approvalHandler,
    pgPool,
  });

  const shutdown = async () => {
    console.log('[api] Shutting down...');
    await app.close();
    await listenerClient.end();
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
