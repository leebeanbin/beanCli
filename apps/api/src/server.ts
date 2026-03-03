import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import type { UserRole } from '@tfsdc/kernel';
import {
  authenticate,
  checkRole,
  writeAuditLog,
  healthHandler,
  listState,
  getStateById,
  updateStateField,
  deleteStateRow,
  insertStateRow,
  getStateSchema,
  listAuditLogs,
  isValidStateTable,
} from '@tfsdc/application';
import type {
  IJwtVerifier,
  IAuditWriter,
  IDbSession,
  HealthDeps,
  IChangeRouteHandler,
  IApprovalRouteHandler,
} from '@tfsdc/application';
import type { PgPool } from '@tfsdc/infrastructure';
import { SchemaIntrospector, createAdapter, initDbAdapters } from '@tfsdc/infrastructure';

declare module 'fastify' {
  interface FastifyRequest {
    actor: string;
    role: UserRole;
    dbSession: IDbSession;
  }
}

export interface ServerDeps {
  jwtVerifier: IJwtVerifier;
  jwtSign: (sub: string, role: string) => string;
  auditWriter: IAuditWriter;
  dbSessionFactory: () => IDbSession;
  healthDeps: HealthDeps;
  changeHandler: IChangeRouteHandler;
  approvalHandler: IApprovalRouteHandler;
  pgPool: PgPool;
}

export async function buildServer(deps: ServerDeps) {
  // Register all DB adapters once at startup
  initDbAdapters();

  const app = Fastify({
    logger: {
      // SEC-006: redact sensitive fields from all pino log records
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'body.password',
          'body.credential',
          'body.secret',
          '*.password',
          '*.credential',
          '*.secret',
        ],
        censor: '[REDACTED]',
      },
    },
  });
  const APP_ENV = (process.env.APP_ENV ?? 'dev').toLowerCase();

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

  function isStateValidationError(err: unknown): boolean {
    return err instanceof Error && err.name === 'StateValidationError';
  }

  function mapIntegrityError(err: unknown): { status: number; code: string; error: string } | null {
    const e = err as { code?: string; constraint?: string; detail?: string; message?: string };
    if (e?.code === '23503') {
      return {
        status: 422,
        code: 'STATE_FK_VIOLATION',
        error: e.detail ?? e.message ?? 'Foreign key constraint violation',
      };
    }
    if (e?.code === '23514') {
      return {
        status: 422,
        code: 'STATE_CHECK_VIOLATION',
        error: e.detail ?? e.message ?? 'Check constraint violation',
      };
    }
    if (e?.code === '23505') {
      return {
        status: 409,
        code: 'STATE_UNIQUE_VIOLATION',
        error: e.detail ?? e.message ?? 'Unique constraint violation',
      };
    }
    return null;
  }

  // ─── Auth ────────────────────────────────────────
  app.post('/api/v1/auth/login', async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    if (!body?.username || !body?.password) {
      return reply.status(400).send({ error: 'username and password are required' });
    }

    const result = await deps.pgPool.query(
      `SELECT username, role FROM cli_users
       WHERE username = $1
         AND active = true
         AND password_hash = crypt($2, password_hash)
       LIMIT 1`,
      [body.username, body.password],
    );

    if (result.rows.length === 0) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const row = result.rows[0] as { username: string; role: string };
    const token = deps.jwtSign(row.username, row.role);
    return reply.send({ token, username: row.username, role: row.role });
  });

  // ─── Health ─────────────────────────────────────
  app.get('/health', async () => healthHandler(deps.healthDeps));

  // ─── Changes ────────────────────────────────────
  app.post('/api/v1/changes', {
    preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
  }, async (request, reply) => {
    const body = request.body as { sql: string; description?: string; environment?: string };
    if (!body?.sql) return reply.status(400).send({ error: 'sql is required' });

    try {
      const result = await deps.changeHandler.create(
        { actor: request.actor, role: request.role },
        request.dbSession,
        { sql: body.sql, description: body.description, environment: body.environment ?? 'DEV' },
      );
      return reply.status(201).send(result);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      return reply.status(status).send({ error: (err as Error).message });
    }
  });

  app.get('/api/v1/changes', async (request) => {
    const q = request.query as { status?: string; limit?: string; offset?: string };
    return deps.changeHandler.list(request.dbSession, {
      status: q.status,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.get<{ Params: { id: string } }>('/api/v1/changes/:id', async (request, reply) => {
    const result = await deps.changeHandler.getById(request.dbSession, request.params.id);
    if (!result) return reply.status(404).send({ error: 'Not found' });
    return result;
  });

  app.post<{ Params: { id: string } }>('/api/v1/changes/:id/submit', {
    preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
  }, async (request, reply) => {
    try {
      return await deps.changeHandler.submit(
        { actor: request.actor, role: request.role },
        request.dbSession,
        request.params.id,
      );
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      return reply.status(status).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/api/v1/changes/:id/execute', {
    preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
  }, async (request, reply) => {
    try {
      return await deps.changeHandler.execute(
        { actor: request.actor, role: request.role },
        request.dbSession,
        request.params.id,
      );
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      return reply.status(status).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/api/v1/changes/:id/revert', {
    preHandler: await authPreHandler(['DBA']) as never,
  }, async (request, reply) => {
    try {
      return await deps.changeHandler.revert(
        { actor: request.actor, role: request.role },
        request.dbSession,
        request.params.id,
      );
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      return reply.status(status).send({ error: (err as Error).message });
    }
  });

  // ─── Approvals ──────────────────────────────────
  app.get('/api/v1/approvals/pending', {
    preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
  }, async (request) => {
    return deps.approvalHandler.listPending(request.dbSession);
  });

  app.post<{ Params: { changeId: string } }>('/api/v1/approvals/:changeId/approve', {
    preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
  }, async (request, reply) => {
    try {
      return await deps.approvalHandler.approve(
        { actor: request.actor, role: request.role },
        request.dbSession,
        request.params.changeId,
      );
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      return reply.status(status).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { changeId: string } }>('/api/v1/approvals/:changeId/reject', {
    preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
  }, async (request, reply) => {
    try {
      return await deps.approvalHandler.reject(
        { actor: request.actor, role: request.role },
        request.dbSession,
        request.params.changeId,
      );
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      return reply.status(status).send({ error: (err as Error).message });
    }
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

  app.get<{ Params: { table: string } }>(
    '/api/v1/state/:table/schema',
    {
      preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
    },
    async (request, reply) => {
      const { table } = request.params;
      if (!isValidStateTable(table)) return reply.status(400).send({ error: `Invalid table: ${table}` });
      return getStateSchema(table);
    },
  );

  // DELETE /api/v1/state/:table/:id — delete a row by entity_id_hash
  app.delete<{ Params: { table: string; id: string } }>(
    '/api/v1/state/:table/:id', {
      preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
    }, async (request, reply) => {
      const { table, id } = request.params;
      if (!isValidStateTable(table)) return reply.status(400).send({ error: `Invalid table: ${table}` });
      try {
        const result = await deleteStateRow(request.dbSession, table, id);
        if (!result.deleted) return reply.status(404).send({ error: 'Entity not found' });
        return result;
      } catch (err) {
        const e = err as Error;
        app.log.warn({ table, id, actor: request.actor, error: e.message }, 'state-delete failed');
        const integrity = mapIntegrityError(err);
        if (integrity) {
          return reply.status(integrity.status).send({ error: integrity.error, code: integrity.code });
        }
        const isValidation = isStateValidationError(e);
        const code = isValidation ? 422 : 400;
        return reply.status(code).send({ error: e.message, code: isValidation ? 'STATE_VALIDATION_ERROR' : 'BAD_REQUEST' });
      }
    },
  );

  // POST /api/v1/state/:table — insert a new row (field-whitelisted)
  app.post<{ Params: { table: string }; Body: Record<string, string> }>(
    '/api/v1/state/:table', {
      preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
    }, async (request, reply) => {
      const { table } = request.params;
      if (!isValidStateTable(table)) return reply.status(400).send({ error: `Invalid table: ${table}` });
      try {
        const result = await insertStateRow(request.dbSession, table, request.body ?? {});
        return reply.status(201).send(result);
      } catch (err) {
        const e = err as Error;
        app.log.warn({ table, actor: request.actor, error: e.message }, 'state-insert failed');
        const integrity = mapIntegrityError(err);
        if (integrity) {
          return reply.status(integrity.status).send({ error: integrity.error, code: integrity.code });
        }
        const isValidation = isStateValidationError(e);
        const code = isValidation ? 422 : 400;
        return reply.status(code).send({ error: e.message, code: isValidation ? 'STATE_VALIDATION_ERROR' : 'BAD_REQUEST' });
      }
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

  // ─── Monitoring ─────────────────────────────────
  app.get('/api/v1/monitoring/stream-stats', async () => {
    const result = await deps.pgPool.query(`
      SELECT
        entity_type,
        total_events,
        latest_event_time_ms,
        recovered_count,
        events_last_5min
      FROM v_streaming_health
      ORDER BY total_events DESC
    `);
    return { items: result.rows };
  });

  // ─── Schema Introspection ──────────────────────
  const schemaIntrospector = new SchemaIntrospector(deps.pgPool as unknown as import('@tfsdc/infrastructure').IDbPool);
  const READONLY_SQL = /^\s*(SELECT|SHOW|EXPLAIN|WITH)\b/i;
  const DDL_SQL = /^\s*(CREATE|DROP|ALTER)\b/i;
  const DML_SQL = /^\s*(INSERT|UPDATE|DELETE)\b/i;
  const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  function isSafeIdentifier(v: string): boolean {
    return SAFE_IDENTIFIER.test(v);
  }

  function quoteIdent(v: string): string {
    return `"${v.replace(/"/g, '""')}"`;
  }

  function hasMultipleStatements(sql: string): boolean {
    const withoutTrailingSemicolon = sql.trim().replace(/;+\s*$/, '');
    return withoutTrailingSemicolon.includes(';');
  }

  app.get('/api/v1/schema/tables', async () => {
    const tables = await schemaIntrospector.getTables();
    return { items: tables };
  });

  app.get('/api/v1/schema/indexes', async () => {
    const [indexes, usage] = await Promise.all([
      schemaIntrospector.getIndexes(),
      schemaIntrospector.getIndexUsageStats(),
    ]);
    return { indexes, usage };
  });

  app.post<{ Body: { sql: string } }>('/api/v1/schema/analyze', {
    preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
  }, async (request, reply) => {
    const body = request.body as { sql?: string };
    if (!body?.sql) return reply.status(400).send({ error: 'sql is required' });
    const sql = body.sql.trim();
    if (hasMultipleStatements(sql)) {
      return reply.status(400).send({ error: 'multiple statements are not allowed' });
    }
    if (!READONLY_SQL.test(sql)) {
      return reply.status(400).send({ error: 'only read-only SQL can be analyzed' });
    }
    try {
      const result = await deps.pgPool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`);
      return { plan: result.rows.map(r => Object.values(r)[0]) };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // ─── Direct SQL Execution ────────────────────────
  app.post('/api/v1/sql/execute', {
    preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
  }, async (request, reply) => {
    const body = request.body as { sql?: string; readonly?: boolean };
    if (!body?.sql?.trim()) return reply.status(400).send({ error: 'sql is required' });
    const sql = body.sql.trim();
    if (hasMultipleStatements(sql)) {
      return reply.status(400).send({ error: 'multiple statements are not allowed' });
    }

    try {
      if (READONLY_SQL.test(sql)) {
        const result = await deps.pgPool.query(sql);
        return {
          type: 'query',
          rows: result.rows,
          rowCount: result.rowCount ?? result.rows.length,
          columns: result.rows.length > 0 ? Object.keys(result.rows[0]) : [],
        };
      }

      if (DDL_SQL.test(sql)) {
        if (APP_ENV === 'prod') {
          return reply.status(403).send({ error: 'Direct DDL is disabled in PROD. Use ChangeRequest workflow.' });
        }
        if (request.role !== 'DBA') {
          return reply.status(403).send({ error: 'Only DBA can run DDL via direct SQL endpoint' });
        }
        const result = await deps.pgPool.query(sql);
        return {
          type: 'ddl',
          message: `DDL executed successfully`,
          rowCount: result.rowCount ?? 0,
        };
      }

      if (DML_SQL.test(sql)) {
        if (APP_ENV === 'prod') {
          return reply.status(403).send({ error: 'Direct DML is disabled in PROD. Use ChangeRequest workflow.' });
        }
        if (request.role !== 'DBA') {
          return reply.status(403).send({ error: 'Only DBA can run DML via direct SQL endpoint' });
        }
        const result = await deps.pgPool.query(sql);
        return {
          type: 'dml',
          message: `${result.rowCount ?? 0} row(s) affected`,
          rowCount: result.rowCount ?? 0,
        };
      }

      const result = await deps.pgPool.query(sql);
      return {
        type: 'other',
        rows: result.rows ?? [],
        rowCount: result.rowCount ?? 0,
        columns: result.rows?.length > 0 ? Object.keys(result.rows[0]) : [],
      };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // ─── Index Management ────────────────────────────
  app.post('/api/v1/indexes/create', {
    preHandler: await authPreHandler(['DBA']) as never,
  }, async (request, reply) => {
    const body = request.body as { table?: string; columns?: string[]; name?: string; unique?: boolean };
    if (!body?.table || !body?.columns?.length) {
      return reply.status(400).send({ error: 'table and columns are required' });
    }

    if (!isSafeIdentifier(body.table)) {
      return reply.status(400).send({ error: 'invalid table name' });
    }
    if (!body.columns.every(isSafeIdentifier)) {
      return reply.status(400).send({ error: 'invalid column name' });
    }
    const indexName = body.name ?? `idx_${body.table}_${body.columns.join('_')}`;
    if (!isSafeIdentifier(indexName)) {
      return reply.status(400).send({ error: 'invalid index name' });
    }

    const uniqueStr = body.unique ? 'UNIQUE ' : '';
    const safeTable = quoteIdent(body.table);
    const safeIndex = quoteIdent(indexName);
    const safeColumns = body.columns.map(quoteIdent).join(', ');
    const sql = `CREATE ${uniqueStr}INDEX CONCURRENTLY IF NOT EXISTS ${safeIndex} ON ${safeTable} (${safeColumns})`;

    try {
      await deps.pgPool.query(sql);
      return { success: true, sql, indexName };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message, sql });
    }
  });

  app.post('/api/v1/indexes/drop', {
    preHandler: await authPreHandler(['DBA']) as never,
  }, async (request, reply) => {
    const body = request.body as { name?: string };
    if (!body?.name) return reply.status(400).send({ error: 'index name is required' });
    if (!isSafeIdentifier(body.name)) return reply.status(400).send({ error: 'invalid index name' });

    const sql = `DROP INDEX CONCURRENTLY IF EXISTS ${quoteIdent(body.name)}`;
    try {
      await deps.pgPool.query(sql);
      return { success: true, sql };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message, sql });
    }
  });

  // ─── Row Update ──────────────────────────────────
  // Uses updateStateField: table validated by whitelist, field by WRITABLE_FIELDS,
  // values via parameterized query — no SQL injection surface
  app.post<{ Params: { table: string }; Body: { id: string; field: string; value: string } }>(
    '/api/v1/state/:table/update', {
      preHandler: await authPreHandler(['MANAGER', 'DBA']) as never,
    }, async (request, reply) => {
      const { table } = request.params;
      if (!isValidStateTable(table)) return reply.status(400).send({ error: `Invalid table: ${table}` });
      const { id, field, value } = request.body ?? {};
      if (!id || !field || value === undefined) {
        return reply.status(400).send({ error: 'id, field, value are required' });
      }
      try {
        const result = await updateStateField(request.dbSession, table, id, field, String(value));
        if (!result.updated) return reply.status(404).send({ error: 'Row not found' });
        return { success: true };
      } catch (err) {
        const e = err as Error;
        app.log.warn({ table, id, field, actor: request.actor, error: e.message }, 'state-update failed');
        const integrity = mapIntegrityError(err);
        if (integrity) {
          return reply.status(integrity.status).send({ error: integrity.error, code: integrity.code });
        }
        const isValidation = isStateValidationError(e);
        const code = isValidation ? 422 : 400;
        return reply.status(code).send({ error: e.message, code: isValidation ? 'STATE_VALIDATION_ERROR' : 'BAD_REQUEST' });
      }
    },
  );

  // ─── AI Chat Proxy ────────────────────────────
  const SIDECAR_URL = process.env.BEANLLM_SIDECAR_URL ?? 'http://localhost:3200';

  const DB_SYSTEM_PROMPT = `You are a PostgreSQL database assistant for the TFSDC system.
You have access to the following database schema. Generate valid PostgreSQL SQL when asked.
Always wrap SQL in \`\`\`sql code blocks.
Provide brief explanations in Korean.`;

  async function buildAiMessages(body: {
    messages?: { role: string; content: string }[];
    includeSchema?: boolean;
  }): Promise<{ messages: { role: string; content: string }[]; system: string }> {
    const messages = [...(body.messages ?? [])];
    let system = DB_SYSTEM_PROMPT;
    if (body.includeSchema !== false) {
      try {
        const schemaCtx = await schemaIntrospector.getSchemaContext();
        system = `${DB_SYSTEM_PROMPT}\n\n${schemaCtx}`;
      } catch { /* best-effort */ }
    }
    return { messages, system };
  }

  app.post('/api/v1/ai/chat', async (request, reply) => {
    const body = request.body as {
      messages?: { role: string; content: string }[];
      model?: string;
      temperature?: number;
      includeSchema?: boolean;
    };
    if (!body?.messages?.length) return reply.status(400).send({ error: 'messages required' });

    const { messages, system } = await buildAiMessages(body);
    messages.unshift({ role: 'system', content: system });

    try {
      const res = await fetch(`${SIDECAR_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          model: body.model,
          temperature: body.temperature ?? 0.7,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        return reply.status(res.status).send({ error: errBody });
      }
      return await res.json();
    } catch (err) {
      return reply.status(503).send({
        error: 'AI sidecar not available',
        detail: (err as Error).message,
      });
    }
  });

  app.post('/api/v1/ai/stream', async (request, reply) => {
    const body = request.body as {
      messages?: { role: string; content: string }[];
      model?: string;
      temperature?: number;
      includeSchema?: boolean;
    };
    if (!body?.messages?.length) return reply.status(400).send({ error: 'messages required' });

    const { messages, system } = await buildAiMessages(body);

    try {
      const res = await fetch(`${SIDECAR_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          system,
          model: body.model,
          temperature: body.temperature ?? 0.7,
        }),
      });
      if (!res.ok || !res.body) {
        const errBody = await res.text();
        return reply.status(res.status).send({ error: errBody });
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(decoder.decode(value, { stream: true }));
        }
      } catch { /* stream interrupted */ }
      reply.raw.end();
      return reply;
    } catch (err) {
      return reply.status(503).send({
        error: 'AI sidecar not available',
        detail: (err as Error).message,
      });
    }
  });

  app.post('/api/v1/ai/agentic', async (request, reply) => {
    const body = request.body as {
      messages?: { role: string; content: string }[];
      model?: string;
      temperature?: number;
      includeSchema?: boolean;
    };
    if (!body?.messages?.length) return reply.status(400).send({ error: 'messages required' });

    const { messages, system } = await buildAiMessages(body);

    try {
      const res = await fetch(`${SIDECAR_URL}/chat/agentic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          system,
          model: body.model,
          temperature: body.temperature ?? 0.7,
        }),
      });
      if (!res.ok || !res.body) {
        const errBody = await res.text();
        return reply.status(res.status).send({ error: errBody });
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(decoder.decode(value, { stream: true }));
        }
      } catch { /* stream interrupted */ }
      reply.raw.end();
      return reply;
    } catch (err) {
      return reply.status(503).send({
        error: 'AI sidecar not available',
        detail: (err as Error).message,
      });
    }
  });

  app.get('/api/v1/ai/models', async (_request, reply) => {
    try {
      const res = await fetch(`${SIDECAR_URL}/models`);
      if (!res.ok) return reply.status(res.status).send({ error: 'Failed to fetch models' });
      return await res.json();
    } catch (err) {
      return reply.status(503).send({
        error: 'AI sidecar not available',
        detail: (err as Error).message,
      });
    }
  });

  app.get('/api/v1/ai/health', async (_request, reply) => {
    try {
      const res = await fetch(`${SIDECAR_URL}/health`);
      if (!res.ok) return reply.status(res.status).send({ error: 'AI sidecar unhealthy' });
      return await res.json();
    } catch (err) {
      return reply.status(503).send({
        error: 'AI sidecar not available',
        detail: (err as Error).message,
      });
    }
  });

  // ─── Connection Test ─────────────────────────────
  // No auth required — CLI is on trusted local network
  app.post('/api/v1/connections/test', async (request, reply) => {
    const body = request.body as {
      type?: string;
      host?: string;
      port?: number;
      database?: string;
      username?: string;
      password?: string;
    };

    if (!body?.type) {
      return reply.status(400).send({ ok: false, error: 'type is required' });
    }

    let adapter;
    try {
      adapter = createAdapter({
        type: body.type,
        host: body.host,
        port: body.port,
        database: body.database,
        username: body.username,
        password: body.password,
      });
    } catch (err) {
      return reply.status(400).send({ ok: false, error: (err as Error).message });
    }

    try {
      const tables = await adapter.listTables();
      return { ok: true, tables };
    } catch (err) {
      return reply.status(400).send({ ok: false, error: (err as Error).message });
    } finally {
      await adapter.close().catch(() => {});
    }
  });

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
