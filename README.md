# TFSDC — Terminal-First Streaming Data Console

> **A terminal-native developer tool for real-time database state management.**
> Think of it as a pixel-game-style cockpit: you browse live tables, submit SQL changes, watch approvals flow, and recover failed events — all without leaving your terminal.

```
╔══════════════════════════════════════════════════════════════════╗
║  [EXPLORE]  monitor  audit  recovery  indexlab                   ║
╠══════════════════════════════════════════════════════════════════╣
║ ▶ state_orders (1,204 rows)                           / filter   ║
║──────────────────────────────────────────────────────────────────║
║ ▶  entity_id_hash        status      updated_at                  ║
║    a3f7c2...             DONE        2026-02-22 09:12            ║
║    b8e1d4...           ◎ EXECUTING   2026-02-22 09:13            ║
║    c9a2f1...             FAILED      2026-02-22 09:11            ║
║──────────────────────────────────────────────────────────────────║
║ [←][→] Table  [↑][↓][PgUp][PgDn] Rows  [/] Filter  [Esc] Clear ║
╚══════════════════════════════════════════════════════════════════╝
  ● LIVE  ◉ WS  [EXPLORE]                              09:13:42
```

---

## What Is This?

TFSDC is a **streaming data console** that sits on top of PostgreSQL + Kafka and gives you a developer-grade TUI to:

- **Explore** partitioned state tables in real time (orders, users, products, payments, shipments)
- **Submit SQL changes** that go through a full lifecycle: draft → approval → execution → audit
- **Monitor** Kafka stream throughput, DB latency, and connection pool health
- **Review** an immutable audit trail of every action taken
- **Recover** failed events from the Dead Letter Queue with one keypress
- **Analyse** index coverage and stream health stats

The web console (`apps/web`) exists as a companion for approval workflows and policy management — but the **terminal is the main stage**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      Developer                          │
│                       ┌─────┐                           │
│                       │ TUI │  ← primary interface      │
│                       └──┬──┘                           │
│                          │ WebSocket / REST              │
│               ┌──────────▼──────────┐                   │
│               │    Fastify API      │                   │
│               │  REST + WS + SSE    │                   │
│               └──────┬──────┬───────┘                   │
│                      │      │                           │
│             ┌────────▼─┐  ┌─▼──────────┐               │
│             │PostgreSQL│  │   Kafka     │               │
│             │    15    │  │  (events)   │               │
│             └────────┬─┘  └─┬──────────┘               │
│                      │      │                           │
│             ┌────────▼──────▼──────────┐               │
│             │       Projector          │               │
│             │  (Kafka → DB state)      │               │
│             └──────────────────────────┘               │
│             ┌──────────────────────────┐               │
│             │    Recovery Worker       │               │
│             │   (DLQ re-processor)     │               │
│             └──────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

### Monorepo Layout

```
apps/
  api/              Fastify REST + WebSocket + SSE server
  cli/              TUI entry point (main product)
  projector/        Kafka consumer → PostgreSQL state projector
  recovery-worker/  DLQ re-processor
  web/              Next.js web console (companion)

packages/
  kernel/           Shared types, Result<T,E>, error codes (neverthrow)
  domain/           Pure DDD aggregates — zero external deps
  application/      Use cases coordinating domain + infrastructure
  infrastructure/   PostgreSQL (pg) + Kafka (kafkajs) adapters
  policy/           ExecutionMode × RiskScore policy matrix
  audit/            Immutable audit event writing
  dsl/              SQL AST parser + WHERE-clause validator
  sql/              DDL migrations 001–006
  testing/          Jest fixtures, MockCanvas, mock factories
  ui-tui/           TUI: 30fps render loop, 5 scenes, WS client
  ui-web/           React components for the web console
```

### Package Dependency Direction (no cycles enforced)

```
kernel → domain → application → infrastructure
                              ↗
               policy, audit, dsl   (leaf packages)

apps/  →  any package above (composition root only)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.9 (ES2022, strict) |
| Runtime | Node.js ≥ 20 |
| Database | PostgreSQL 15 |
| Streaming | Apache Kafka |
| API | Fastify 5 |
| TUI | Custom 30fps render loop (no ncurses) |
| Web | Next.js 15 + Tailwind CSS |
| Build | Turborepo 2 + pnpm 10 |
| Testing | Jest + ts-jest + MockCanvas |
| Architecture | DDD + Ports & Adapters + Result monad |

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm 10.28.1 (`npm install -g pnpm@10.28.1`)
- Docker Desktop (for PostgreSQL + Kafka)

### 1. Clone and install

```bash
git clone <repo-url>
cd tfsdc
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Key variables (already set in `.env.example` for local dev):

```env
APP_ENV=dev
DATABASE_URL=postgres://postgres:postgres@localhost:15432/tfsdc
KAFKA_BROKER=localhost:19092
JWT_SECRET=dev-jwt-secret-change-in-prod
ENTITY_ID_PLAIN_ENABLED=true
```

### 3. Start infrastructure

```bash
pnpm docker:up       # starts PostgreSQL + Kafka + Kafka UI + Zookeeper
pnpm docker:wait     # blocks until Postgres and Kafka are healthy
pnpm db:migrate      # applies all 6 migration files
```

### 4. Start everything

```bash
pnpm dev:all         # API + Projector + Recovery Worker + TUI in one command
```

Or run services individually:

```bash
pnpm dev:api         # Fastify API (port 3100)
pnpm dev:projector   # Kafka consumer
pnpm dev:recovery    # DLQ re-processor
pnpm dev:cli         # TUI (main interface) ← start here
```

### Boot Flow

```
App start
  └─ Load ~/.config/beanCli/connections.json
      ├─ No saved connections → ConnectionScene (add first)
      └─ Connections exist   → ConnectionScene (list, Enter to connect)
                                   └─ Test connection → SplashScene → TableSelectScene → Main
```

### 5. Open the TUI

The TUI launches in your terminal automatically with `pnpm dev:cli`. The **Connection Manager** appears first — add a PostgreSQL connection or select a saved one, then press Enter to connect. Use these keys to navigate:

| Key | Action |
|---|---|
| `1` – `5` | Jump directly to scene |
| `Tab` | Cycle through scenes |
| `↑` / `↓` | Navigate rows |
| `PgUp` / `PgDn` | Page through rows |
| `←` / `→` | Switch tables (Explore scene) |
| `/` | Activate row filter |
| `Esc` | Clear filter / cancel |
| `Space` | Toggle LIVE / PAUSED stream mode |
| `:` | **Open SQL command line** (vim-style) |
| `r` | Reprocess DLQ event (Recovery scene) |
| `Ctrl+C` | Quit |

### SQL Command Line

Press `:` from any scene to open a vim-style command prompt at the bottom of the screen:

```
:UPDATE state_orders SET status = 'CONFIRMED' WHERE entity_id_hash = 'hash_ord_003'_
                                              [Enter] submit  [Esc] cancel
```

- Type any SQL statement and press **Enter** to submit as a `ChangeRequest`
- The risk level and execution mode are evaluated server-side
- Result is shown briefly at the bottom: `✓ Submitted  id=a3f7c2..  risk=L1  mode=AUTO`
- `:q` or `:quit` quits the TUI
- `Esc` cancels without submitting

The actor, role, and environment are read from environment variables (`CLI_ACTOR`, `CLI_ROLE`, `APP_ENV`).

---

## Scenes

### 1. Explore — Real-time State Browser

Browse the five partitioned state tables (`state_orders`, `state_users`, `state_products`, `state_payments`, `state_shipments`) with live WebSocket updates.

- Switch tables with `←` / `→`
- Filter rows with `/` (case-insensitive, matches any column)
- Status values are color-coded: `DONE` = green, `FAILED` = red, `PENDING` = yellow, `EXECUTING` = cyan with spinner (`◎`)
- Optimistic UI: changes appear instantly and are confirmed/rolled back via WebSocket events

### 2. Monitor — Stream Health

Real-time Kafka throughput per entity type, DB p95 latency, and connection pool utilization. Concurrency throttling activates automatically when:

- DB p95 latency ≥ 200ms
- Connection pool utilization ≥ 80%

### 3. Audit — Immutable Log

Complete audit trail of every action: SQL submissions, approvals, executions, reversions. Filter by category (`ALL` / `AUTH` / `CHANGE` / `APPROVAL` / `SYSTEM`) with `f`.

### 4. Recovery — DLQ Browser

Browse failed Kafka events in the Dead Letter Queue. Press `r` on a selected event to re-publish it to the original Kafka topic. Events that fail 3+ times are marked `MAX_RETRIES_EXCEEDED`.

### 5. IndexLab — Index Advisor

Stream health statistics and index coverage analysis per table. Filter and page through stats with the standard navigation keys.

---

## How Changes Work

Every database modification goes through a controlled lifecycle:

```
User submits SQL
      ↓
SQL AST Parser (WHERE enforcement — no unbounded UPDATE/DELETE)
      ↓
Risk Scorer → L0 / L1 / L2
      ↓
Policy Evaluator → ExecutionMode (AUTO / CONFIRM / MANUAL)
      ↓
  Needs approval?
  YES → PENDING_APPROVAL → Approver notified
  NO  → APPROVED (automatic)
      ↓
ExecutionMode:
  AUTO    → immediate execution
  CONFIRM → user must confirm once
  MANUAL  → DBA executes manually
      ↓
Backup snapshot (mandatory for L2, optional for L0/L1)
      ↓
SQL execution + affected row count recorded
      ↓
AuditWriter → audit_events (immutable)
      ↓
ChangeApplied event → Kafka → TUI + Web sync
```

### Risk Levels

| Level | Trigger |
|---|---|
| L0 | Simple reads / low-impact changes |
| L1 | Standard data modifications |
| L2 | Schema changes or ≥ 1,000 rows affected |

### Execution Policy Matrix

| Environment | L0 | L1 | L2 |
|---|---|---|---|
| LOCAL | AUTO | AUTO | AUTO |
| DEV | AUTO | AUTO | CONFIRM |
| PROD | CONFIRM | CONFIRM | MANUAL |

---

## Connection Manager

beanCLI uses a **local connection store** instead of embedding credentials in the target database. This means:

- Works with PostgreSQL, MySQL, SQLite, MongoDB, Redis — any DB type
- Credentials live in `~/.config/beanCli/connections.json` (chmod 600 — local only)
- No `cli_users` table polluting your target database

### TUI: ConnectionScene

On every startup, the TUI shows the Connection Manager:

```
╔══════════════════════════════════════════════════════════════╗
║        [ beanCLI — DATABASE CONNECTIONS ]                    ║
╠══════════════════════════════════════════════════════════════╣
║  > * local-pg        postgresql   localhost:5432             ║
║      prod-mysql       mysql        db.prod.com:3306          ║
║      analytics-mongo  mongodb      analytics:27017           ║
╠──────────────────────────────────────────────────────────────╣
║  n: new   d: delete   *: default   Enter: connect            ║
╚══════════════════════════════════════════════════════════════╝
```

| Key | Action |
|---|---|
| `↑` / `↓` | Navigate connections |
| `n` | Add new connection |
| `e` | Edit selected |
| `d` | Delete selected |
| `*` | Set as default |
| `Enter` | Connect (tests + proceeds to main app) |

### Supported DB Types

| Type | Default Port | Notes |
|---|---|---|
| `postgresql` | 5432 | Full feature support |
| `mysql` | 3306 | MariaDB compatible |
| `sqlite` | — | Uses Node.js built-in `node:sqlite` |
| `mongodb` | 27017 | Collections as tables |
| `redis` | 6379 | Key prefixes as tables |

### DB Adapter Architecture (SOLID)

New DB types can be added without modifying existing code (Open/Closed Principle):

1. Create `packages/infrastructure/src/db/adapters/MyAdapter.ts` implementing `IDbAdapter`
2. Add one line to `registerAllAdapters.ts`

That's it — no other files change.

---

## API Reference

Base URL: `http://localhost:3100`

### Changes

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/changes` | Submit a new SQL change |
| `GET` | `/api/v1/changes` | List changes (filter by `?status=`) |
| `POST` | `/api/v1/changes/:id/submit` | Submit draft for approval |
| `POST` | `/api/v1/changes/:id/execute` | Execute an approved change |
| `POST` | `/api/v1/changes/:id/revert` | Revert a failed change |

### Approvals

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/approvals/pending` | List pending approvals |
| `POST` | `/api/v1/approvals/:id/approve` | Approve a change |
| `POST` | `/api/v1/approvals/:id/reject` | Reject a change |

### State & Monitoring

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/state/:table` | Read projected state table |
| `GET` | `/api/v1/audit` | Query audit log |
| `GET` | `/api/v1/health` | Health check |
| `GET` | `/api/v1/monitoring/metrics` | DB latency, pool utilization |
| `GET` | `/api/v1/monitoring/stream-stats` | Kafka stream throughput |
| `WS` | `/ws` | WebSocket event stream |
| `POST` | `/api/v1/connections/test` | Test a DB connection (no auth required) |

### Submit a change (example)

```bash
curl -X POST http://localhost:3100/api/v1/changes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "sql": "UPDATE state_orders SET status = '\''CONFIRMED'\'' WHERE id = '\''ord-001'\''",
    "environment": "DEV",
    "actor": "alice",
    "role": "DBA"
  }'
```

---

## Security

### HMAC Entity ID Anonymisation

Raw entity IDs (user IDs, order IDs, etc.) are never stored directly. Instead, `HMAC-SHA256(secret_key, "entityType:rawId")` is computed and stored as `entity_id_hash`. The `ENTITY_ID_PLAIN_ENABLED` env var controls whether the plain ID is also retained (default `false` in PROD).

### DLQ Encryption

Failed event payloads in the Dead Letter Queue are stored as AES-256 encrypted `BYTEA`. Decryption requires the `hmac_keys` table entry that was active at ingest time.

### HMAC Key Rotation

Keys in `hmac_keys` follow a lifecycle: `ACTIVE → PREVIOUS → RETIRED`. Rotation is performed by a `SECURITY_ADMIN` role user. Old hashes computed with rotated keys remain queryable via `key_id` references.

### JWT / API Key Authentication

- JWT Bearer tokens: 1-hour expiry, refresh-token renewal
- API Keys: issued and revoked by `SECURITY_ADMIN`
- All endpoints require a valid token in non-dev environments
- Rate limit: 100 req/s per connection in Remote/Team sidecar mode

### Immutable Audit Log

Every action — submission, approval, execution, reversion, login — is appended to `audit_events`. This table is write-only from the application layer; no updates or deletes are issued.

---

## Infrastructure

### Docker Services

| Service | Local Port | Description |
|---|---|---|
| PostgreSQL 15 | 15432 | Primary database |
| Kafka | 19092 | Event streaming |
| Kafka UI | 18080 | Kafka browser (dev only) |
| Zookeeper | 12181 | Kafka coordination |

### Database Migrations

Migrations live in `packages/sql/migrations/` and are applied in order:

| File | Contents |
|---|---|
| `001` | Extensions (`pgcrypto`), enums (`ChangeStatus`, `RiskLevel`, `ExecutionMode`) |
| `002` | Core tables: `events_raw`, `change_requests`, `audit_events`, `backup_snapshots`, `dlq_events`, `hmac_keys` |
| `003` | Partitioned state tables: users, products, orders, payments, shipments |
| `004` | Policy enforcement functions, maintenance views |
| `005` | Seed data |
| `006` | Sidecar API key management |

---

## Development

### All Commands

```bash
# Setup
pnpm install
pnpm docker:up && pnpm docker:wait && pnpm db:migrate

# Dev (pick one)
pnpm dev:all          # everything at once
pnpm dev:api          # API only
pnpm dev:cli          # TUI only
pnpm dev:projector    # Kafka projector only
pnpm dev:recovery     # DLQ worker only

# Build
pnpm build            # Turborepo parallel build (all 15 packages)

# Test
pnpm test             # Jest (all packages, 72 tests)
pnpm test:watch       # Jest watch mode

# Run a single test file
pnpm --filter @tfsdc/ui-tui test -- --testPathPattern="Table"

# Lint / Format
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check

# Database
pnpm db:migrate       # apply migrations
pnpm docker:reset     # wipe volumes + restart (fresh slate)
```

### TUI Component Testing

TUI components are tested without a real terminal using `MockCanvas` — an in-memory `ITerminalCanvas` that records every `write()` call:

```typescript
import { Table } from '@tfsdc/ui-tui';
import { MockCanvas } from '@tfsdc/testing';

const canvas = new MockCanvas(80, 24);
const table = new Table();

canvas.beginFrame();
table.render(canvas, { x: 0, y: 0, width: 80, height: 20 }, COLS, ROWS);

expect(canvas.hasText('DONE')).toBe(true);
expect(canvas.styleAt(canvas.findText('DONE')!.x, canvas.findText('DONE')!.y)?.color).toBe('green');
```

### Key Architectural Patterns

**Result<T, E> monad** — all operations return `Result<T, E>` from `neverthrow`. No `try/catch` in application or domain layers. Chain with `.map()`, `.andThen()`, `.mapErr()`.

**Ports & Adapters** — `application/` defines interfaces (`IChangeRequestRepository`, `IKafkaConsumer`); `infrastructure/` provides implementations. Apps wire them together at the composition root.

**Layered TUI** — each scene is a thin composer of focused single-responsibility components (`SectionHeader`, `TabBar`, `Table`, `FilterBar`, `HintBar`, `BoxBorder`). No scene file handles rendering inline.

**Optimistic UI** — changes appear in the TUI instantly. The `OptimisticPatchManager` waits for a `ChangeApplied` WebSocket event to confirm or roll back each patch.

**Idempotent Kafka processing** — Kafka offset is committed only after the DB transaction completes (at-least-once delivery). Events are deduplicated by `UNIQUE(source_topic, partition, offset)`.

---

## Project Status

| Phase | Feature | Status |
|---|---|---|
| 1 | Infrastructure: `PgChangeRequestRepository` | Done |
| 2 | Application: `ChangeRouteHandlerImpl` | Done |
| 3 | API server wiring | Done |
| 4 | TUI WebSocket + data loading | Done |
| 5 | Recovery Worker Kafka re-publish | Done |
| 6 | Audit, Testing, Policy packages | Done |
| 7 | P95 latency measurement | Done |
| 8 | Web console (Next.js) | Done |
| S1 | TUI: scroll fix, PgUp/PgDn, StatusBar, `r` key | Done |
| S2 | TUI: filter, status color coding | Done |
| S3 | TUI: Box Drawing, spinner badges, layered components | Done |
| S4 | TUI: help popup, row detail, command palette | Planned |
| S5 | AI: natural language → SQL, index advisor | Planned |
| S6 | ExploreScene: smart value formatting (_ms → datetime, _cents → $) | Done |
| S7 | Multi-DB Connection Manager (TUI + API adapter registry) | Done |
| S8 | Web Console: Connection Manager page | Done |

---

## Roles

| Role | Capabilities |
|---|---|
| `ANALYST` | Read-only access — browse state tables, view audit log |
| `MANAGER` | Submit changes, delegate within team scope |
| `DBA` | Full access — approve, execute, set policy, MANUAL execution |
| `SECURITY_ADMIN` | DLQ access, HMAC key rotation, API key management |

---

## Web Console

The companion web console runs on Next.js and is accessible at `http://localhost:3000` (after `pnpm --filter @tfsdc/web dev`).

For local development, generate a dev JWT at `/auth`:

1. Enter your `sub` (username) and `role` (`ANALYST` / `MANAGER` / `DBA` / `SECURITY_ADMIN`)
2. The token is generated client-side (HS256) and stored in `localStorage`
3. All API calls use this token for authentication

Pages: Dashboard · Changes · Approvals · State viewer · Audit log · Recovery (DLQ)

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `dev` | `local` / `dev` / `prod` |
| `APP_PORT` | `3100` | API server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `KAFKA_BROKER` | `localhost:19092` | Kafka bootstrap server |
| `KAFKA_GROUP_ID` | `tfsdc-projector` | Consumer group ID |
| `JWT_SECRET` | — | HS256 signing key (change in prod) |
| `JWT_EXPIRY_SECONDS` | `3600` | Token lifetime |
| `ENTITY_ID_PLAIN_ENABLED` | `true` (dev) | Store plain entity IDs alongside hash |
| `SIDECAR_MODE` | `MANAGED` | `DAEMON` / `MANAGED` / `REMOTE` |
| `SIDECAR_RATE_LIMIT_RPS` | `100` | Request rate limit per connection |
| `API_URL` | `http://localhost:3100` | Used by TUI CLI |
| `WS_URL` | `ws://localhost:3100/ws` | WebSocket endpoint for TUI |
| `API_TOKEN` | — | Bearer token for authenticated TUI API calls |
