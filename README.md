<div align="center">

```
╔══════════════════════════════════════════════════════════════════╗
║  ◈ BeanCLI  —  Terminal-First Database Console                  ║
╚══════════════════════════════════════════════════════════════════╝
```

[![Node](https://img.shields.io/badge/Node-%3E%3D20.0-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-10.28.1-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io)
[![Turbo](https://img.shields.io/badge/Turbo-2.8-EF4444?style=flat-square&logo=turborepo&logoColor=white)](https://turbo.build)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/leebeanbin/beanCli?style=flat-square&color=brightgreen)](https://github.com/leebeanbin/beanCli/commits/master)

**One console for every database. Terminal & Web.**

[한국어 →](README.ko.md)

</div>

---

## What is BeanCLI?

BeanCLI is a **developer-first database management platform** with two interfaces:

- **TUI** — A full-featured terminal UI (Ink/React) with 3-panel layout, multi-line SQL editor, AI assistant, and psql-style meta-commands.
- **Web Console** — A retro Game Boy–styled Next.js dashboard with the same feature set, accessible from any browser.

Both interfaces support **9 database types**, role-based access control, immutable audit logging, and an integrated AI assistant.

---

## Preview

<div align="center">
  <img src="docs/perform_beancli.gif" alt="BeanCLI TUI demo" width="720" />
</div>

```
╔══ BeanCLI v0.1.2 ════════════════════════════════════════════════╗
║ Schema [1]      ║  Query Editor [2]                              ║
║─────────────────║──────────────────────────────────────────────  ║
║ > state_users   ║  1 │ SELECT u.entity_id_hash,                  ║
║   state_orders  ║  2 │        o.status, o.total_cents            ║
║   state_prod..  ║  3 │   FROM state_users u                      ║
║   payments      ║  4 │   JOIN state_orders o USING (user_id)     ║
║   shipments     ║  5 │  WHERE o.status = 'EXECUTING'             ║
║   audit_events  ║  6 │  LIMIT 50;               Enter: execute   ║
║   dlq_events    ╠════════════════════════════════════════════════╣
║                 ║  Results [3]          6 rows · 12ms            ║
║                 ║  entity_id_hash    status       total_cents     ║
║                 ║  > a3f7c2...       EXECUTING    $1,249.00       ║
║                 ║    b8e1d4...        DONE         $89.99         ║
╠═════════════════╬════════════════════════════════════════════════╣
║ ◈ AI [4]        ║  PG  leebeanbin › state_orders   DBA   dev     ║
╚═════════════════╩════════════════════════════════════════════════╝
```

---

## Features

| | |
|---|---|
| **9 Database Types** | PostgreSQL · MySQL · SQLite · MongoDB · Redis · Kafka · RabbitMQ · Elasticsearch · NATS |
| **TUI (Terminal UI)** | 3-panel Ink layout — Schema tree / SQL editor / Results viewer |
| **Web Console** | Game Boy–styled Next.js app — 14 pages, dark/light theme, EN/KO toggle |
| **Multi-line SQL Editor** | Line numbers, cursor movement, history, psql meta-commands (`\dt`, `\d`, `\x`) |
| **Role-Based CRUD** | Row browse · edit · insert · delete (DBA / MANAGER / ANALYST) |
| **Change Review** | SQL → AST parse → risk score → AUTO / CONFIRM / MANUAL workflow |
| **AI Assistant** | Floating `◈ AI` widget on every page + full `/ai` chat page |
| **Audit Log** | Immutable `audit_events` table — every change recorded |
| **Auth System** | JWT login (24h), bcrypt passwords, RBAC guards, admin user management |
| **Mock Mode** | Full demo with no DB or API — ideal for development & demos |
| **Connection Manager** | GUI form for registering, testing, and saving DB connections |
| **Plugin API** | Load custom DB adapters at runtime via `--plugin ./adapter.js` |
| **EN/KO Language Toggle** | UI language switch (English / Korean) persisted in browser |
| **Security** | AES-256-GCM encrypted credentials, rate limiting, logger redact |

---

## Quick Start

### Requirements

```
Node.js ≥ 20   ·   pnpm 10.28.1   ·   Docker (for infrastructure; not needed in Mock mode)
```

### Install & Run

```bash
# 1. First-time setup (install + global link + start Docker services)
pnpm setup

# 2a. Mock mode — no DB or API needed (recommended for first run)
beancli --mock

# 2b. Real mode — requires Docker infrastructure
beancli

# 2c. Web console only
pnpm dev:web          # → http://localhost:3000

# Full stack (API + Projector + Recovery Worker + TUI)
pnpm dev:all
```

### Docker (Production)

```bash
# Build all images and start everything in one command
make up

# Infra only (Postgres + Kafka, without app containers)
make infra

# Tail logs
make logs

# Stop all containers
make down
```

| Service | URL |
|---------|-----|
| Web Console | http://localhost:3000 |
| API Server | http://localhost:3100 |
| Kafka UI | http://localhost:8080 |
| PostgreSQL | localhost:5432 |


> **First time?** After `pnpm setup`, open a new terminal and `beancli` is ready.
> **Already installed?** Run `pnpm link:global` once.

---

## Supported Databases

| Type | Default Port | Notes |
|---|---|---|
| `postgresql` | 5432 | Full support. Pool max=2 |
| `mysql` | 3306 | MariaDB compatible. Backtick quoting |
| `sqlite` | — | Uses Node.js built-in `node:sqlite` |
| `mongodb` | 27017 | Collections treated as tables |
| `redis` | 6379 | Key prefix = table. HASH · LIST · SET · ZSET |
| `kafka` | 9092 | Topic listing + ephemeral consumer message fetch |
| `rabbitmq` | 5672 | Management API + AMQP channel queue browse |
| `elasticsearch` | 9200 | Index listing + native JSON query |
| `nats` | 4222 | JetStream streams + pull consumer |

---

## Web Console Pages

| Page | Path | Description |
|---|---|---|
| Dashboard | `/` | API health · saved DB connections overview |
| Query | `/query` | SQL editor with CSV/JSON download |
| Explore | `/explore` | Data browser — row CRUD, inline edit, create table modal |
| Schema | `/schema` | Table structure viewer + EXPLAIN ANALYZE tree view |
| Monitor | `/monitor` | Stream stats, SSE live updates |
| Indexes | `/indexes` | Index listing, create, drop |
| Audit | `/audit` | Immutable audit log with category filter |
| Recovery | `/recovery` | DLQ failed-change re-submission |
| AI | `/ai` | Full-page AI chat — accessible via `◈ AI` floating button |
| Changes | `/changes` | Change request list and submission |
| Approvals | `/approvals` | Pending approval queue |
| Auth | `/auth` | Login form with dev account hints (JWT 24h) |
| Connections | `/connections` | API server URL config, test connection |
| Admin — Users | `/admin/users` | User management: create, rename, deactivate (DBA only) |

---

## Architecture

```
apps/
  cli/              ← TUI entry point (index-ink.tsx)
  api/              ← Fastify REST + WebSocket (port 3100)
  web/              ← Next.js 15 web console (port 3000)
  projector/        ← Kafka → PostgreSQL state projector
  recovery-worker/  ← DLQ re-processor

packages/
  tui/              ← Ink-based TUI (active development)
  kernel/           ← Shared types, Result<T,E>, ErrorCode
  domain/           ← DDD aggregates (ChangeRequest state machine)
  application/      ← Use cases, port interfaces
  infrastructure/   ← DB adapters (9 types), OCP registry pattern
  policy/           ← ExecutionMode × RiskScore policy matrix
  audit/            ← Immutable audit event writer
  dsl/              ← SQL AST parser + WHERE enforcement
  sql/              ← DDL migrations 001–006
  ui-web/           ← Shared React components for web console
```

### Dependency Direction

```
kernel → domain → application → infrastructure
                              ↗
               policy · audit · dsl (leaf packages)
```

Apps sit at the top and depend on packages. No cycles.

---

## Startup Flow (TUI)

```
Launch
  └─ ConnectionPicker (saved connections list or add new)
       └─ Connected
            └─ DatabasePicker (select database on server)
                 └─ TablePicker (select table)
                      └─ Main 3-panel UI
```

---

## Keyboard Shortcuts

### Global

| Key | Action |
|---|---|
| `Ctrl+P` | Command palette |
| `?` | Full shortcuts help overlay |
| `Tab` / `Shift+Tab` | Move between panels |
| `q` | Quit |

### Panel Focus

| Key | Panel |
|---|---|
| `1` | Schema (table list) |
| `2` | Query Editor |
| `3` | Results |
| `4` | AI Assistant |

### Mode Switching

| Key | Mode |
|---|---|
| `t` | Table Picker |
| `b` | Browse (row navigation) |
| `m` | Monitor (stream stats) |
| `A` | Audit log |
| `R` | DLQ Recovery |
| `I` | Index Lab |
| `C` | Change Requests |
| `P` | Approvals |

### SQL Editor

| Key | Action |
|---|---|
| `Enter` | Execute SQL |
| `Shift+Enter` | New line |
| `↑` / `↓` (empty buffer) | History |
| `Ctrl+A` / `Ctrl+E` | Line start / end |
| `\dt` | List tables |
| `\d <table>` | Describe table |
| `\x` | Toggle expanded mode |

### Browse / Explore Mode

| Key | Action |
|---|---|
| `j` / `k` | Move rows |
| `h` / `l` | Move columns |
| `Enter` | Row detail |
| `e` | Edit row (DBA/MANAGER) |
| `i` | Insert row (DBA/MANAGER) |
| `D` | Delete row (DBA) |
| `Q` | SELECT current table → Query Editor |
| `r` | Refresh |
| `f` | Filter |

---

## Change Review Workflow

```
SQL submitted
  └─ AST parser (blocks UPDATE/DELETE without WHERE)
       └─ Risk assessment
            ├─ L0: rows < 10        → AUTO   immediate execution
            ├─ L1: 10 ≤ rows < 1000 → CONFIRM user confirmation
            └─ L2: rows ≥ 1000 or DDL → MANUAL approval workflow
                 └─ Execute → audit log → Kafka event
```

### Execution Policy by Environment

| Env | L0 | L1 | L2 |
|---|---|---|---|
| LOCAL / DEV | AUTO | AUTO | CONFIRM |
| PROD | CONFIRM | CONFIRM | MANUAL |

---

## Role-Based Access Control

| Role | SELECT | INSERT | UPDATE | DELETE | DDL |
|---|---|---|---|---|---|
| `ANALYST` | ✅ | | | | |
| `MANAGER` | ✅ | ✅ | ✅ | | |
| `DBA` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SECURITY_ADMIN` | ✅ | | | | |

---

## Security

| Layer | Implementation |
|---|---|
| **Credentials at rest** | `~/.config/beanCli/connections.json` — AES-256-GCM, `chmod 600` |
| **Entity IDs** | HMAC-SHA256 hash (plain IDs not stored; controlled by `ENTITY_ID_PLAIN_ENABLED`) |
| **SQL injection** | Parameterized queries + `quoteIdent()` identifier quoting |
| **Audit log** | `audit_events` — no UPDATE/DELETE at application layer |
| **Query safety** | 30s hard kill + 5,000 row cap on all adapters |
| **Rate limiting** | `@fastify/rate-limit` — 60 req/min global · 5/min `/auth/login` · 5/hr `/auth/change-password` · 10/min `/connections/test` |
| **Logger** | Fastify pino redacts `authorization`, `password`, `currentPassword`, `newPassword`, `credential`, `secret` |
| **Key cache** | `CachedKeyStore` — 5 min TTL in-memory (3–10× throughput) |
| **DB name guard** | Allowlist regex `/^[a-zA-Z_][a-zA-Z0-9_$\-]{0,63}$/` |

---

## API Reference

Base URL: `http://localhost:3100`

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/v1/changes` | Submit SQL change |
| `GET` | `/api/v1/changes` | List changes |
| `POST` | `/api/v1/changes/:id/execute` | Execute approved change |
| `GET` | `/api/v1/audit` | Audit log |
| `GET` | `/api/v1/schema/tables` | List tables |
| `GET` | `/api/v1/state/:table` | Browse table rows |
| `POST` | `/api/v1/sql/execute` | Direct SQL execution |
| `GET` | `/api/v1/monitoring/stream-stats` | Stream statistics |
| `POST` | `/api/v1/connections/test` | Test a DB connection |
| `POST` | `/api/v1/ai/stream` | AI SSE stream |
| `WS` | `/ws` | Real-time event stream |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `dev` | `local` / `dev` / `prod` |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `KAFKA_BROKER` | `localhost:9092` | Kafka bootstrap server |
| `JWT_SECRET` | — | HS256 signing key |
| `ENTITY_ID_PLAIN_ENABLED` | `true` (dev) | Store plain entity IDs |
| `API_URL` | `http://localhost:3100` | TUI → API address |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3100` | Web console → API address |
| `MOCK` | — | Set `true` for mock mode |

---

## Docker Infrastructure

| Service | Port | Description |
|---|---|---|
| PostgreSQL 15 | 5432 | Primary database |
| Kafka | 9092 | Event streaming |
| Kafka UI | 8080 | Kafka browser (dev) |
| Zookeeper | 2181 | Kafka coordination |

```bash
pnpm docker:up       # Start all services
pnpm docker:wait     # Wait until healthy
pnpm db:migrate      # Apply SQL migrations
pnpm docker:reset    # Wipe volumes + restart
```

---

## Development Commands

```bash
# ── TUI ──────────────────────────────────────────────────────────
beancli               # Real mode (API + DB required)
beancli --mock        # Mock mode (no external services)
pnpm dev:mock         # Watch mode, mock
pnpm dev:cli          # Watch mode, real

# ── Web Console ──────────────────────────────────────────────────
pnpm dev:web          # Next.js dev server → http://localhost:3000

# ── Full Stack ───────────────────────────────────────────────────
pnpm dev:all          # All apps in watch mode

# ── Build & Type Check ───────────────────────────────────────────
pnpm build
pnpm --filter @tfsdc/tui exec tsc --noEmit
pnpm --filter @tfsdc/cli exec tsc --noEmit

# ── Test / Lint / Format ─────────────────────────────────────────
pnpm test
pnpm test:watch
pnpm lint && pnpm lint:fix
pnpm format

# ── Global Command ───────────────────────────────────────────────
pnpm link:global      # Register beancli in global PATH
```

---

## Roadmap

| Item | Status |
|---|---|
| Ink TUI 3-panel layout | ✅ Done |
| 9 DB adapters (PG · MySQL · SQLite · MongoDB · Redis · Kafka · RabbitMQ · ES · NATS) | ✅ Done |
| CRUD + role control | ✅ Done |
| Multi-line SQL editor + psql meta-commands | ✅ Done |
| AI assistant (SSE streaming) | ✅ Done |
| ConnectionPicker → DatabasePicker boot flow | ✅ Done |
| Query timeout + row limit (all adapters) | ✅ Done |
| AES-256-GCM credential encryption | ✅ Done |
| API rate limiting + logger redact | ✅ Done |
| Query history persistence | ✅ Done |
| Web Console — 14 pages (Query, Explore, Schema, Monitor, Indexes, Audit, Recovery, AI …) | ✅ Done |
| Web Console — Game Boy retro shell UI (light/dark theme) | ✅ Done |
| Web Console — Connections page (DB registration, test, manage) | ✅ Done |
| Web Console — NavBar dropdown groups + back navigation | ✅ Done |
| Web Console — Floating AI chat widget (all pages) | ✅ Done |
| Web Console — EN/KO language toggle (persisted in localStorage) | ✅ Done |
| Web Console — WebSocket LiveTableRefresh | ✅ Done |
| Web Console — RBAC AccessGuard | ✅ Done |
| JWT auth system (login form, 24h token, role-based guards) | ✅ Done |
| Admin user management (create, rename, deactivate, RBAC) | ✅ Done |
| Plugin adapter API (`--plugin ./adapter.js`) | ✅ Done |
| EXPLAIN ANALYZE tree view | ✅ Done |
| Export to CSV / JSON (TUI `\export` + web download buttons) | ✅ Done |
| Change Request panel (`C`) + Approval panel (`P`) in TUI | ✅ Done |

---

## Claude Code Custom Commands

Registered slash commands under `.claude/commands/`:

| Command | Description |
|---|---|
| `/commit` | Thematic commit guidelines |
| `/typecheck` | TypeScript check across all packages |
| `/test` | Test runner guide |
| `/issue` | Create GitHub Issue / PR |
| `/seed` | Seed DB with sample data |
| `/perf` | Performance audit |

---

<div align="center">

Built with ❤️ using [Ink](https://github.com/vadimdemedes/ink) · [Fastify](https://fastify.dev) · [Next.js](https://nextjs.org) · [kafkajs](https://kafka.js.org)

[Report an issue](https://github.com/leebeanbin/beanCli/issues) · [한국어](README.ko.md)

</div>
