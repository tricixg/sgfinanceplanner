#!/usr/bin/env bash
# Marks every migration file in supabase/migrations as already applied in the
# database's migration history (supabase_migrations.schema_migrations).
#
# It runs NO migration SQL: it only records versions. Use it only when every
# file really has been applied (e.g. you ran them in the SQL editor).
#
# Usage (from webapp/):
#   export SUPABASE_DB_URL='postgresql://...'   # Session pooler URI, password percent-encoded
#   bash scripts/mark-migrations-applied.sh            # all local files
#   bash scripts/mark-migrations-applied.sh 075 076    # only these versions
set -euo pipefail

cd "$(dirname "$0")/.."   # webapp/

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL is not set. Copy the Session pooler URI from the Supabase dashboard (Connect)." >&2
  exit 1
fi

CLI=(npx --yes supabase@2)

if [[ $# -gt 0 ]]; then
  versions=("$@")
else
  versions=()
  for f in supabase/migrations/[0-9][0-9][0-9]_*.sql; do
    name="$(basename "$f")"
    versions+=("${name%%_*}")
  done
fi

if [[ ${#versions[@]} -eq 0 ]]; then
  echo "No migration files found in supabase/migrations." >&2
  exit 1
fi

echo "Current migration history (Local vs Remote):"
"${CLI[@]}" migration list --db-url "$SUPABASE_DB_URL"

echo
echo "About to record ${#versions[@]} version(s) as APPLIED: ${versions[0]} … ${versions[${#versions[@]}-1]}"
echo "This does not run them. Only continue if they have all been applied to this database."
read -r -p "Type 'yes' to continue: " answer
if [[ "$answer" != "yes" ]]; then
  echo "Cancelled; nothing changed."
  exit 1
fi

"${CLI[@]}" migration repair --status applied "${versions[@]}" --db-url "$SUPABASE_DB_URL"

echo
echo "Updated history:"
"${CLI[@]}" migration list --db-url "$SUPABASE_DB_URL"
echo
echo "Check: 'db push --dry-run' should now report the remote database is up to date."
"${CLI[@]}" db push --dry-run --db-url "$SUPABASE_DB_URL"
