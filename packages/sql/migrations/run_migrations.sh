#!/usr/bin/env bash
# =============================================================
# run_migrations.sh
# Terminal-First Streaming Data Console v1
# PostgreSQL 마이그레이션 순서 실행
# =============================================================

set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/tfsdc}"
ENV="${APP_ENV:-dev}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Running migrations for ENV=${ENV}"
echo "   DB: ${DB_URL}"

run_sql() {
  local file="$1"
  echo "  > $(basename "$file")"
  psql "${DB_URL}" -f "${file}" -v ON_ERROR_STOP=1
}

# Phase 1: Extensions & ENUMs
run_sql "${SCRIPT_DIR}/001_extensions_and_enums.sql"

# Phase 2: Core Tables
run_sql "${SCRIPT_DIR}/002_core_tables.sql"

# Phase 3: State Tables
run_sql "${SCRIPT_DIR}/003_state_tables.sql"

# Phase 4: Policies, Functions, Views
run_sql "${SCRIPT_DIR}/004_policies_functions_maintenance.sql"

# Phase 5: Sidecar API Keys
run_sql "${SCRIPT_DIR}/006_sidecar_api_keys.sql"

# Phase 6: Seed Data (LOCAL/DEV only)
if [[ "${ENV}" == "local" || "${ENV}" == "dev" ]]; then
  echo "  ** Applying seed data (DEV only)"
  run_sql "${SCRIPT_DIR}/005_seed_data.sql"
else
  echo "  -- Skipping seed data (ENV=${ENV})"
fi

echo ""
echo "All migrations applied successfully."
