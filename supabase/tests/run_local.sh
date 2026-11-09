#!/usr/bin/env bash
# Build a throwaway TEST database from every migration, load both manuals and the KJV with the
# bundle's loader, and run all database checks. It DROPS and recreates the database it is given.
#
#   PGBIN=/path/to/postgres/bin BUNDLE=/path/to/rhemlo PGPORT=54329 supabase/tests/run_local.sh rhemlo_test
#
# PGBIN    folder with psql, createdb, dropdb (optional if they are on PATH)
# BUNDLE   the Rhemlo bundle folder (it holds src/rhemlo, manuals/ and bible/), for loading content
set -euo pipefail
DB="${1:?usage: supabase/tests/run_local.sh <test database name>}"
case "$DB" in *test*) ;; *) echo "refusing: the database name must contain 'test'"; exit 1;; esac
: "${BUNDLE:?set BUNDLE to the Rhemlo bundle folder}"
bin() { if [ -n "${PGBIN:-}" ]; then echo "$PGBIN/$1"; else echo "$1"; fi; }
export PGCLIENTENCODING=UTF8
here="$(cd "$(dirname "$0")/.." && pwd)"

"$(bin dropdb)" --if-exists "$DB"
# Supabase databases use a UTF-8 locale; marking depends on it (letters such as ē)
"$(bin createdb)" -T template0 -E UTF8 --locale="${PGLOCALE:-en-US}" "$DB"
psql_() { "$(bin psql)" -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
psql_ -f "$here/tests/supabase_stub.sql" >/dev/null
for f in "$here"/migrations/0*.sql; do echo "migrate $(basename "$f")"; psql_ -f "$f" >/dev/null; done

export DATABASE_URL="postgresql://${PGUSER:-postgres}@${PGHOST:-127.0.0.1}:${PGPORT:-5432}/$DB"
( cd "$BUNDLE" && export PYTHONPATH=src PYTHONUTF8=1
  for m in EN2627 AD2627; do for c in load load-items publish; do python -m rhemlo.cli "$c" --manual "manuals/$m" >/dev/null; done; done
  python -m rhemlo.cli load-bible >/dev/null )
echo "content loaded"

for t in behaviour_test community_test app_api_test; do
  echo "== $t"
  "$(bin psql)" -v ON_ERROR_STOP=1 -d "$DB" -f "$here/tests/$t.sql" | grep -E "PASS|ALL" | tail -n 4
done

# the app's live adapters against this database (needs Bun)
if command -v bun >/dev/null; then
  echo "== live_contract"
  TEST_DB="$DATABASE_URL" bun "$here/tests/live_contract.ts" | tail -n 2
fi
