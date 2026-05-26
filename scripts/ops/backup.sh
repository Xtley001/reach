#!/usr/bin/env bash
# REACH — DB Backup (DB-04)
# Add as a Render cron job — Schedule: "0 1 * * *" (daily 01:00 UTC = 02:00 WAT)
# Required env vars: DATABASE_URL
# Optional:          BACKUP_S3_BUCKET (aws cli must be available), or leave blank to keep local only
set -euo pipefail
TS=$(date -u +"%Y%m%d_%H%M%S")
FILE="reach_backup_${TS}.sql.gz"
TMP="/tmp/${FILE}"
[[ -z "${DATABASE_URL:-}" ]] && { echo "ERROR: DATABASE_URL not set"; exit 1; }
echo "[backup] Starting at $(date -u)"
pg_dump "$DATABASE_URL" --no-owner --no-acl --exclude-table=otp_sessions | gzip > "$TMP"
SIZE=$(du -sh "$TMP" | cut -f1)
echo "[backup] Written: $TMP ($SIZE)"
if [[ -n "${BACKUP_S3_BUCKET:-}" ]] && command -v aws &>/dev/null; then
  aws s3 cp "$TMP" "s3://${BACKUP_S3_BUCKET}/backups/${FILE}"
  echo "[backup] Uploaded to s3://${BACKUP_S3_BUCKET}/backups/${FILE}"
  rm -f "$TMP"
  exit 0
fi
echo "[backup] WARNING: No BACKUP_S3_BUCKET set — file at $TMP will be lost on Render restart."
echo "[backup] Set BACKUP_S3_BUCKET env var on Render to persist backups offsite."
