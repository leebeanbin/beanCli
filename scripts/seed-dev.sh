#!/usr/bin/env bash
# =============================================================
# seed-dev.sh — Apply dev seed data to your local PostgreSQL
#
# Uses DATABASE_URL from .env (or env var) so no Docker needed.
# Run:  pnpm db:seed
# =============================================================

set -euo pipefail

SEED_FILE="$(cd "$(dirname "$0")/.." && pwd)/packages/sql/migrations/005_seed_data.sql"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "✗  DATABASE_URL is not set."
  echo "   Copy .env.example → .env and set DATABASE_URL."
  exit 1
fi

if ! command -v psql &>/dev/null; then
  echo "✗  psql not found. Install postgresql-client and retry."
  exit 1
fi

echo "Seeding dev data into: $DATABASE_URL"
echo ""
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SEED_FILE" -q

echo ""
echo "✅ Dev seed data applied (state_users, state_products, state_orders, state_payments, state_shipments)"
