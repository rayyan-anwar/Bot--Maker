#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump is required on the operator host." >&2; exit 1; }
umask 077
backup_dir="${BOTFORGE_BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$backup_dir/botforge-$timestamp.dump"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file "$output"
chmod 600 "$output"
echo "Backup created: $output"
