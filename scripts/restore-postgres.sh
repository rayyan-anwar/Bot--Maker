#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_FILE:?Set BACKUP_FILE to an existing custom-format pg_dump file}"
if [[ "${CONFIRM_RESTORE:-}" != "YES" ]]; then
  echo "Refusing destructive restore. Set CONFIRM_RESTORE=YES after verifying DATABASE_URL and BACKUP_FILE." >&2
  exit 1
fi
[[ -f "$BACKUP_FILE" ]] || { echo "Backup file not found: $BACKUP_FILE" >&2; exit 1; }
command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore is required on the operator host." >&2; exit 1; }
pg_restore --clean --if-exists --no-owner --no-acl --dbname "$DATABASE_URL" "$BACKUP_FILE"
echo "Restore command completed. Run the staging smoke-test checklist before routing traffic."
