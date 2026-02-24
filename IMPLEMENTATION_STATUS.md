# TFSDC Implementation Status

## All phases implemented and building successfully (pnpm build + pnpm test pass)

### Phase 1 — PgChangeRequestRepository ✅
- `packages/infrastructure/src/db/PgChangeRequestRepository.ts`
- UPSERT save, findById (reconstitute domain aggregate), findByStatus, findPendingApproval
- Fixed: `packages/infrastructure/package.json` — added `@types/pg` devDependency

### Phase 2 — ChangeRouteHandlerImpl ✅
- `packages/application/src/api/routes/ChangeRouteHandlerImpl.ts`
- Full domain flow: parse SQL → score risk → evaluate policy → create aggregate → save
- `packages/application/src/api/routes/ApprovalRouteHandlerImpl.ts`

### Phase 3 — API wiring ✅
- `apps/api/src/server.ts` — ServerDeps extended with changeHandler + approvalHandler
- `apps/api/src/index.ts` — SqlAstValidatorImpl, PgChangeRequestRepository, ChangeRouteHandlerImpl, ApprovalRouteHandlerImpl wired
- Fixed: `apps/api/package.json` — added `@tfsdc/dsl` dependency

### Phase 4 — TUI WebSocket ✅
- `packages/ui-tui/src/ws/NodeWsTransport.ts` — Node.js `ws` library transport
- `apps/cli/src/index.ts` — WS connect + initial data loading (state tables, audit, failed changes)
- `packages/ui-tui/src/scenes/RecoveryScene.ts` — added `setItems()` method
- Fixed: `packages/ui-tui/package.json` — added `ws` + `@types/ws`

### Phase 5 — Recovery Worker ✅
- `apps/recovery-worker/src/index.ts` — Kafka re-publish on success, resolved=true, MAX_RETRIES_EXCEEDED

### Phase 6 — Empty packages ✅
- `packages/audit/src/AuditEventWriter.ts` — DB-agnostic IDbQuery interface
- `packages/testing/src/index.ts` — makeChangeRequest, makeRiskScore, makeMockDb, makeMockAuditWriter
- `packages/policy/src/index.ts` — evaluatePolicy() helper added
- Fixed: `packages/testing/package.json` — added @tfsdc/domain + @tfsdc/application deps

### Phase 7 — P95 Latency ✅
- `packages/infrastructure/src/db/PgPool.ts` — sliding window circular buffer, computeP95()

### Phase 8 — Web Console ✅
- `apps/web/` — Full Next.js App Router setup
- Pages: Dashboard, Changes (create+submit+execute), Approvals (approve/reject), State viewer, Audit, Recovery/DLQ
- Components: ChangeTable, ApprovalCard, StatusBadge
- Updated: `apps/web/package.json` — next, react, react-dom added
