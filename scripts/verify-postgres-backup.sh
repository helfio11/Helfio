#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?Set DATABASE_URL to the Helfio PostgreSQL database}"
backup_file=$(mktemp "${TMPDIR:-/tmp}/helfio-backup.XXXXXX.dump")
restore_db="helfio_restore_check_$(date +%s)_$$"
cleanup() {
  dropdb --if-exists --maintenance-db "$DATABASE_URL" "$restore_db" >/dev/null 2>&1 || true
  rm -f "$backup_file"
}
trap cleanup EXIT INT TERM

pg_dump --format=custom --file="$backup_file" "$DATABASE_URL"
createdb --maintenance-db "$DATABASE_URL" "$restore_db"
restore_url=$(printf '%s' "$DATABASE_URL" | sed "s#/[A-Za-z0-9_-]*$#/$restore_db#")
pg_restore --exit-on-error --no-owner --dbname="$restore_url" "$backup_file"

count=$(psql "$restore_url" -Atc "SELECT count(*) FROM categories")
users=$(psql "$restore_url" -Atc "SELECT count(*) FROM users")
subscriptions=$(psql "$restore_url" -Atc "SELECT count(*) FROM domain_events")
printf 'backup_restore_ok categories=%s users=%s domain_events=%s\n' "$count" "$users" "$subscriptions"
