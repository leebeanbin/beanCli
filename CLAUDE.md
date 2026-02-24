# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Terminal-First Streaming Data Console (TFSDC)** — a monorepo implementing a streaming data management system with a custom TUI, REST/WebSocket API, Kafka-backed event pipeline, and Next.js web console.

- **Package Manager**: pnpm 10.28.1 (do not use npm or yarn)
- **Build System**: Turbo 2.8.10 (respects dependency graph)
- **Node**: ≥20.0.0, TypeScript 5.9.3 (ES2022, strict mode)

## Commands

```bash
# Setup
pnpm install
pnpm setup            # copies .env, installs, starts docker, waits for services

# Build & Dev
pnpm build            # Turbo build all packages (respects dep order)
pnpm dev              # Watch mode for all packages
pnpm dev:all          # Docker up + all apps (api, projector, recovery-worker, cli)
pnpm dev:api          # Fastify API server only
pnpm dev:projector    # Kafka consumer/projector only
pnpm dev:cli          # TUI CLI only
pnpm dev:recovery     # DLQ recovery worker only

# Test / Lint / Format
pnpm test             # Jest (all packages)
pnpm test:watch       # Jest watch mode
pnpm lint             # ESLint on all src/
pnpm lint:fix         # Auto-fix ESLint violations
pnpm format           # Prettier write
pnpm format:check     # Prettier check (no write)

# Database & Infrastructure
pnpm docker:up        # PostgreSQL, Zookeeper, Kafka, Kafka UI
pnpm docker:down      # Stop containers
pnpm docker:reset     # Stop + remove volumes + restart
pnpm docker:wait      # Health-check until Postgres/Kafka are ready
pnpm db:migrate       # Apply packages/sql/migrations/*.sql
```

To run a single test file:
```bash
pnpm --filter @tfsdc/<package-name> test -- --testPathPattern="<filename>"
```

## Architecture

### Monorepo Layout

```
apps/
  api/            → Fastify REST + WebSocket + SSE server
  cli/            → TUI entry point
  projector/      → Kafka consumer → PostgreSQL state projector
  recovery-worker/→ DLQ re-processor
  web/            → Next.js web console

packages/
  kernel/         → Shared types, Result<T,E>, ErrorCode constants (neverthrow)
  domain/         → Pure DDD aggregates — no external framework deps
  application/    → Use cases coordinating domain + infrastructure ports
  infrastructure/ → PostgreSQL (pg) + Kafka (kafkajs) adapter implementations
  policy/         → ExecutionMode + RiskScore policy evaluation
  audit/          → Immutable audit event writing
  dsl/            → SQL AST parser + validator (WHERE enforcement, schema validation)
  sql/            → DDL migrations 001–006
  testing/        → Jest fixtures and mock factories
  ui-tui/         → Custom TUI: 30fps render loop, 5 scenes, WebSocket client
  ui-web/         → React components for Next.js web console
```

### Dependency Direction (enforced, no cycles)

```
kernel → domain → application → infrastructure
                              ↗
               policy, audit, dsl (leaf packages)
```

Apps (`api`, `cli`, `projector`, `recovery-worker`, `web`) sit at the top and depend on packages.

### Key Patterns

**Result<T, E> monad** (neverthrow) — all operations return `Result<T, E>`; no try-catch. Use `.map()`, `.andThen()`, `.mapErr()`, `isOk()`, `isErr()`.

**Ports & Adapters** — `application/` defines interfaces (`IChangeRequestRepository`, `IKafkaConsumer`, `IProjectorDb`); `infrastructure/` implements them. Never import infrastructure from domain or application directly.

**ChangeRequest aggregate** — core entity with state machine: `DRAFT → PENDING → APPROVED → EXECUTING → DONE`. Lives in `packages/domain/src/change/`.

**ExecutionMode** — AUTO / CONFIRM / MANUAL driven by `APP_ENV` × `RiskLevel` (L0/L1/L2). L2 requires schema changes or ≥1000-row bulk changes. Policy matrix is in `packages/policy/`.

**TUI Render Loop** — `packages/ui-tui/src/core/RenderLoop.ts`, 30fps cap (33ms frame budget). Use `markDirty()` to trigger re-renders; never call render imperatively.

**Idempotent Kafka processing** — offset committed after DB transaction (at-least-once). Events deduplicated by `UNIQUE(source_topic, partition, offset)`.

**Concurrency throttle** — `ConcurrencyController` in `application/projector/` throttles if DB p95 latency ≥200ms or connection pool ≥80%.

### Infrastructure (Docker Compose)

| Service | Port |
|---------|------|
| PostgreSQL 15 | 5432 |
| Kafka | 9092 |
| Kafka UI | 8080 |
| Zookeeper | 2181 |

### Key Constants

```typescript
BULK_CHANGE_THRESHOLD_ROWS  = 1000
CHANGE_APPLIED_PKLISTMAX    = 500      // >500 triggers viewport reload
BACKUP_SNAPSHOT_TTL_DAYS    = 7
TUI_FRAME_BUDGET_MS         = 33.33    // 30fps
DB_P95_LATENCY_HARD_LIMIT_MS= 200
CONNECTION_POOL_THROTTLE_PCT= 80
HMAC_KEY_ROTATION_DAYS      = 30
SIDECAR_JWT_EXPIRY_SECONDS  = 3600
```

### SQL Migrations (`packages/sql/migrations/`)

- `001` — extensions (pgcrypto), enums (ChangeStatus, RiskLevel, ExecutionMode)
- `002` — core tables: events_raw, change_requests, audit_events, backup_snapshots, dlq_events, hmac_keys
- `003` — partitioned state tables (users, products, orders, payments, shipments)
- `004` — policy enforcement functions, maintenance views
- `005` — seed data
- `006` — sidecar API key management

### Environment Variables

Key `.env` variables (copy from `.env.example`):
```
APP_ENV=dev
DATABASE_URL=postgres://postgres:postgres@localhost:5432/tfsdc
KAFKA_BROKER=localhost:9092
KAFKA_GROUP_ID=tfsdc-projector
JWT_SECRET=dev-jwt-secret-change-in-prod
ENTITY_ID_PLAIN_ENABLED=true   # false in PROD
SIDECAR_MODE=MANAGED
```

## Documentation

Architecture decisions and full specifications are in `devDocuments/`:
- `v1-master-doc.md` — complete v1 spec, all constants and data models
- `ADR.md` — 8 Architecture Decision Records (ADR-001 through ADR-008)
- `phase2-7.md` — per-phase design decisions
