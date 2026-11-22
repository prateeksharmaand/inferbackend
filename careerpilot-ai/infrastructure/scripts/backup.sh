#!/usr/bin/env bash
# Nightly backup: Postgres dump + resume/document storage. Keeps 14 days.
# Cron (host):  15 2 * * *  cd /opt/careerpilot-ai && ./infrastructure/scripts/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/../.."
STAMP=$(date +%Y%m%d-%H%M%S)
DEST=backups/$STAMP
mkdir -p "$DEST"
docker compose exec -T postgres pg_dump -U careerpilot -Fc careerpilot > "$DEST/db.dump"
docker compose run --rm --no-deps -v "$PWD/$DEST":/backup --entrypoint sh backend \
  -c 'tar czf /backup/storage.tgz -C /app storage'
find backups -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
echo "backup ok: $DEST ($(du -sh "$DEST" | cut -f1))"
