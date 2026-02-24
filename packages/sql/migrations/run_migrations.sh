#!/usr/bin/env bash
# =============================================================
# run_migrations.sh  —  Terminal-First Streaming Data Console v1
# 멱등 마이그레이션: schema_migrations 테이블로 적용 여부 추적
# =============================================================

set -uo pipefail

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-tfsdc}"
CONTAINER="${POSTGRES_CONTAINER:-tfsdc-postgres}"
ENV="${APP_ENV:-dev}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Running migrations for ENV=${ENV}"
echo "   Container: ${CONTAINER}  DB: ${POSTGRES_DB}"

# ── helpers ───────────────────────────────────────────────

# 단순 SELECT → stdout
pg() {
  docker exec -i "${CONTAINER}" \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
    --quiet --tuples-only "$@" 2>/dev/null
}

# SQL 파일 실행 (stdin으로 piping)
pg_run_file() {
  docker exec -i "${CONTAINER}" \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
    -v ON_ERROR_STOP=1 --quiet 2>&1 < "$1"
}

# count: 쿼리 결과 숫자 반환
count_of() {
  pg -c "$1" | tr -d ' \n'
}

mark_applied() {
  pg -c "INSERT INTO schema_migrations (filename) VALUES ('$1') ON CONFLICT DO NOTHING;" > /dev/null 2>&1 || true
}

is_applied() {
  [[ "$(count_of "SELECT COUNT(*) FROM schema_migrations WHERE filename='$1';")" == "1" ]]
}

object_exists() {
  # $1 = check SQL that returns 1 or 0
  [[ "$(count_of "$1")" == "1" ]]
}

# ── 추적 테이블 생성 ──────────────────────────────────────

pg -c "CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);" > /dev/null 2>&1 || true

# ── 각 마이그레이션의 실제 적용 여부를 DB 객체로 검증 ────────
# 이전에 schema_migrations 없이 적용된 경우를 처리

retroactive_check() {
  local filename="$1"
  local check_sql="$2"

  if ! is_applied "${filename}"; then
    if object_exists "${check_sql}"; then
      echo "  ○ ${filename} (detected as applied, registering)"
      mark_applied "${filename}"
    fi
  fi
}

retroactive_check "001_extensions_and_enums.sql" \
  "SELECT COUNT(*) FROM pg_type WHERE typname='change_request_status';"

retroactive_check "002_core_tables.sql" \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='hmac_keys' AND table_schema='public';"

retroactive_check "003_state_tables.sql" \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='state_users' AND table_schema='public';"

retroactive_check "004_policies_functions_maintenance.sql" \
  "SELECT COUNT(*) FROM information_schema.routines WHERE routine_name='enforce_where_clause' AND routine_schema='public';"

retroactive_check "006_sidecar_api_keys.sql" \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='sidecar_api_keys' AND table_schema='public';"

retroactive_check "007_data_quality_constraints.sql" \
  "SELECT COUNT(*) FROM pg_constraint WHERE conname='state_orders_currency_code_chk';"

retroactive_check "008_fk_stage1_not_valid.sql" \
  "SELECT COUNT(*) FROM pg_constraint WHERE conname='fk_state_orders_user';"

retroactive_check "009_fk_validate_and_cleanup.sql" \
  "SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_constraint WHERE conname='fk_state_orders_user' AND convalidated) THEN 1 ELSE 0 END;"

retroactive_check "010_cli_users.sql" \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='cli_users' AND table_schema='public';"

retroactive_check "005_seed_data.sql" \
  "SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='state_users') AND EXISTS(SELECT 1 FROM state_users) THEN 1 ELSE 0 END;"

# ── 마이그레이션 실행 ─────────────────────────────────────

run_sql() {
  local file="$1"
  local filename
  filename="$(basename "$file")"

  if is_applied "${filename}"; then
    echo "  ○ ${filename} (already applied)"
    return 0
  fi

  echo "  ▶ ${filename}"
  output=$(pg_run_file "${file}")
  exit_code=$?

  if [[ ${exit_code} -ne 0 ]]; then
    echo "    ✗ FAILED:"
    echo "${output}" | grep -v "^NOTICE" | head -10
    exit 1
  fi

  mark_applied "${filename}"
  echo "    ✓ done"
}

run_sql "${SCRIPT_DIR}/001_extensions_and_enums.sql"
run_sql "${SCRIPT_DIR}/002_core_tables.sql"
run_sql "${SCRIPT_DIR}/003_state_tables.sql"
run_sql "${SCRIPT_DIR}/004_policies_functions_maintenance.sql"
run_sql "${SCRIPT_DIR}/006_sidecar_api_keys.sql"
run_sql "${SCRIPT_DIR}/007_data_quality_constraints.sql"
run_sql "${SCRIPT_DIR}/008_fk_stage1_not_valid.sql"
run_sql "${SCRIPT_DIR}/009_fk_validate_and_cleanup.sql"
run_sql "${SCRIPT_DIR}/010_cli_users.sql"

if [[ "${ENV}" == "local" || "${ENV}" == "dev" ]]; then
  run_sql "${SCRIPT_DIR}/005_seed_data.sql"
else
  echo "  -- seed data skipped (ENV=${ENV})"
fi

echo ""
echo "✅ All migrations applied successfully."
