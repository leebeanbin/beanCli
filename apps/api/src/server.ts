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

  app.decorateRequest('actor', '');
  app.decorateRequest('role', '' as UserRole);
  app.decorateRequest('dbSession', null as unknown as IDbSession);

  app.addHook('onRequest', async (request) => {
    request.dbSession = deps.dbSessionFactory();
  });

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

  async function authPreHandler(roles: UserRole[]) {
    return async (request: { headers: Record<string, string | undefined>; actor: string; role: UserRole; dbSession: IDbSession; url: string }, reply: { status: (code: number) => { send: (data: unknown) => unknown } }) => {
      const authResult = await authenticate(request.headers.authorization, deps.jwtVerifier);
      if (!authResult.success) {
        return reply.status(authResult.status).send({ error: authResult.error });
      }
      request.actor = authResult.context.actor;
      request.role = authResult.context.role;

      await request.dbSession.query(
        `SELECT set_config('app.current_actor', $1, true), set_config('app.current_role', $2, true)`,
        [authResult.context.actor, authResult.context.role],
      );

      const rbacResult = await checkRole(authResult.context, roles, request.url, deps.auditWriter);
      if (!rbacResult.allowed) {
        return reply.status(rbacResult.status!).send({ error: rbacResult.error });
      }
    };
  }

  // ─── Health ─────────────────────────────────────
  app.get('/health', async () => healthHandler(deps.healthDeps));

  // ─── Changes ────────────────────────────────────
  app.post('/api/v1/changes', {
    preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
  }, async (request, reply) => {
    const body = request.body as { sql: string; description?: string; environment?: string };
    if (!body?.sql) return reply.status(400).send({ error: 'sql is required' });

    const result = await request.dbSession.query(
      `INSERT INTO change_requests (sql_statement, description, submitted_by, environment, status)
       VALUES ($1, $2, $3, $4, 'DRAFT')
       RETURNING id, status`,
      [body.sql, body.description ?? '', request.actor, body.environment ?? 'DEV'],
    );
    return reply.status(201).send(result.rows[0]);
  });

  app.get('/api/v1/changes', async (request) => {
    const q = request.query as { status?: string; limit?: string; offset?: string };
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (q.status) { conditions.push(`status = $${idx++}`); params.push(q.status); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Number(q.limit) || 50, 200);
    const offset = Number(q.offset) || 0;
    params.push(limit, offset);

    const countRes = await request.dbSession.query(`SELECT COUNT(*) as total FROM change_requests ${where}`, params.slice(0, -2));
    const total = Number(countRes.rows[0]?.total ?? 0);
    const result = await request.dbSession.query(
      `SELECT * FROM change_requests ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`, params,
    );
    return { items: result.rows, total };
  });

  app.get<{ Params: { id: string } }>('/api/v1/changes/:id', async (request, reply) => {
    const result = await request.dbSession.query('SELECT * FROM change_requests WHERE id = $1', [request.params.id]);
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Not found' });
    return result.rows[0];
  });

  app.post<{ Params: { id: string } }>('/api/v1/changes/:id/submit', {
    preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
  }, async (request) => {
    await request.dbSession.query(
      `UPDATE change_requests SET status = 'PENDING_APPROVAL', submitted_at = now() WHERE id = $1 AND status = 'DRAFT'`,
      [request.params.id],
    );
    return { status: 'PENDING_APPROVAL' };
  });

  app.post<{ Params: { id: string } }>('/api/v1/changes/:id/execute', {
    preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
  }, async (request) => {
    await request.dbSession.query(
      `UPDATE change_requests SET status = 'EXECUTING', executed_at = now() WHERE id = $1 AND status IN ('APPROVED', 'WAITING_EXECUTION')`,
      [request.params.id],
    );
    return { status: 'EXECUTING' };
  });

  app.post<{ Params: { id: string } }>('/api/v1/changes/:id/revert', {
    preHandler: await authPreHandler(['DBA']) as never,
  }, async (request) => {
    await request.dbSession.query(
      `UPDATE change_requests SET status = 'REVERTED', reverted_at = now() WHERE id = $1 AND status = 'FAILED'`,
      [request.params.id],
    );
    return { status: 'REVERTED' };
  });

  // ─── Approvals ──────────────────────────────────
  app.get('/api/v1/approvals/pending', {
    preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
  }, async (request) => {
    const result = await request.dbSession.query(
      `SELECT * FROM change_requests WHERE status = 'PENDING_APPROVAL' ORDER BY created_at ASC`,
    );
    return { items: result.rows };
  });

  app.post<{ Params: { changeId: string } }>('/api/v1/approvals/:changeId/approve', {
    preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
  }, async (request) => {
    await request.dbSession.query(
      `UPDATE change_requests SET status = 'APPROVED', approved_by = $2, approved_at = now() WHERE id = $1 AND status = 'PENDING_APPROVAL'`,
      [request.params.changeId, request.actor],
    );
    return { status: 'APPROVED' };
  });

  app.post<{ Params: { changeId: string } }>('/api/v1/approvals/:changeId/reject', {
    preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
  }, async (request) => {
    await request.dbSession.query(
      `UPDATE change_requests SET status = 'DRAFT' WHERE id = $1 AND status = 'PENDING_APPROVAL'`,
      [request.params.changeId],
    );
    return { status: 'REJECTED' };
  });

  // ─── State ──────────────────────────────────────
  app.get<{ Params: { table: string }; Querystring: { limit?: string; offset?: string } }>(
    '/api/v1/state/:table', async (request, reply) => {
      const { table } = request.params;
      if (!isValidStateTable(table)) return reply.status(400).send({ error: `Invalid table: ${table}` });
      return listState(request.dbSession, table, {
        limit: request.query.limit ? Number(request.query.limit) : undefined,
        offset: request.query.offset ? Number(request.query.offset) : undefined,
      });
    },
  );

  app.get<{ Params: { table: string; id: string } }>(
    '/api/v1/state/:table/:id', async (request, reply) => {
      const { table, id } = request.params;
      if (!isValidStateTable(table)) return reply.status(400).send({ error: `Invalid table: ${table}` });
      const result = await getStateById(request.dbSession, table, id);
      if (!result) return reply.status(404).send({ error: 'Entity not found' });
      return result;
    },
  );

  // ─── Audit ──────────────────────────────────────
  app.get<{ Querystring: { category?: string; actor?: string; limit?: string; offset?: string } }>(
    '/api/v1/audit', {
      preHandler: await authPreHandler(['MANAGER', 'DBA', 'SECURITY_ADMIN']) as never,
    }, async (request) => {
      return listAuditLogs(request.dbSession, {
        category: request.query.category,
        actor: request.query.actor,
        limit: request.query.limit ? Number(request.query.limit) : undefined,
        offset: request.query.offset ? Number(request.query.offset) : undefined,
      });
    },
  );

  // ─── WebSocket ──────────────────────────────────
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

  // ─── SSE ────────────────────────────────────────
  app.get<{ Querystring: { tables?: string } }>('/api/v1/stream', async (request, reply) => {
    const tables = request.query.tables?.split(',') ?? [];
    const clientId = crypto.randomUUID();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    wsManager.registerSse(clientId, tables, (message) => {
      reply.raw.write(`data: ${JSON.stringify(message)}\n\n`);
    });

    const pingInterval = setInterval(() => { reply.raw.write(': ping\n\n'); }, 30_000);
    request.raw.on('close', () => { clearInterval(pingInterval); wsManager.unregisterSse(clientId); });
  });

  return app;
}
