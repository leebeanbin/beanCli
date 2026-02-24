# Integrity Benchmark Matrix

Generated: 2026-02-24  
Scope: CLI TUI + API + PostgreSQL state schema

## Benchmark Targets

- **DataGrip-like**: strong relational integrity (FK/constraints first), explicit validation errors
- **DBeaver-like**: flexible diagnostics/reporting and schema inspection workflows
- **pgAdmin-like**: PostgreSQL-native constraints, validation, and migration safety

## Capability Matrix

| Capability | DataGrip style | DBeaver style | pgAdmin style | Current status | Gap |
|---|---|---|---|---|---|
| FK modeling across related tables | Strong | Medium | Strong | Stage rollout added (`008/009`) | Need staging/prod rollout runbook |
| Constraint-first integrity (CHECK/FK) | Strong | Medium | Strong | `007` constraints + FK validate | Extend to core tables as needed |
| Safe phased migration | Medium | Medium | Strong | `NOT VALID -> cleanup -> VALIDATE` applied | Add lock/perf guard metrics in staging |
| Server-side input validation | Medium | Medium | Medium | Per-table normalization/validation in API | Expose schema metadata to all clients |
| Error code standardization | Medium | Medium | Medium | `422 STATE_VALIDATION_ERROR` used | Add explicit FK violation code mapping |
| Data quality diagnostics | Medium | Strong | Medium | `pnpm data:quality` script available | Add CI gate and trend history |
| UI schema sync with backend rules | Medium | Medium | Low | Partially hardcoded in CLI | Add runtime schema endpoint integration |
| Policy-safe write path | Medium | Medium | Medium | Direct SQL guarded, CR flow exists | Converge all writes to CR in prod |

## Current Baseline Snapshot

- Data profile and distinct values: see `reports/data-quality-baseline.md`
- DQ command: `pnpm data:quality`
- Migration hardening:
  - `007_data_quality_constraints.sql`
  - `008_fk_stage1_not_valid.sql`
  - `009_fk_validate_and_cleanup.sql`

## Next Upgrade Targets

1. Add explicit FK violation API error code (`STATE_FK_VIOLATION`) mapping.
2. Add `/api/v1/state/:table/schema` metadata endpoint and let CLI consume it.
3. Add CI quality gate (`pnpm data:quality`) in integration pipeline.
4. Extend FK/constraint policy to additional core relations where practical.
