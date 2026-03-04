#!/bin/sh
# Run SQL migrations directly via psql (for use inside the migrate container)
set -e

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
PGDATABASE="${PGDATABASE:-tfsdc}"

export PGPASSWORD

echo "⏳ Waiting for PostgreSQL at ${PGHOST}:${PGPORT}..."
until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -q; do
  sleep 1
done
echo "✅ PostgreSQL ready"

MIGRATION_DIR="/migrations"

for sql_file in $(ls "$MIGRATION_DIR"/*.sql | sort); do
  echo "→ Applying $(basename "$sql_file")..."
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -f "$sql_file"
done

echo "✅ All migrations applied"
