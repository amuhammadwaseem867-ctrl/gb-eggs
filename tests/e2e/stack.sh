#!/usr/bin/env bash
# Local Supabase-compatible stack for end-to-end testing without the Supabase
# CLI: PostgreSQL (host) + GoTrue (auth) + PostgREST (API) in Docker + a tiny
# Node gateway. Usage: tests/e2e/stack.sh up|down
# Requires: local PostgreSQL superuser at $PG_ADMIN_URL, Docker.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
DB="${E2E_DB:-gb_eggs_e2e}"
PG_ADMIN_URL="${PG_ADMIN_URL:-postgres://postgres:postgres@127.0.0.1:5432}"
export JWT_SECRET="${JWT_SECRET:-local-e2e-jwt-secret-with-at-least-32-characters}"
PW="${E2E_ROLE_PASSWORD:-e2e-password}"
psqlq() { psql -v ON_ERROR_STOP=1 -q -X "$PG_ADMIN_URL/$1" "${@:2}"; }

down() {
  docker rm -f gb-auth gb-rest >/dev/null 2>&1 || true
  [ -f "$HERE/.gateway.pid" ] && kill "$(cat "$HERE/.gateway.pid")" 2>/dev/null || true
  rm -f "$HERE/.gateway.pid"
}

up() {
  down
  psqlq postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
  psqlq "$DB" <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin login createrole; end if;
end \$\$;
alter role authenticator password '$PW';
alter role supabase_auth_admin password '$PW';
grant anon, authenticated, service_role to authenticator;
create schema if not exists auth authorization supabase_auth_admin;
grant create on database $DB to supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;
SQL
  docker run -d --name gb-auth --network host \
    -e GOTRUE_API_HOST=127.0.0.1 -e PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 \
    -e GOTRUE_DB_DRIVER=postgres -e "DATABASE_URL=postgres://supabase_auth_admin:$PW@127.0.0.1:5432/$DB?search_path=auth" \
    -e GOTRUE_SITE_URL=http://127.0.0.1:3000 -e GOTRUE_JWT_SECRET="$JWT_SECRET" -e GOTRUE_JWT_EXP=3600 \
    -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
    -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
    public.ecr.aws/supabase/gotrue:v2.177.0 >/dev/null
  for i in $(seq 1 60); do curl -fsS http://127.0.0.1:9999/health >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS http://127.0.0.1:9999/health >/dev/null || { docker logs gb-auth | tail -30; exit 1; }
  # Supabase grants these by default.
  psqlq "$DB" -c "grant usage on schema auth to anon, authenticated, service_role" \
              -c "grant execute on all functions in schema auth to anon, authenticated, service_role"
  for f in "$ROOT"/supabase/migrations/*.sql; do psqlq "$DB" -f "$f" >/dev/null; done
  docker run -d --name gb-rest --network host \
    -e "PGRST_DB_URI=postgres://authenticator:$PW@127.0.0.1:5432/$DB" -e PGRST_DB_SCHEMAS=public \
    -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" -e PGRST_SERVER_PORT=3001 \
    -e PGRST_DB_MAX_ROWS=1000 postgrest/postgrest:v13.0.4 >/dev/null
  for i in $(seq 1 30); do curl -fsS http://127.0.0.1:3001/ >/dev/null 2>&1 && break; sleep 1; done
  nohup node "$HERE/gateway.mjs" > "$HERE/.gateway.log" 2>&1 &
  echo $! > "$HERE/.gateway.pid"
  sleep 1
  node "$HERE/jwt.mjs" > "$HERE/.keys"
  echo "stack up: http://127.0.0.1:54321  (keys in tests/e2e/.keys)"
}

case "${1:-up}" in up) up ;; down) down ;; *) echo "usage: $0 up|down"; exit 1 ;; esac
