# Changelog

All notable changes to beanCli are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Planned
- Ink-based TUI rewrite (`packages/tui`) — Phase 0 skeleton
- 3-pane layout: Schema tree / Query Editor / Result Viewer
- Command Palette (Ctrl+P)
- AI panel with beanllm SSE streaming (improved UX)

---

## [0.1.2] - 2026-02-24

### Added
- Real DB table list passed from `ConnectionScene.onConnect` to `TableSelectScene`
  — no second API round-trip; tables come directly from `adapter.listTables()`
- `DATABASE_URL` auto-fill: first launch creates a default connection from env var
- `parseDbUrl()` helper supporting `postgresql`, `mysql`, `mongodb`, `redis` URLs
- `CHANGELOG.md` and unified version management across all workspace packages

### Changed
- `ConnectionScene.onConnect` return type: `Promise<string | null>` →
  `Promise<{ error: string | null; tables: string[] }>`
- `SplashScene.onProceed` uses `_connectedTables` as primary table source;
  API SQL introspect kept as fallback only

---

## [0.1.1] - 2026-02-23

### Added
- Web console Connections page (`/connections`) — dark terminal-styled split panel
- DB type chips, type-aware form (SQLite hides host/port), SHOW/HIDE password toggle
- Web state table value formatting: `_ms` → datetime, `_cents` → currency, hidden fields → `[private]`
- `CLAUDE.md` removed from git tracking, added to `.gitignore`

### Fixed
- `ConnectionScene.onConnect` now propagates real adapter error messages
  instead of generic "Connection refused or credentials invalid"
- CLI connection test uses `createAdapter` directly — no API server dependency

---

## [0.1.0] - 2026-02-22

### Added
- **Multi-DB Connection Manager** replacing `cli_users` table-based auth
- `ConnectionScene` TUI (pixel-game double-border, list / form / testing / error phases)
- Local connection store at `~/.config/beanCli/connections.json` (chmod 600)
- SOLID OCP DB adapter registry (`DbAdapterRegistry`, `registerDbAdapter`, `createAdapter`)
- Adapters: `PgAdapter`, `MySqlAdapter`, `SqliteAdapter` (Node.js built-in `node:sqlite`),
  `MongoAdapter`, `RedisAdapter`
- `IDbAdapter` interface: `listTables()`, `queryRows()`, `close()`
- `POST /api/v1/connections/test` endpoint (no auth, CLI-trusted)
- Boot flow: `connection → splash → table-select → main`
- `ExploreScene` detail panel: smart value formatting
  (`_ms` → human datetime, `_cents` → `$9.00`, hidden fields → `[private]`)
- Edit bar unit hints: `[unix ms]`, `[cents]`
- `@tfsdc/infrastructure` dependency added to `apps/cli`

### Removed
- `LoginScene` as default boot entry point

---

## [0.0.1] - 2026-02-10

### Added
- Initial monorepo setup (Turbo + pnpm workspaces)
- Custom 30fps TUI renderer (`TerminalCanvas`, `RenderLoop`)
- 6 TUI scenes: `ExploreScene`, `MonitorScene`, `AuditScene`,
  `RecoveryScene`, `IndexLabScene`, `AiChatScene`
- Fastify REST + WebSocket + SSE API server
- Kafka consumer / projector
- PostgreSQL state tables (users, products, orders, payments, shipments)
- `ChangeRequest` aggregate with state machine (`DRAFT → DONE`)
- `ExecutionMode` policy (AUTO / CONFIRM / MANUAL) driven by risk level
- AI chat via beanllm sidecar with SSE streaming
- DLQ recovery worker
- Next.js web console with state table viewer
- HMAC-based audit trail
- Idempotent Kafka processing (offset after DB transaction)
