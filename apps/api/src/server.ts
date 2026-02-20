import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import type { UserRole } from '@tfsdc/kernel';
import {
  WsConnectionManager,
  authenticate,
  checkRole,
  writeAuditLog,
  healthHandler,
  listState,
  getStateById,
  listAuditLogs,
  isValidStateTable,
} from '@tfsdc/application';
import type {
  IJwtVerifier,
  IAuditWriter,
  IDbSession,
  HealthDeps,
} from '@tfsdc/application';

declare module 'fastify' {
  interface FastifyRequest {
    actor: string;
    role: UserRole;
    dbSession: IDbSession;
  }
}

export interface ServerDeps {
  jwtVerifier: IJwtVerifier;
  auditWriter: IAuditWriter;
  dbSessionFactory: () => IDbSession;
  healthDeps: HealthDeps;
}

export async function buildServer(deps: ServerDeps) {
  const app = Fastify({ logger: true });

  await app.register(fastifyWebsocket);

  const wsManager = deps.healthDeps.wsManager;

  // ─── Auth Hook ──────────────────────────────────────
  app.decorateRequest('actor', '');
  app.decorateRequest('role', '' as UserRole);
  app.decorateRequest('dbSession', null as unknown as IDbSession);

  app.addHook('onRequest', async (request) => {
    request.dbSession = deps.dbSessionFactory();
  });

  // ─── Audit Hook ─────────────────────────────────────
  app.addHook('onSend', async (request, reply) => {
    if (request.actor) {
      await writeAuditLog(
        {
          method: request.method,
          url: request.routeOptions?.url ?? request.url,
          actor: request.actor,
          correlationId: request.headers['x-correlation-id'] as string,
        },
        reply.statusCode,
        deps.auditWriter,
      ).catch(() => {});
    }
  });

  // ─── Helper: Auth + RBAC pre-handler ────────────────
  function authAndRole(...roles: UserRole[]) {
    return async (request: ReturnType<typeof app.hasDecorator> extends true ? Parameters<typeof app.addHook>[1] extends (req: infer R, ...args: unknown[]) => unknown ? R : never : never, reply: { status: (code: number) => { send: (data: unknown) => void } }) => {
      const req = request as unknown as { headers: Record<string, string | undefined>; actor: string; role: UserRole; dbSession: IDbSession; url: string };
      const authResult = await authenticate(req.headers.authorization, deps.jwtVerifier);
      if (!authResult.success) {
        return reply.status(authResult.status).send({ error: authResult.error });
      }
      req.actor = authResult.context.actor;
      req.role = authResult.context.role;

      await req.dbSession.query(
        `SELECT set_config('app.current_actor', $1, true), set_config('app.current_role', $2, true)`,
        [authResult.context.actor, authResult.context.role],
      );

      const rbacResult = await checkRole(authResult.context, roles, req.url, deps.auditWriter);
      if (!rbacResult.allowed) {
        return reply.status(rbacResult.status!).send({ error: rbacResult.error });
      }
    };
  }

  // ─── Health ─────────────────────────────────────────
  app.get('/health', async () => {
    return healthHandler(deps.healthDeps);
  });

  // ─── State Routes ───────────────────────────────────
  app.get<{ Params: { table: string }; Querystring: { limit?: string; offset?: string } }>(
    '/api/v1/state/:table',
    async (request, reply) => {
      const { table } = request.params;
      if (!isValidStateTable(table)) {
        return reply.status(400).send({ error: `Invalid table: ${table}` });
      }
      return listState(request.dbSession, table, {
        limit: request.query.limit ? Number(request.query.limit) : undefined,
        offset: request.query.offset ? Number(request.query.offset) : undefined,
      });
    },
  );

  app.get<{ Params: { table: string; id: string } }>(
    '/api/v1/state/:table/:id',
    async (request, reply) => {
      const { table, id } = request.params;
      if (!isValidStateTable(table)) {
        return reply.status(400).send({ error: `Invalid table: ${table}` });
      }
      const result = await getStateById(request.dbSession, table, id);
      if (!result) {
        return reply.status(404).send({ error: 'Entity not found' });
      }
      return result;
    },
  );

  // ─── Audit Routes ──────────────────────────────────
  app.get<{ Querystring: { category?: string; actor?: string; limit?: string; offset?: string } }>(
    '/api/v1/audit',
    {
      preHandler: authAndRole('MANAGER', 'DBA', 'SECURITY_ADMIN') as never,
    },
    async (request) => {
      return listAuditLogs(request.dbSession, {
        category: request.query.category,
        actor: request.query.actor,
        limit: request.query.limit ? Number(request.query.limit) : undefined,
        offset: request.query.offset ? Number(request.query.offset) : undefined,
      });
    },
  );

  // ─── WebSocket ──────────────────────────────────────
  app.register(async function wsRoutes(fastify) {
    fastify.get('/ws', { websocket: true }, (socket) => {
      socket.on('message', (data) => {
        wsManager.handleMessage(
          {
            readyState: socket.readyState,
            send: (d: string) => socket.send(d),
            on: (event: string, listener: (...args: unknown[]) => void) => socket.on(event, listener),
          },
          data.toString(),
        );
      });
    });
  });

  // ─── SSE Fallback ───────────────────────────────────
  app.get<{ Querystring: { tables?: string } }>(
    '/api/v1/stream',
    async (request, reply) => {
      const tables = request.query.tables?.split(',') ?? [];
      const clientId = crypto.randomUUID();

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      wsManager.registerSse(clientId, tables, (message) => {
        reply.raw.write(`data: ${JSON.stringify(message)}\n\n`);
      });

      const pingInterval = setInterval(() => {
        reply.raw.write(': ping\n\n');
      }, 30_000);

      request.raw.on('close', () => {
        clearInterval(pingInterval);
        wsManager.unregisterSse(clientId);
      });
    },
  );

  return app;
}
