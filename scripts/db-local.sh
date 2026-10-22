#!/usr/bin/env bash
# Local database helper (plain Postgres, no Docker needed).
#   scripts/db-local.sh reset   -> fresh database with the migrations and sample data
#   scripts/db-local.sh test    -> fresh database with the migrations, then the rule tests
# Uses PGHOST/PGPORT/PGUSER (defaults: localhost:54322, postgres) and database "upnext".
set -euo pipefail
cd "$(dirname "$0")/.."

export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-54322}" PGUSER="${PGUSER:-postgres}"
DB="${PGDATABASE_LOCAL:-upnext}"

fresh() {
  psql -q -d postgres -c "drop database if exists $1 with (force)" -c "create database $1"
  psql -q -v ON_ERROR_STOP=1 -d "$1" -f db/dev/stub-supabase.sql
  for f in supabase/migrations/*.sql; do
    psql -q -v ON_ERROR_STOP=1 -d "$1" -f "$f"
  done
}

case "${1:-}" in
  reset)
    fresh "$DB"
    psql -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB" -f db/dev/seed.sql && echo "sample data loaded"
    ;;
  test)
    fresh "${DB}_test"
    psql -q -t -o /dev/null -v ON_ERROR_STOP=1 -d "${DB}_test" -f db/tests/rules.sql 2>&1 \
      | sed -n 's/^.*NOTICE:  //p; /PASSED/p; /ERROR/p'
    ;;
  *)
    echo "usage: $0 reset|test" >&2
    exit 1
    ;;
esac
