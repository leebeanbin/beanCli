<div align="center">

```
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║    ◈  B E A N C L I    —    Terminal-First Database Console              ║
║                                                                          ║
║    9 Databases  ·  Ink TUI  ·  Next.js Web  ·  AI Assistant             ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

[![Node](https://img.shields.io/badge/Node-%3E%3D20.0-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-10.28.1-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io)
[![Turbo](https://img.shields.io/badge/Turbo-2.8-EF4444?style=flat-square&logo=turborepo&logoColor=white)](https://turbo.build)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/leebeanbin/beanCli?style=flat-square&color=brightgreen)](https://github.com/leebeanbin/beanCli/commits/master)

**One console for every database — in the terminal and in the browser.**

[한국어 →](README.ko.md)

</div>

---

## Two Interfaces, One Codebase

```
┌─────────────────────────────────┐     ┌──────────────────────────────────┐
│         ◈  TUI  (Ink)           │     │      ◈  Web Console  (Next.js)   │
│─────────────────────────────────│     │──────────────────────────────────│
│  • Keyboard-driven, 30fps       │     │  • Retro Game Boy shell UI       │
│  • 3-panel layout               │     │  • 14 pages, dark / light theme  │
│  • Multi-line SQL editor        │     │  • Mouse + keyboard              │
│  • psql meta-commands           │     │  • CSV / JSON download           │
│  • Live AI chat panel           │     │  • Floating ◈ AI widget          │
│  • Change / Approval panels     │     │  • Change status filter tabs     │
│  • Index Lab (create / drop)    │     │  • Index usage % bar             │
│  • Password change overlay      │     │  • Run SQL from AI responses     │
│                                 │     │                                  │
│  beancli --mock                 │     │  pnpm dev:web  →  :3000          │
└─────────────────────────────────┘     └──────────────────────────────────┘
```

---

## TUI Preview

<div align="center">
  <img src="docs/perform_beancli.gif" alt="BeanCLI TUI demo" width="720" />
</div>

```
┌─ BeanCLI v0.1.2 ───────────────────────────────────────────────────────────┐
│ [1] Schema             │ [2] Query Editor                                   │
│────────────────────────│────────────────────────────────────────────────────│
│ ◉ tfsdc_demo           │  1│ SELECT u.username, o.status,                   │
│  ├─ state_users   25   │  2│        o.total_cents                           │
│  ├─ state_orders  40   │  3│   FROM state_users u                           │
│  ├─ state_products 18  │  4│   JOIN state_orders o USING (user_id)          │
│  ├─ state_payments     │  5│  WHERE o.status = 'EXECUTING'                  │
│  ├─ state_shipments    │  6│  LIMIT 50;                                     │
│  ├─ events_raw    60   │────────────────────────────────────────────────────│
│  ├─ audit_events  30   │ [3] Results  6 rows · 12ms                         │
│  └─ dlq_events     8   │  username    status       total_cents               │
│────────────────────────│  ▶ alice     EXECUTING    $1,249.00                 │
│ ◈ AI Assistant [4]     │    bob       DONE           $89.99                  │
│────────────────────────────────────────────────────────────────────────────│
│ PG  leebeanbin/tfsdc_demo   DBA   dev    [?] help  [Ctrl+P] palette  [q] quit│
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

```bash
# ① Clone & install
git clone https://github.com/leebeanbin/beanCli && cd beanCli
pnpm setup                  # install + global link + docker up

# ② Launch (no DB needed)
beancli --mock              # full TUI with sample data

# ③ Or run the web console
pnpm dev:web                # → http://localhost:3000

# ④ Full stack (API + Kafka + DB + TUI)
pnpm dev:all
```

> **Already installed?** Just run `pnpm link:global` once, then `beancli --mock`.

---

## Feature Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  DATABASES          INTERFACE           PRODUCTIVITY        SECURITY      │
│──────────────────────────────────────────────────────────────────────────│
│  PostgreSQL   ●     TUI (Ink/React) ●   AI Assistant    ●  JWT + RBAC ●  │
│  MySQL        ●     Web (Next.js)   ●   Change Review   ●  AES-256-GCM● │
│  SQLite       ●     Mock mode       ●   Audit Log       ●  Rate limit  ● │
│  MongoDB      ●     Plugin API      ●   CSV/JSON export ●  SQL guard   ● │
│  Redis        ●     EN / KO i18n    ●   EXPLAIN tree    ●  Row cap     ● │
│  Kafka        ●     Dark/Light UI   ●   DLQ Recovery    ●  Redact log  ● │
│  RabbitMQ     ●     WebSocket live  ●   Index Lab       ●  Arg guard   ● │
│  Elasticsearch●     Game Boy shell  ●   Password change ●              │  │
│  NATS         ●                         SSE streaming   ●              │  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Supported Databases

```
┌──────────────────┬──────┬──────────────────────────────────────────────┐
│ Type             │ Port │ Notes                                        │
├──────────────────┼──────┼──────────────────────────────────────────────┤
│ postgresql  [PG] │ 5432 │ Full support · pool max=2 · schema catalog   │
│ mysql       [MY] │ 3306 │ MariaDB compatible · backtick quoting        │
│ sqlite      [SQ] │  —   │ node:sqlite built-in · file or :memory:      │
│ mongodb     [MG] │27017 │ Collections → tables · admin listDatabases   │
│ redis       [RD] │ 6379 │ HASH·LIST·SET·ZSET·STRING · key prefix       │
│ kafka       [KF] │ 9092 │ Topic listing · ephemeral consumer peek      │
│ rabbitmq    [RB] │ 5672 │ Management API + AMQP channel queue browse   │
│ elasticsearch[ES]│ 9200 │ Index listing · native JSON query via {}     │
│ nats        [NT] │ 4222 │ JetStream streams · pull consumer            │
└──────────────────┴──────┴──────────────────────────────────────────────┘
```

> **skipDbPicker** (no database step): sqlite · redis · kafka · rabbitmq · elasticsearch · nats

---

## Boot Flow (TUI)

```
  beancli
     │
     ▼
  ╔══════════════════╗
  ║ Connection Picker ║  ← j/k navigate  n add  d delete  * default  Enter connect
  ╚══════════════════╝
        │ Enter (connect)
        ▼
  ╔══════════════════╗
  ║ Database Picker   ║  ← j/k navigate  n create  d drop  Enter select
  ╚══════════════════╝       (skipped for sqlite / redis / kafka / …)
        │ Enter (select DB)
        ▼
  ╔══════════════════╗
  ║  Table Picker     ║  ← j/k  g/G top/bottom  / filter  Enter open
  ╚══════════════════╝
        │ Enter (open table)
        ▼
  ╔══════════════════════════════════════════════════════════╗
  ║  Main 3-Panel UI                                         ║
  ║  [1] Schema  │  [2] Query + [3] Results  │  [4] AI       ║
  ║              └── modes: b·m·A·R·I·C·P                   ║
  ╚══════════════════════════════════════════════════════════╝
```

---

## Architecture

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  apps/                                                               │
 │    cli/          ← TUI entry (index-ink.tsx) — beancli binary        │
 │    api/          ← Fastify REST + WebSocket  (port 3100)             │
 │    web/          ← Next.js 15 web console    (port 3000)             │
 │    projector/    ← Kafka → PostgreSQL state projector                │
 │    recovery-worker/ ← DLQ re-processor                              │
 ├──────────────────────────────────────────────────────────────────────┤
 │  packages/                                                           │
 │    tui/          ← Ink TUI components + IConnectionService           │
 │    kernel/       ← Shared types · Result<T,E> · ErrorCode            │
 │    domain/       ← DDD aggregates  (ChangeRequest state machine)     │
 │    application/  ← Use cases · port interfaces                       │
 │    infrastructure/ ← DB adapters (9 types) · OCP registry            │
 │    policy/       ← ExecutionMode × RiskScore matrix                  │
 │    audit/        ← Immutable audit event writer                      │
 │    dsl/          ← SQL AST parser · WHERE enforcement                │
 │    sql/          ← DDL migrations 001–006                            │
 │    ui-web/       ← Shared React components                           │
 └──────────────────────────────────────────────────────────────────────┘

  Dependency direction (no cycles enforced):

  kernel ──► domain ──► application ──► infrastructure
                                   ▲
                    policy · audit · dsl  (leaf packages)

  Apps sit at the top — depend on packages, never the reverse.
```

---

## Web Console Pages

```
┌─────────────┬──────────────┬──────────────────────────────────────────────┐
│ Page        │ Path         │ What you can do                              │
├─────────────┼──────────────┼──────────────────────────────────────────────┤
│ Dashboard   │ /            │ API health · saved connection overview        │
│ Query       │ /query       │ SQL editor · [Explain] button · CSV/JSON dl  │
│             │              │ ?sql= deep-link from AI page                 │
│ Explore     │ /explore     │ Table browse · realtime row filter · inline  │
│             │              │ edit · delete · create table modal           │
│ Schema      │ /schema      │ Column types · EXPLAIN ANALYZE tree view     │
│ Monitor     │ /monitor     │ Stream stats · SSE live counters             │
│ Indexes     │ /indexes     │ Index list with usage % bar · create · drop  │
│ Audit       │ /audit       │ Immutable audit log · category filter        │
│ Recovery    │ /recovery    │ DLQ failed-change re-submit                  │
│ AI          │ /ai          │ Streaming chat · [Run SQL] from code blocks  │
│ Changes     │ /changes     │ Status tabs (ALL/DRAFT/PENDING/APPROVED/…)   │
│             │              │ [Revert] button on FAILED rows               │
│ Approvals   │ /approvals   │ Pending approval queue · approve / reject    │
│ Auth        │ /auth        │ Login form · dev account hints (JWT 24h)     │
│ Connections │ /connections │ API URL config · connection test             │
│ Admin/Users │ /admin/users │ Create · rename · deactivate (DBA only)     │
└─────────────┴──────────────┴──────────────────────────────────────────────┘
```

---

## Keyboard Reference

### Global

```
  Ctrl+P  ── Command palette          ?  ── Full shortcuts overlay
  Tab     ── Next panel               q  ── Quit (outside SQL editor)
  1 / 2 / 3 / 4  ── Focus Schema / Query / Results / AI
```

### Mode Switching

```
  b ── Browse (row navigation)     m ── Stream Monitor
  I ── Index Lab                   A ── Audit log
  R ── DLQ Recovery                C ── Change Requests
  P ── Pending Approvals           t ── Table Picker
```

### SQL Editor (panel 2)

```
  Enter         Run query               Shift+Enter  New line
  ↑ / ↓        History navigation       Ctrl+L       Clear editor
  Ctrl+A / E   Start / end of line      ← / →        Cursor move

  \dt              List tables            \d <tbl>      Describe table
  \x               Toggle expanded mode   \ping         Roundtrip test
  \status          Connection info        \q            Quit
  \export csv|json <file>  Export result set
  \explain <sql>           EXPLAIN ANALYZE inline
  \pw                      Password change (3-step overlay)
```

### Browse / Explore Mode (panel 3)

```
  j / k  Move rows      h / l  Move columns     Enter  Row detail
  e      Edit row       i      Insert row        D      Delete row
  Q      SELECT → Query editor                   r      Refresh
```

### Index Lab (`I` mode)

```
  n  Create index  (table → columns → name, inline 3-step form)
  d  Drop selected index  (y / N confirm prompt)
  f  Switch tab  (Indexes ↔ Table Stats)
  /  Filter list    r  Refresh
```

### Change Panel (`C`)

```
  j / k  Navigate   n  New request   s  Submit (DRAFT→PENDING)
  x  Execute        r  Revert        f  Cycle status filter   R  Refresh
```

---

## Change Review Workflow

```
  User submits SQL
        │
        ▼
  ┌─────────────────────────────────────┐
  │  AST Parser                         │
  │  • blocks UPDATE/DELETE without WHERE│
  │  • schema change detection          │
  └──────────────────┬──────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────┐
  │  Risk Scoring                       │
  │  L0: rows < 10                      │
  │  L1: 10 ≤ rows < 1000              │
  │  L2: rows ≥ 1000  OR  DDL change   │
  └──────────┬─────────────┬────────────┘
             │             │
    ┌────────┘             └────────┐
    ▼                               ▼
 L0 / L1 (dev)                   L2 / prod
 ┌──────────┐                 ┌───────────────┐
 │  AUTO    │                 │  MANUAL       │
 │ executes │                 │ approval queue│
 │ directly │                 │ C panel / web │
 └────┬─────┘                 └──────┬────────┘
      │                              │ approved
      ▼                              ▼
  ┌──────────────────────────────────────┐
  │  Execute → audit_events → Kafka msg  │
  └──────────────────────────────────────┘
```

### Policy Matrix

```
  ┌──────────────┬────────┬────────┬────────┐
  │ Environment  │  L0    │  L1    │  L2    │
  ├──────────────┼────────┼────────┼────────┤
  │ LOCAL / DEV  │  AUTO  │  AUTO  │CONFIRM │
  │ PROD         │CONFIRM │CONFIRM │ MANUAL │
  └──────────────┴────────┴────────┴────────┘
```

---

## TUI ↔ Web Feature Parity

```
  Feature                        TUI              Web
  ─────────────────────────────────────────────────────────────────
  SQL editor                     ✅ multi-line     ✅ textarea
  EXPLAIN ANALYZE                ✅ \explain       ✅ [Explain] btn
  Export results (CSV/JSON)      ✅ \export        ✅ download btns
  Table browse + filter          ✅ j/k + /        ✅ table + input
  Row edit / insert / delete     ✅ e/i/D keys      ✅ modal + btn
  AI assistant                   ✅ panel 4         ✅ /ai + widget
  AI → Run SQL                   ✅ copy to editor  ✅ [Run SQL] btn
  Change requests                ✅ C panel         ✅ /changes page
  Status filter (changes)        ✅ f key           ✅ tab buttons
  Revert failed change           ✅ r key           ✅ [Revert] btn
  Approval queue                 ✅ P panel         ✅ /approvals
  Index create / drop            ✅ n/d keys        ✅ form + btn
  Index usage stats              ✅ TABLE STATS tab ✅ usage % bar
  Audit log                      ✅ A panel         ✅ /audit page
  DLQ recovery                   ✅ R panel         ✅ /recovery
  Password change                ✅ \pw overlay     —  (admin page)
  Create table wizard            —  (web-only)      ✅ modal
```

---

## Role-Based Access Control

```
  ┌────────────────┬────────┬────────┬────────┬────────┬─────┐
  │ Role           │ SELECT │ INSERT │ UPDATE │ DELETE │ DDL │
  ├────────────────┼────────┼────────┼────────┼────────┼─────┤
  │ ANALYST        │   ✅   │        │        │        │     │
  │ MANAGER        │   ✅   │   ✅   │   ✅   │        │     │
  │ DBA            │   ✅   │   ✅   │   ✅   │   ✅   │ ✅  │
  │ SECURITY_ADMIN │   ✅   │        │        │        │     │
  └────────────────┴────────┴────────┴────────┴────────┴─────┘
```

---

## Security Layers

```
  ┌─────────────────────────────────────────────────────────────┐
  │  Credentials at rest                                        │
  │  ~/.config/beanCli/connections.json                         │
  │  AES-256-GCM encrypted · chmod 600                          │
  ├─────────────────────────────────────────────────────────────┤
  │  Transport / Auth                                           │
  │  JWT HS256 · 24h TTL · RBAC guards on every route          │
  │  bcrypt passwords · change-password endpoint (5/hr limit)  │
  ├─────────────────────────────────────────────────────────────┤
  │  SQL safety                                                 │
  │  Parameterized queries · quoteIdent() identifier quoting   │
  │  AST parser blocks UPDATE/DELETE without WHERE             │
  │  DB name allowlist regex /^[a-zA-Z_][a-zA-Z0-9_$\-]{0,63}$/│
  ├─────────────────────────────────────────────────────────────┤
  │  Rate limiting  (@fastify/rate-limit)                       │
  │  Global 60/min · /auth/login 5/min                         │
  │  /auth/change-password 5/hr · /connections/test 10/min     │
  ├─────────────────────────────────────────────────────────────┤
  │  Query safety                                               │
  │  30s hard timeout · 5,000 row cap on all adapters          │
  ├─────────────────────────────────────────────────────────────┤
  │  Audit & Observability                                      │
  │  Immutable audit_events (no UPDATE/DELETE at app layer)    │
  │  Fastify pino redacts: authorization · password ·          │
  │    currentPassword · newPassword · credential · secret     │
  ├─────────────────────────────────────────────────────────────┤
  │  Entity Privacy                                             │
  │  HMAC-SHA256 entity ID hashing (ENTITY_ID_PLAIN_ENABLED)   │
  │  CachedKeyStore 5 min TTL (3–10× throughput)               │
  └─────────────────────────────────────────────────────────────┘
```

---

## API Reference

Base URL: `http://localhost:3100`

```
  Auth
  ─────────────────────────────────────────────────────────────────
  POST  /api/v1/auth/login               Login → JWT
  POST  /api/v1/auth/change-password     Change current user password

  SQL / Schema
  ─────────────────────────────────────────────────────────────────
  POST  /api/v1/sql/execute              Direct SQL execution
  POST  /api/v1/schema/analyze           EXPLAIN ANALYZE a query
  GET   /api/v1/schema/tables            List tables
  GET   /api/v1/state/:table             Browse rows (pagination)

  Changes
  ─────────────────────────────────────────────────────────────────
  POST  /api/v1/changes                  Submit change request
  GET   /api/v1/changes                  List changes (?status= filter)
  POST  /api/v1/changes/:id/submit       DRAFT → PENDING
  POST  /api/v1/changes/:id/execute      Execute approved change
  POST  /api/v1/changes/:id/revert       Revert a FAILED change

  Approvals
  ─────────────────────────────────────────────────────────────────
  GET   /api/v1/approvals/pending        Pending approval list
  POST  /api/v1/approvals/:id/approve    Approve
  POST  /api/v1/approvals/:id/reject     Reject

  Indexes
  ─────────────────────────────────────────────────────────────────
  GET   /api/v1/schema/indexes           List indexes
  POST  /api/v1/indexes                  Create index
  DELETE /api/v1/indexes/:name           Drop index

  Connections
  ─────────────────────────────────────────────────────────────────
  POST  /api/v1/connections/test         Test a DB connection
  POST  /api/v1/connections/execute      Execute SQL via connection

  Other
  ─────────────────────────────────────────────────────────────────
  GET   /health                          Health check
  GET   /api/v1/audit                    Audit log
  GET   /api/v1/monitoring/stream-stats  Stream statistics
  POST  /api/v1/ai/stream               AI SSE stream
  WS    /ws                              Real-time event stream
```

---

## Environment Variables

```
  ┌─────────────────────────────┬───────────────────────┬─────────────────────┐
  │ Variable                    │ Default               │ Description         │
  ├─────────────────────────────┼───────────────────────┼─────────────────────┤
  │ APP_ENV                     │ dev                   │ local/dev/prod      │
  │ DATABASE_URL                │ —                     │ PostgreSQL DSN      │
  │ KAFKA_BROKER                │ localhost:9092        │ Bootstrap server    │
  │ JWT_SECRET                  │ —                     │ HS256 signing key   │
  │ ENTITY_ID_PLAIN_ENABLED     │ true (dev)            │ Plain IDs in dev    │
  │ API_URL                     │ http://localhost:3100 │ TUI → API           │
  │ NEXT_PUBLIC_API_URL         │ http://localhost:3100 │ Web → API           │
  │ MOCK                        │ —                     │ true = mock mode    │
  └─────────────────────────────┴───────────────────────┴─────────────────────┘
```

---

## Docker Infrastructure

```
  ┌──────────────────┬───────┬──────────────────────────────────────┐
  │ Service          │ Port  │ Description                          │
  ├──────────────────┼───────┼──────────────────────────────────────┤
  │ PostgreSQL 15    │ 5432  │ Primary database                     │
  │ Kafka            │ 9092  │ Event streaming                      │
  │ Kafka UI         │ 8080  │ Topic browser (dev)                  │
  │ Zookeeper        │ 2181  │ Kafka coordination                   │
  └──────────────────┴───────┴──────────────────────────────────────┘
```

```bash
pnpm docker:up      # Start all services
pnpm docker:wait    # Wait until healthy
pnpm db:migrate     # Apply SQL migrations (001–006)
pnpm docker:reset   # Wipe volumes + restart
```

---

## Development Commands

```bash
# ── TUI ────────────────────────────────────────────────────────────────
beancli               # Real mode (API + DB required)
beancli --mock        # Mock mode — no external services needed
pnpm dev:mock         # Watch mode + mock (auto-restarts on changes)
pnpm dev:cli          # Watch mode + real API

# ── Web Console ─────────────────────────────────────────────────────────
pnpm dev:web          # → http://localhost:3000

# ── Full Stack ───────────────────────────────────────────────────────────
pnpm dev:all          # API + Projector + Recovery + TUI all in watch mode

# ── Build & Type Check ───────────────────────────────────────────────────
pnpm build
pnpm --filter @tfsdc/tui exec tsc --noEmit
pnpm --filter @tfsdc/cli exec tsc --noEmit
pnpm --filter @tfsdc/web exec tsc --noEmit

# ── Test / Lint / Format ─────────────────────────────────────────────────
pnpm test && pnpm test:watch
pnpm lint && pnpm lint:fix
pnpm format

# ── Database ─────────────────────────────────────────────────────────────
pnpm db:migrate       # Apply migrations
pnpm db:seed          # Seed sample data
pnpm db:test-conn     # Verify connection

# ── Global Binary ────────────────────────────────────────────────────────
pnpm link:global      # Register beancli in global PATH
```

---

## Roadmap

```
  Core TUI
  ─────────────────────────────────────────────────────────────
  ✅  3-panel Ink layout (Schema / Query / Results / AI)
  ✅  ConnectionPicker → DatabasePicker → TablePicker boot flow
  ✅  Multi-line SQL editor + psql meta-commands (\dt \d \x \ping)
  ✅  \export csv|json  ·  \explain  ·  \pw (password change)
  ✅  DML confirmation (EXPLAIN row estimate → y/n)
  ✅  Change Request panel (C)  +  Approval panel (P)
  ✅  Index Lab — create (n) / drop (d) / usage stats

  Databases & Infra
  ─────────────────────────────────────────────────────────────
  ✅  9 DB adapters (PG · MySQL · SQLite · MongoDB · Redis ·
                     Kafka · RabbitMQ · Elasticsearch · NATS)
  ✅  AES-256-GCM credential encryption
  ✅  Query timeout (30s) + row cap (5,000)
  ✅  API rate limiting + logger credential redact
  ✅  Plugin adapter API (--plugin ./adapter.js)

  Web Console
  ─────────────────────────────────────────────────────────────
  ✅  14 pages — Query · Explore · Schema · Monitor · Indexes
                  Audit · Recovery · AI · Changes · Approvals
                  Auth · Connections · Admin/Users · Dashboard
  ✅  Game Boy retro shell UI — dark / light theme
  ✅  EN / KO language toggle (persisted in localStorage)
  ✅  Floating AI chat widget (all pages)
  ✅  WebSocket LiveTableRefresh  ·  RBAC AccessGuard
  ✅  [Explain] button + ?sql= deep-link
  ✅  Change status filter tabs (ALL/DRAFT/PENDING/APPROVED/…)
  ✅  [Revert] on FAILED rows
  ✅  Realtime row filter (Explore)
  ✅  Index usage % bar (████░░ N%)
  ✅  [Run SQL] button extracted from AI ```sql blocks

  Auth & RBAC
  ─────────────────────────────────────────────────────────────
  ✅  JWT login (24h) · bcrypt passwords · RBAC route guards
  ✅  Admin user management (create · rename · deactivate)
  ✅  EXPLAIN ANALYZE tree view
  ✅  Export CSV / JSON (TUI \export + web download buttons)
```

---

## Plugin API

Custom DB adapters can be loaded at runtime:

```bash
beancli --plugin ./my-adapter.js
```

```typescript
// my-adapter.js  — minimal example
module.exports = {
  type: 'mypgfork',
  create(config) {
    return {
      async listTables() { /* … */ },
      async queryRows(sql) { /* … */ },
      async close() { /* … */ },
    };
  },
};
```

> See [`docs/plugin-api.md`](docs/plugin-api.md) for the full interface spec.

---

## Claude Code Custom Commands

```
  /commit     Thematic commit guidelines (one concern per commit)
  /typecheck  TypeScript check across all packages
  /test       Test runner guide
  /issue      Create GitHub Issue / PR
  /seed       Seed DB with sample data
  /perf       Performance audit
```

---

<div align="center">

Built with ❤️ using
[Ink](https://github.com/vadimdemedes/ink) ·
[Fastify](https://fastify.dev) ·
[Next.js](https://nextjs.org) ·
[kafkajs](https://kafka.js.org) ·
[neverthrow](https://github.com/supermacro/neverthrow)

[Report an issue](https://github.com/leebeanbin/beanCli/issues) · [한국어](README.ko.md)

</div>
