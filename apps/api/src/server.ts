import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyRateLimit from '@fastify/rate-limit';
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
  /** Skip rate limiting — for load/bench tests only, never set in production */
  disableRateLimit?: boolean;
  /** Disable request logging — for load/bench tests only, never set in production */
  disableRequestLogging?: boolean;
}

export async function buildServer(deps: ServerDeps) {
  // Register all DB adapters once at startup
  initDbAdapters();

  const app = Fastify({
    logger: deps.disableRequestLogging
      ? false
      : {
          // SEC-006: redact sensitive fields from all pino log records
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'body.password',
              'body.currentPassword',
              'body.newPassword',
              'body.credential',
              'body.secret',
              '*.password',
              '*.currentPassword',
              '*.newPassword',
              '*.credential',
              '*.secret',
            ],
            censor: '[REDACTED]',
          },
        },
  });
  const APP_ENV = (process.env.APP_ENV ?? 'dev').toLowerCase();

  // CORS — allow web console (localhost:3000) and any local origin in dev
  await app.register(fastifyCors, {
    origin: APP_ENV === 'prod'
      ? (process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)
      : true,   // reflect all origins in dev
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
    credentials: true,
  });

  if (!deps.disableRateLimit) {
    await app.register(fastifyRateLimit, {
      max: 60,
      timeWindow: '1 minute',
      // errorResponseBuilder result is thrown by the plugin — must be an Error with statusCode
      errorResponseBuilder: (
        _req: unknown,
        ctx: { max: number; after: string; statusCode: number },
      ) => {
        const err = Object.assign(new Error(`Rate limit exceeded — max ${ctx.max} req/min`), {
          statusCode: ctx.statusCode,
          retryAfter: ctx.after,
        });
        return err;
      },
    });
  }

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
    return async (
      request: {
        headers: Record<string, string | undefined>;
        actor: string;
        role: UserRole;
        dbSession: IDbSession;
        url: string;
      },
      reply: { status: (code: number) => { send: (data: unknown) => unknown } },
    ) => {
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
  app.post(
    '/api/v1/auth/login',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
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
    },
  );

  // ─── Auth: setup-status ──────────────────────────
  app.get('/api/v1/auth/setup-status', async (_request, reply) => {
    try {
      const result = await deps.pgPool.query('SELECT COUNT(*)::int AS cnt FROM cli_users');
      const cnt = (result.rows[0] as { cnt: number }).cnt;
      return reply.send({ needsSetup: cnt === 0 });
    } catch {
      return reply.send({ needsSetup: false });
    }
  });

  // ─── Auth: first-run setup ────────────────────────
  app.post(
    '/api/v1/auth/setup',
    { config: { rateLimit: { max: 3, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      const body = request.body as { username?: string; password?: string };
      if (!body?.username || !body?.password) {
        return reply.status(400).send({ error: 'username and password are required' });
      }
      if (body.username.length < 3 || body.username.length > 64) {
        return reply.status(400).send({ error: 'username must be 3–64 characters' });
      }
      if (body.password.length < 8) {
        return reply.status(400).send({ error: 'password must be at least 8 characters' });
      }

      // Only allow when no users exist
      const countResult = await deps.pgPool.query('SELECT COUNT(*)::int AS cnt FROM cli_users');
      const cnt = (countResult.rows[0] as { cnt: number }).cnt;
      if (cnt > 0) {
        return reply.status(403).send({ error: 'Setup already completed. Use /auth/login.' });
      }

      await deps.pgPool.query(
        `INSERT INTO cli_users (username, password_hash, role, active)
         VALUES ($1, crypt($2, gen_salt('bf', 12)), 'DBA', true)`,
        [body.username, body.password],
      );

      const token = deps.jwtSign(body.username, 'DBA');
      return reply.status(201).send({ token, username: body.username, role: 'DBA' });
    },
  );

  // ─── Users: list ─────────────────────────────────
  app.get(
    '/api/v1/users',
    { preHandler: (await authPreHandler(['DBA', 'SECURITY_ADMIN'])) as never },
    async (_request, reply) => {
      const result = await deps.pgPool.query(
        `SELECT username, role, active, created_at
         FROM cli_users
         ORDER BY created_at`,
      );
      return reply.send({ items: result.rows });
    },
  );

  // ─── Users: create ───────────────────────────────
  app.post(
    '/api/v1/users',
    { preHandler: (await authPreHandler(['DBA'])) as never },
    async (request, reply) => {
      const body = request.body as { username?: string; password?: string; role?: string };
      if (!body?.username || !body?.password || !body?.role) {
        return reply.status(400).send({ error: 'username, password, and role are required' });
      }
      const VALID_ROLES = ['ANALYST', 'MANAGER', 'DBA', 'SECURITY_ADMIN'];
      if (!VALID_ROLES.includes(body.role)) {
        return reply.status(400).send({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
      }
      if (body.username.length < 3 || body.username.length > 64) {
        return reply.status(400).send({ error: 'username must be 3–64 characters' });
      }
      if (body.password.length < 8) {
        return reply.status(400).send({ error: 'password must be at least 8 characters' });
      }

      try {
        await deps.pgPool.query(
          `INSERT INTO cli_users (username, password_hash, role, active)
           VALUES ($1, crypt($2, gen_salt('bf', 12)), $3, true)`,
          [body.username, body.password, body.role],
        );
        return reply.status(201).send({ username: body.username, role: body.role, active: true });
      } catch (err) {
        const e = err as { code?: string };
        if (e?.code === '23505') {
          return reply.status(409).send({ error: `Username '${body.username}' already exists` });
        }
        throw err;
      }
    },
  );

  // ─── Users: update role/active/username ──────────
  app.patch<{ Params: { username: string } }>(
    '/api/v1/users/:username',
    { preHandler: (await authPreHandler(['DBA'])) as never },
    async (request, reply) => {
      const { username } = request.params;
      const body = request.body as { role?: string; active?: boolean; newUsername?: string };

      // Self-guard: role/active changes on own account are forbidden; newUsername rename is allowed
      if (username === request.actor && (body.role !== undefined || body.active !== undefined)) {
        return reply.status(400).send({ error: 'Cannot modify your own role or active status' });
      }

      if (body.newUsername !== undefined) {
        if (body.newUsername.length < 3 || body.newUsername.length > 64) {
          return reply.status(400).send({ error: 'newUsername must be 3–64 characters' });
        }
      }

      const VALID_ROLES = ['ANALYST', 'MANAGER', 'DBA', 'SECURITY_ADMIN'];
      if (body.role !== undefined && !VALID_ROLES.includes(body.role)) {
        return reply.status(400).send({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
      }

      // Guard: cannot deactivate or downgrade last DBA
      if (body.role !== undefined || body.active !== undefined) {
        if (body.role !== 'DBA' || body.active === false) {
          const dbaCountResult = await deps.pgPool.query(
            `SELECT COUNT(*)::int AS cnt FROM cli_users WHERE role = 'DBA' AND active = true AND username != $1`,
            [username],
          );
          const remaining = (dbaCountResult.rows[0] as { cnt: number }).cnt;

          const targetResult = await deps.pgPool.query(
            `SELECT role FROM cli_users WHERE username = $1`,
            [username],
          );
          if (targetResult.rows.length === 0) {
            return reply.status(404).send({ error: 'User not found' });
          }
          const targetRole = (targetResult.rows[0] as { role: string }).role;

          if (targetRole === 'DBA' && remaining === 0) {
            return reply.status(400).send({ error: 'Cannot remove the last active DBA account' });
          }
        }
      }

      const setClauses: string[] = [];
      const params: unknown[] = [];
      if (body.newUsername !== undefined) { params.push(body.newUsername); setClauses.push(`username = $${params.length}`); }
      if (body.role !== undefined) { params.push(body.role); setClauses.push(`role = $${params.length}`); }
      if (body.active !== undefined) { params.push(body.active); setClauses.push(`active = $${params.length}`); }

      if (setClauses.length === 0) {
        return reply.status(400).send({ error: 'Nothing to update' });
      }

      params.push(username);
      try {
        const result = await deps.pgPool.query(
          `UPDATE cli_users SET ${setClauses.join(', ')} WHERE username = $${params.length}
           RETURNING username, role, active`,
          params,
        );
        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'User not found' });
        }
        const row = result.rows[0] as { username: string; role: string; active: boolean };
        const isSelfRenamed = body.newUsername !== undefined && username === request.actor;
        return reply.send(isSelfRenamed ? { ...row, selfRenamed: true } : row);
      } catch (err) {
        const e = err as { code?: string };
        if (e?.code === '23505') {
          return reply.status(409).send({ error: 'Username already exists' });
        }
        throw err;
      }
    },
  );

  // ─── Users: deactivate (soft delete) ────────────
  app.delete<{ Params: { username: string } }>(
    '/api/v1/users/:username',
    { preHandler: (await authPreHandler(['DBA'])) as never },
    async (request, reply) => {
      const { username } = request.params;

      if (username === request.actor) {
        return reply.status(400).send({ error: 'Cannot deactivate your own account' });
      }

      // Guard: cannot deactivate last DBA
      const targetResult = await deps.pgPool.query(
        `SELECT role FROM cli_users WHERE username = $1`,
        [username],
      );
      if (targetResult.rows.length === 0) {
        return reply.status(404).send({ error: 'User not found' });
      }
      const targetRole = (targetResult.rows[0] as { role: string }).role;

      if (targetRole === 'DBA') {
        const dbaCountResult = await deps.pgPool.query(
          `SELECT COUNT(*)::int AS cnt FROM cli_users WHERE role = 'DBA' AND active = true AND username != $1`,
          [username],
        );
        const remaining = (dbaCountResult.rows[0] as { cnt: number }).cnt;
        if (remaining === 0) {
          return reply.status(400).send({ error: 'Cannot deactivate the last active DBA account' });
        }
      }

      await deps.pgPool.query(`UPDATE cli_users SET active = false WHERE username = $1`, [username]);
      return reply.send({ success: true, username, active: false });
    },
  );

  // ─── Auth: change-password ────────────────────────
  app.post(
    '/api/v1/auth/change-password',
    {
      preHandler: (await authPreHandler(['ANALYST', 'MANAGER', 'DBA', 'SECURITY_ADMIN'])) as never,
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const body = request.body as { currentPassword?: string; newPassword?: string };
      if (!body?.currentPassword || !body?.newPassword) {
        return reply.status(400).send({ error: 'currentPassword and newPassword are required' });
      }
      if (body.newPassword.length < 8) {
        return reply.status(400).send({ error: 'newPassword must be at least 8 characters' });
      }

      // Verify current password
      const verifyResult = await deps.pgPool.query(
        `SELECT username FROM cli_users
         WHERE username = $1 AND active = true
           AND password_hash = crypt($2, password_hash)`,
        [request.actor, body.currentPassword],
      );
      if (verifyResult.rows.length === 0) {
        return reply.status(401).send({ error: 'Current password is incorrect' });
      }

      await deps.pgPool.query(
        `UPDATE cli_users SET password_hash = crypt($1, gen_salt('bf', 12)) WHERE username = $2`,
        [body.newPassword, request.actor],
      );
      return reply.send({ success: true });
    },
  );

  // ─── Health ─────────────────────────────────────
  app.get('/health', async () => healthHandler(deps.healthDeps));
  // Also expose under /api/v1 prefix for consistency
  app.get('/api/v1/health', async () => healthHandler(deps.healthDeps));

  // ─── Changes ────────────────────────────────────
  app.post(
    '/api/v1/changes',
    {
      preHandler: (await authPreHandler(['MANAGER', 'DBA'])) as never,
    },
    async (request, reply) => {
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
    },
  );

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

  app.post<{ Params: { id: string } }>(
    '/api/v1/changes/:id/submit',
    {
      preHandler: (await authPreHandler(['MANAGER', 'DBA'])) as never,
    },
    async (request, reply) => {
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
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/changes/:id/execute',
    {
      preHandler: (await authPreHandler(['MANAGER', 'DBA'])) as never,
    },
    async (request, reply) => {
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
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/changes/:id/revert',
    {
      preHandler: (await authPreHandler(['DBA'])) as never,
    },
    async (request, reply) => {
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
    },
  );

  // ─── Approvals ──────────────────────────────────
  app.get(
    '/api/v1/approvals/pending',
    {
      preHandler: (await authPreHandler(['MANAGER', 'DBA'])) as never,
    },
    async (request) => {
      return deps.approvalHandler.listPending(request.dbSession);
    },
  );

  app.post<{ Params: { changeId: string } }>(
    '/api/v1/approvals/:changeId/approve',
    {
      preHandler: (await authPreHandler(['MANAGER', 'DBA'])) as never,
    },
    async (request, reply) => {
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
    },
  );

  app.post<{ Params: { changeId: string } }>(
    '/api/v1/approvals/:changeId/reject',
    {
      preHandler: (await authPreHandler(['MANAGER', 'DBA'])) as never,
    },
    async (request, reply) => {
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
    },
  );

  // ─── State ──────────────────────────────────────
  app.get<{ Params: { table: string }; Querystring: { limit?: string; offset?: string } }>(
    '/api/v1/state/:table',
    async (request, reply) => {
      const { table } = request.params;
      if (!isValidStateTable(table))
        return reply.status(400).send({ error: `Invalid table: ${table}` });
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
      if (!isValidStateTable(table))
        return reply.status(400).send({ error: `Invalid table: ${table}` });
      const result = await getStateById(request.dbSession, table, id);
      if (!result) return reply.status(404).send({ error: 'Entity not found' });
      return result;
    },
  );

  app.get<{ Params: { table: string } }>(
    '/api/v1/state/:table/schema',
    {
      preHandler: (await authPreHandler(['MANAGER', 'DBA'])) as never,
    },
    async (request, reply) => {
      const { table } = request.params;
      if (!isValidStateTable(table))
        return reply.status(400).send({ error: `Invalid table: ${table}` });
      return getStateSchema(table);
    },
  );

  // DELETE /api/v1/state/:table/:id — delete a row by entity_id_hash
  app.delete<{ Params: { table: string; id: string } }>(
    '/api/v1/state/:table/:id',
    {
      preHandler: (await authPreHandler(['MANAGER', 'DBA'])) as never,
    },
    async (request, reply) => {
      const { table, id } = request.params;
      if (!isValidStateTable(table))
        return reply.status(400).send({ error: `Invalid table: ${table}` });
      try {
        const result = await deleteStateRow(request.dbSession, table, id);
        if (!result.deleted) return reply.status(404).send({ error: 'Entity not found' });
        return result;
      } catch (err) {
        const e = err as Error;
        app.log.warn({ table, id, actor: request.actor, error: e.message }, 'state-delete failed');
        const integrity = mapIntegrityError(err);
        if (integrity) {
          return reply
            .status(integrity.status)
            .send({ error: integrity.error, code: integrity.code });
        }
        const isValidation = isStateValidationError(e);
        const code = isValidation ? 422 : 400;
        return reply
          .status(code)
          .send({
            error: e.message,
            code: isValidation ? 'STATE_VALIDATION_ERROR' : 'BAD_REQUEST',
          });
      }
    },
  );

  // POST /api/v1/state/:table — insert a new row (field-whitelisted)
  app.post<{ Params: { table: string }; Body: Record<string, string> }>(
    '/api/v1/state/:table',
    {
      preHandler: (await authPreHandler(['MANAGER', 'DBA'])) as never,
    },
    async (request, reply) => {
      const { table } = request.params;
      if (!isValidStateTable(table))
        return reply.status(400).send({ error: `Invalid table: ${table}` });
      try {
        const result = await insertStateRow(request.dbSession, table, request.body ?? {});
        return reply.status(201).send(result);
      } catch (err) {
        const e = err as Error;
        app.log.warn({ table, actor: request.actor, error: e.message }, 'state-insert failed');
        const integrity = mapIntegrityError(err);
        if (integrity) {
          return reply
            .status(integrity.status)
            .send({ error: integrity.error, code: integrity.code });
        }
        const isValidation = isStateValidationError(e);
        const code = isValidation ? 422 : 400;
        return reply
          .status(code)
          .send({
            error: e.message,
            code: isValidation ? 'STATE_VALIDATION_ERROR' : 'BAD_REQUEST',
          });
      }
    },
  );

  // ─── Audit ──────────────────────────────────────
  app.get<{ Querystring: { category?: string; actor?: string; limit?: string; offset?: string } }>(
    '/api/v1/audit',
    {
      preHandler: (await authPreHandler(['MANAGER', 'DBA', 'SECURITY_ADMIN'])) as never,
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
  const schemaIntrospector = new SchemaIntrospector(
    deps.pgPool as unknown as import('@tfsdc/infrastructure').IDbPool,
  );
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

  app.post<{ Body: { sql: string } }>(
    '/api/v1/schema/analyze',
    {
      preHandler: (await authPreHandler(['MANAGER', 'DBA'])) as never,
    },
    async (request, reply) => {
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
        return { plan: result.rows.map((r) => Object.values(r)[0]) };
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }
    },
  );

  // ─── Direct SQL Execution ────────────────────────
  app.post(
    '/api/v1/sql/execute',
    {
      preHandler: (await authPreHandler(['MANAGER', 'DBA'])) as never,
    },
    async (request, reply) => {
      const body = request.body as { sql?: string; readonly?: boolean };
      if (!body?.sql?.trim()) return reply.status(400).send({ error: 'sql is required' });
      const sql = body.sql.trim();
      if (hasMultipleStatements(sql)) {
        return reply.status(400).send({ error: 'multiple statements are not allowed' });
      }

      const SQL_TIMEOUT_MS = 30_000;
      const ROW_LIMIT = 5_000;

      function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Query timed out after ${ms / 1000}s`)), ms),
          ),
        ]);
      }

      try {
        if (READONLY_SQL.test(sql)) {
          const result = await withTimeout(deps.pgPool.query(sql), SQL_TIMEOUT_MS);
          const truncated = result.rows.length > ROW_LIMIT;
          const rows = truncated ? result.rows.slice(0, ROW_LIMIT) : result.rows;
          return {
            type: 'query',
            rows,
            rowCount: result.rowCount ?? result.rows.length,
            columns: rows.length > 0 ? Object.keys(rows[0]) : [],
            ...(truncated ? { warning: `Result truncated to ${ROW_LIMIT} rows` } : {}),
          };
        }

        if (DDL_SQL.test(sql)) {
          if (APP_ENV === 'prod') {
            return reply
              .status(403)
              .send({ error: 'Direct DDL is disabled in PROD. Use ChangeRequest workflow.' });
          }
          if (request.role !== 'DBA') {
            return reply
              .status(403)
              .send({ error: 'Only DBA can run DDL via direct SQL endpoint' });
          }
          const result = await withTimeout(deps.pgPool.query(sql), SQL_TIMEOUT_MS);
          return {
            type: 'ddl',
            message: `DDL executed successfully`,
            rowCount: result.rowCount ?? 0,
          };
        }

        if (DML_SQL.test(sql)) {
          if (APP_ENV === 'prod') {
            return reply
              .status(403)
              .send({ error: 'Direct DML is disabled in PROD. Use ChangeRequest workflow.' });
          }
          if (request.role !== 'DBA') {
            return reply
              .status(403)
              .send({ error: 'Only DBA can run DML via direct SQL endpoint' });
          }
          const result = await withTimeout(deps.pgPool.query(sql), SQL_TIMEOUT_MS);
          return {
            type: 'dml',
            message: `${result.rowCount ?? 0} row(s) affected`,
            rowCount: result.rowCount ?? 0,
          };
        }

        const result = await withTimeout(deps.pgPool.query(sql), SQL_TIMEOUT_MS);
        const truncated = (result.rows?.length ?? 0) > ROW_LIMIT;
        const rows = truncated ? result.rows.slice(0, ROW_LIMIT) : (result.rows ?? []);
        return {
          type: 'other',
          rows,
          rowCount: result.rowCount ?? 0,
          columns: rows.length > 0 ? Object.keys(rows[0]) : [],
          ...(truncated ? { warning: `Result truncated to ${ROW_LIMIT} rows` } : {}),
        };
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }
    },
  );

  // ─── Index Management ────────────────────────────
  // POST /api/v1/indexes  — create an index (RESTful)
  // POST /api/v1/indexes/create — legacy alias (kept for backward compat)
  async function handleCreateIndex(
    request: { body: unknown; role: UserRole },
    reply: { status: (n: number) => { send: (d: unknown) => unknown } },
  ) {
    const body = request.body as {
      table?: string;
      columns?: string[];
      name?: string;
      unique?: boolean;
    };
    if (!body?.table || !body?.columns?.length) {
      return reply.status(400).send({ error: 'table and columns are required' });
    }
    if (!isSafeIdentifier(body.table))
      return reply.status(400).send({ error: 'invalid table name' });
    if (!body.columns.every(isSafeIdentifier))
      return reply.status(400).send({ error: 'invalid column name' });
    const indexName = body.name ?? `idx_${body.table}_${body.columns.join('_')}`;
    if (!isSafeIdentifier(indexName))
      return reply.status(400).send({ error: 'invalid index name' });

    const uniqueStr = body.unique ? 'UNIQUE ' : '';
    const sql = `CREATE ${uniqueStr}INDEX CONCURRENTLY IF NOT EXISTS ${quoteIdent(indexName)} ON ${quoteIdent(body.table)} (${body.columns.map(quoteIdent).join(', ')})`;
    try {
      await deps.pgPool.query(sql);
      return reply.status(201).send({ success: true, sql, indexName });
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message, sql });
    }
  }

  const indexCreateOpts = { preHandler: (await authPreHandler(['DBA'])) as never };
  app.post('/api/v1/indexes', indexCreateOpts, handleCreateIndex as never);
  app.post('/api/v1/indexes/create', indexCreateOpts, handleCreateIndex as never);  // legacy

  // DELETE /api/v1/indexes/:name  — drop an index (RESTful)
  // POST   /api/v1/indexes/drop   — legacy alias (kept for backward compat)
  async function handleDropIndex(
    request: { params?: { name?: string }; body?: { name?: string } },
    reply: { status: (n: number) => { send: (d: unknown) => unknown } },
  ) {
    const name = (request.params as { name?: string })?.name ?? (request.body as { name?: string })?.name;
    if (!name) return reply.status(400).send({ error: 'index name is required' });
    if (!isSafeIdentifier(name)) return reply.status(400).send({ error: 'invalid index name' });
    const sql = `DROP INDEX CONCURRENTLY IF EXISTS ${quoteIdent(name)}`;
    try {
      await deps.pgPool.query(sql);
      return { success: true, sql };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message, sql });
    }
  }

  const indexDropOpts = { preHandler: (await authPreHandler(['DBA'])) as never };
  app.delete<{ Params: { name: string } }>('/api/v1/indexes/:name', indexDropOpts, handleDropIndex as never);
  app.post('/api/v1/indexes/drop', indexDropOpts, handleDropIndex as never);  // legacy

  // ─── Row Update ──────────────────────────────────
  // PATCH /api/v1/state/:table/:id  — update a field (RESTful)
  // POST  /api/v1/state/:table/update — legacy alias (kept for backward compat)
  // Uses updateStateField: table validated by whitelist, field by WRITABLE_FIELDS,
  // values via parameterized query — no SQL injection surface
  async function handleStateUpdate(
    request: {
      params: { table: string; id?: string };
      body: { id?: string; field: string; value: string };
      actor: string;
      dbSession: IDbSession;
      role: UserRole;
    },
    reply: { status: (n: number) => { send: (d: unknown) => unknown } },
  ) {
    const { table } = request.params;
    if (!isValidStateTable(table))
      return reply.status(400).send({ error: `Invalid table: ${table}` });
    const id = request.params.id ?? request.body?.id;
    const { field, value } = request.body ?? {};
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
      if (integrity) return reply.status(integrity.status).send({ error: integrity.error, code: integrity.code });
      const isValidation = isStateValidationError(e);
      return reply.status(isValidation ? 422 : 400).send({
        error: e.message,
        code: isValidation ? 'STATE_VALIDATION_ERROR' : 'BAD_REQUEST',
      });
    }
  }

  const stateUpdateOpts = { preHandler: (await authPreHandler(['MANAGER', 'DBA'])) as never };
  app.patch<{ Params: { table: string; id: string }; Body: { field: string; value: string } }>(
    '/api/v1/state/:table/:id',
    stateUpdateOpts,
    handleStateUpdate as never,
  );
  app.post<{ Params: { table: string }; Body: { id: string; field: string; value: string } }>(
    '/api/v1/state/:table/update',
    stateUpdateOpts,
    handleStateUpdate as never,  // legacy
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
      } catch {
        /* best-effort */
      }
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
        Connection: 'keep-alive',
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(decoder.decode(value, { stream: true }));
        }
      } catch {
        /* stream interrupted */
      }
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
        Connection: 'keep-alive',
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(decoder.decode(value, { stream: true }));
        }
      } catch {
        /* stream interrupted */
      }
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
  app.post(
    '/api/v1/connections/test',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
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
        const [tables, databases] = await Promise.all([
          adapter.listTables(),
          adapter.listDatabases?.().catch(() => undefined),
        ]);
        return { ok: true, tables, databases };
      } catch (err) {
        return reply.status(400).send({ ok: false, error: (err as Error).message });
      } finally {
        await adapter.close().catch(() => {});
      }
    },
  );

  // ─── POST /api/v1/connections/execute ───────────
  // Execute arbitrary SQL against a caller-supplied connection config.
  // Creates an ephemeral adapter per request (stateless).
  app.post(
    '/api/v1/connections/execute',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const body = request.body as {
        connection?: { type?: string; host?: string; port?: number; database?: string; username?: string; password?: string };
        sql?: string;
      };

      if (!body?.connection?.type) {
        return reply.status(400).send({ error: 'connection.type is required' });
      }
      if (!body?.sql?.trim()) {
        return reply.status(400).send({ error: 'sql is required' });
      }

      const sql = body.sql.trim();
      if (hasMultipleStatements(sql)) {
        return reply.status(400).send({ error: 'multiple statements are not allowed' });
      }

      let adapter;
      try {
        adapter = createAdapter({
          type: body.connection.type,
          host: body.connection.host,
          port: body.connection.port,
          database: body.connection.database,
          username: body.connection.username,
          password: body.connection.password,
        });
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }

      try {
        const start = Date.now();
        const rows = await adapter.queryRows(sql);
        const duration = Date.now() - start;
        const sliced = rows.slice(0, 5000);
        return {
          rows: sliced,
          columns: sliced.length > 0 ? Object.keys(sliced[0]!) : [],
          rowCount: rows.length,
          duration,
          type: READONLY_SQL.test(sql) ? 'query' : DDL_SQL.test(sql) ? 'ddl' : 'dml',
        };
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      } finally {
        await adapter.close().catch(() => {});
      }
    },
  );

  // ─── WebSocket ──────────────────────────────────
  app.register(async function wsRoutes(fastify) {
    fastify.get('/ws', { websocket: true }, (socket) => {
      socket.on('message', (data: Buffer) => {
        wsManager.handleMessage(
          {
            readyState: socket.readyState,
            send: (d: string) => socket.send(d),
            on: (event: string, listener: (...args: unknown[]) => void) =>
              socket.on(event, listener),
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
      Connection: 'keep-alive',
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
  });

  return app;
}
