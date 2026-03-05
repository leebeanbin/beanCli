# BeanCLI REST API v1

Base URL: `http://localhost:3100`
All `/api/v1/*` endpoints return `Content-Type: application/json`.

---

## Authentication

Most endpoints require a Bearer JWT token in the `Authorization` header.

```
Authorization: Bearer <token>
```

### Roles
| Role | Description |
|------|-------------|
| `DBA` | Full access — DDL, DML, indexes, changes, approvals |
| `MANAGER` | Changes + approvals + state read/write |
| `ANALYST` | State read-only |
| `SECURITY_ADMIN` | Audit log access |

### `POST /api/v1/auth/login`

Authenticate and receive a JWT token (expires 24 hours).

Rate limit: 5 req/min per IP.

```json
{ "username": "string", "password": "string" }
```
**Response 200**
```json
{ "token": "string", "username": "string", "role": "DBA" }
```
**Response 401** `{ "error": "Invalid credentials" }`

### `GET /api/v1/auth/setup-status`

Check whether the system has been initialised (at least one user exists). No auth required.

**Response 200**
```json
{ "setupComplete": true }
```

### `POST /api/v1/auth/setup`

First-run only: create the initial DBA account when no users exist yet. Blocked once any user exists.

Rate limit: 3 req / 5 minutes per IP.

```json
{ "username": "admin", "password": "secret123" }
```
**Response 201** `{ "username": "admin", "role": "DBA", "active": true }`
**Response 403** `{ "error": "Setup already complete" }`

---

## Health

### `GET /api/v1/health` (also available at `/health`)

No auth required.

**Response 200**
```json
{
  "status": "ok",
  "db": "ok",
  "kafka": "ok",
  "uptime": 42.3
}
```

---

## State (Projected Read Models)

State tables: `state_users`, `state_orders`, `state_products`, `state_payments`, `state_shipments`

### `GET /api/v1/state/:table`

List rows with optional pagination. No auth required (public read model).

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `limit` | integer | 100 | Max rows to return |
| `offset` | integer | 0 | Rows to skip |

**Response 200**
```json
{ "rows": [...], "total": 42 }
```

### `GET /api/v1/state/:table/:id`

Get a single row by `entity_id_hash`. No auth required.

**Response 200** — row object
**Response 404** `{ "error": "Entity not found" }`

### `GET /api/v1/state/:table/schema`

Get writable fields for the table. Requires `MANAGER` or `DBA`.

**Response 200**
```json
{ "table": "state_users", "writableFields": ["email", "status", "name"] }
```

### `POST /api/v1/state/:table`

Insert a new row. Requires `MANAGER` or `DBA`.

```json
{ "name": "Alice", "email": "alice@example.com", "status": "active" }
```
**Response 201** — created row
**Response 409** — unique constraint violation
**Response 422** — validation error

### `PATCH /api/v1/state/:table/:id`

Update a single field on a row. Requires `MANAGER` or `DBA`.

```json
{ "field": "status", "value": "inactive" }
```
**Response 200** `{ "success": true }`
**Response 404** — row not found
**Response 422** — validation error

### `DELETE /api/v1/state/:table/:id`

Delete a row by `entity_id_hash`. Requires `MANAGER` or `DBA`.

**Response 200** `{ "deleted": true }`
**Response 404** — row not found

---

## Change Requests

Change Requests model all SQL mutations with an approval workflow.

State machine: `DRAFT → PENDING → APPROVED → EXECUTING → DONE | FAILED`

### `GET /api/v1/changes`

List change requests. No auth required (read-only).

| Query Param | Type | Description |
|-------------|------|-------------|
| `status` | string | Filter by status (`DRAFT`, `PENDING`, `APPROVED`, `DONE`, `FAILED`) |
| `limit` | integer | Max results (default 50) |
| `offset` | integer | Pagination offset |

### `POST /api/v1/changes`

Create a new change request in DRAFT status. Requires `MANAGER` or `DBA`.

```json
{
  "sql": "UPDATE state_users SET status = 'inactive' WHERE id = '123'",
  "description": "Deactivate stale account",
  "environment": "DEV"
}
```
**Response 201**
```json
{ "id": "cr-abc123", "status": "DRAFT" }
```

### `GET /api/v1/changes/:id`

Get a single change request by ID.

### `POST /api/v1/changes/:id/submit`

Submit for approval (DRAFT → PENDING). Requires `MANAGER` or `DBA`.

**Response 200** `{ "status": "PENDING" }`

### `POST /api/v1/changes/:id/execute`

Execute an approved change (APPROVED → EXECUTING → DONE). Requires `MANAGER` or `DBA`.

**Response 200** `{ "status": "DONE", "affectedRows": 1 }`

### `POST /api/v1/changes/:id/revert`

Revert a failed change (FAILED → REVERTED). Requires `DBA` only.

**Response 200** `{ "status": "REVERTED" }`

---

## Approvals

### `GET /api/v1/approvals/pending`

List all changes awaiting approval. Requires `MANAGER` or `DBA`.

**Response 200** `{ "items": [...] }`

### `POST /api/v1/approvals/:changeId/approve`

Approve a pending change (PENDING → APPROVED). Requires `MANAGER` or `DBA`.

**Response 200** `{ "status": "APPROVED" }`

### `POST /api/v1/approvals/:changeId/reject`

Reject a pending change (PENDING → REJECTED). Requires `MANAGER` or `DBA`.

**Response 200** `{ "status": "REJECTED" }`

---

## Schema Introspection

### `GET /api/v1/schema/tables`

List all tables with column info. No auth required.

**Response 200** `{ "items": [{ "table": "state_users", "columns": [...] }] }`

### `GET /api/v1/schema/indexes`

List all indexes with usage stats. No auth required.

**Response 200** `{ "indexes": [...], "usage": [...] }`

### `POST /api/v1/schema/analyze`

Run `EXPLAIN ANALYZE` on a read-only query. Requires `MANAGER` or `DBA`.

```json
{ "sql": "SELECT * FROM state_users WHERE status = 'active'" }
```
**Response 200** `{ "plan": ["Seq Scan on state_users  (cost=0.00..1.05 rows=5 ...)"] }`

---

## Index Management

### `POST /api/v1/indexes`

Create an index. Requires `DBA`.

```json
{
  "table": "state_users",
  "columns": ["email"],
  "name": "idx_users_email",
  "unique": true
}
```
**Response 201** `{ "success": true, "sql": "CREATE UNIQUE INDEX ...", "indexName": "idx_users_email" }`

### `DELETE /api/v1/indexes/:name`

Drop an index by name. Requires `DBA`.

**Response 200** `{ "success": true, "sql": "DROP INDEX CONCURRENTLY ..." }`

---

## User Management

Requires `DBA` role for all endpoints.

### `GET /api/v1/users`

List all users.

**Response 200** `{ "items": [{ "username": "alice", "role": "DBA", "active": true, "created_at": "..." }] }`

### `POST /api/v1/users`

Create a new user.

```json
{ "username": "alice", "password": "secret123", "role": "ANALYST" }
```
**Response 201** `{ "username": "alice", "role": "ANALYST", "active": true }`
**Response 409** `{ "error": "Username 'alice' already exists" }`

### `PATCH /api/v1/users/:username`

Update role, active status, or rename a user.

```json
{ "role": "MANAGER" }
{ "active": false }
{ "newUsername": "alice2" }
```

- `role` / `active` — cannot be changed on your own account.
- `newUsername` — rename is allowed on any account including your own (3–64 chars). If you rename yourself, the response includes `"selfRenamed": true` and the client must log out.
- **Response 409** `{ "error": "Username already exists" }` if `newUsername` collides.

### `DELETE /api/v1/users/:username`

Soft-delete (deactivate) a user. Cannot deactivate the last active DBA or your own account.

**Response 200** `{ "success": true, "username": "alice", "active": false }`

### `POST /api/v1/auth/change-password`

Change the caller's own password. Requires any authenticated role.

**Rate limit**: 5 requests per hour (per IP), stricter than the global 60/min.

```json
{ "currentPassword": "old", "newPassword": "newSecure123" }
```
**Response 200** `{ "success": true }`
**Response 401** `{ "error": "Current password is incorrect" }`

---

## SQL Execution

### `POST /api/v1/sql/execute`

Execute arbitrary SQL against the server's default PostgreSQL pool.
Requires `MANAGER` or `DBA`. DDL/DML blocked in `APP_ENV=prod`.

```json
{ "sql": "SELECT * FROM state_users LIMIT 5" }
```
**Response 200**
```json
{
  "type": "query",
  "rows": [...],
  "rowCount": 5,
  "columns": ["id", "name", "email", "status"]
}
```

- **Timeout**: 30 seconds. Exceeded queries return `400` with `"Query timed out after 30s"`.
- **Row limit**: SELECT results are capped at 5,000 rows. When truncated, the response includes `"warning": "Result truncated to 5000 rows"`.

`type` values: `"query"` | `"ddl"` | `"dml"` | `"other"`

---

## Connections (External DB)

These endpoints proxy SQL execution to a caller-supplied database connection.
No auth required — intended for local CLI use.

> Rate limited: `POST /test` 10 req/min, `POST /execute` 120 req/min.

### `POST /api/v1/connections/test`

Test a connection and return table list.

```json
{
  "type": "postgresql",
  "host": "localhost",
  "port": 5432,
  "database": "mydb",
  "username": "postgres",
  "password": "secret"
}
```
**Response 200** `{ "ok": true, "tables": ["users", "orders"] }`
**Response 400** `{ "ok": false, "error": "connection refused" }`

Supported types: `postgresql`, `mysql`, `sqlite`, `mongodb`, `redis`, `kafka`, `rabbitmq`, `elasticsearch`, `nats`

### `POST /api/v1/connections/execute`

Execute SQL against a caller-supplied connection (ephemeral adapter, stateless).

```json
{
  "connection": { "type": "postgresql", "host": "...", "port": 5432, "database": "mydb", "username": "postgres", "password": "secret" },
  "sql": "SELECT * FROM users LIMIT 10"
}
```
**Response 200**
```json
{ "rows": [...], "columns": ["id", "name"], "rowCount": 10, "duration": 12 }
```

---

## Monitoring

### `GET /api/v1/monitoring/stream-stats`

Kafka stream processing statistics. No auth required.

**Response 200**
```json
{
  "items": [
    { "entity_type": "orders", "total_events": 1024, "events_last_5min": 7, "recovered_count": 0 }
  ]
}
```

---

## Audit Log

### `GET /api/v1/audit`

Query audit events. Requires `MANAGER`, `DBA`, or `SECURITY_ADMIN`.

| Query Param | Type | Description |
|-------------|------|-------------|
| `category` | string | Filter by category |
| `actor` | string | Filter by actor (username) |
| `limit` | integer | Max results |
| `offset` | integer | Pagination offset |

**Response 200** `{ "items": [...] }`

---

## AI Assistant

### `POST /api/v1/ai/chat`

Single-turn chat. Proxied to beanllm AI sidecar (port 3200).

```json
{ "messages": [{ "role": "user", "content": "Write a query to get top 5 users" }] }
```

### `POST /api/v1/ai/stream`

Server-Sent Events streaming chat.
Response: `Content-Type: text/event-stream`

### `POST /api/v1/ai/agentic`

Agentic mode streaming (multi-step reasoning).
Response: `Content-Type: text/event-stream`

### `GET /api/v1/ai/models`

List available AI models from the sidecar.

### `GET /api/v1/ai/health`

Check AI sidecar availability.

---

## Error Response Format

All error responses follow the shape:

```json
{ "error": "Human-readable message", "code": "MACHINE_READABLE_CODE" }
```

Common `code` values:
| Code | HTTP | Meaning |
|------|------|---------|
| `STATE_VALIDATION_ERROR` | 422 | Business rule violation |
| `STATE_FK_VIOLATION` | 422 | Foreign key constraint |
| `STATE_CHECK_VIOLATION` | 422 | Check constraint |
| `STATE_UNIQUE_VIOLATION` | 409 | Unique constraint |
| `BAD_REQUEST` | 400 | Invalid input |

---

## Deprecated Routes (kept for backward compatibility)

| Deprecated | Use instead |
|------------|-------------|
| `POST /api/v1/indexes/create` | `POST /api/v1/indexes` |
| `POST /api/v1/indexes/drop` | `DELETE /api/v1/indexes/:name` |
| `POST /api/v1/state/:table/update` | `PATCH /api/v1/state/:table/:id` |
| `GET /health` | `GET /api/v1/health` |
