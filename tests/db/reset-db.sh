#!/usr/bin/env bash
# Recreates a local test database, applies the Supabase shim, all migrations
# and (optionally) the development seed.
#   TEST_DB_ADMIN_URL=postgres://postgres:postgres@localhost:5432 tests/db/reset-db.sh [--seed]
# Without TEST_DB_ADMIN_URL it connects as the local "postgres" OS user.
set -euo pipefail
DB="${TEST_DB_NAME:-gb_eggs_test}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
q() { # q <database> <psql args...>
  local db="$1"; shift
  if [ -n "${TEST_DB_ADMIN_URL:-}" ]; then
    psql -v ON_ERROR_STOP=1 -q -X "${TEST_DB_ADMIN_URL%/}/$db" "$@"
  else
    sudo -u postgres psql -v ON_ERROR_STOP=1 -q -X -d "$db" "$@"
  fi
}
q postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
q "$DB" -f "$ROOT/tests/db/supabase-shim.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "applying $(basename "$f")"
  q "$DB" -f "$f" >/dev/null
done
if [ "${1:-}" = "--seed" ]; then echo "seeding"; q "$DB" -f "$ROOT/supabase/seed.sql" >/dev/null; fi
echo "database $DB ready"
