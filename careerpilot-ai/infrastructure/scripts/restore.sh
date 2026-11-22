#!/usr/bin/env bash
# Restore from a backup directory:  ./infrastructure/scripts/restore.sh backups/20261120-021500
set -euo pipefail
SRC=${1:?usage: restore.sh backups/<stamp>}
cd "$(dirname "$0")/../.."
read -r -p "This REPLACES the current database and files with $SRC. Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || { echo "aborted"; exit 1; }
docker compose stop backend celery-worker celery-beat
docker compose exec -T postgres pg_restore -U careerpilot -d careerpilot --clean --if-exists < "$SRC/db.dump"
docker compose run --rm --no-deps -v "$PWD/$SRC":/backup --entrypoint sh backend \
  -c 'rm -rf /app/storage/* && tar xzf /backup/storage.tgz -C /app'
docker compose up -d
echo "restored from $SRC"
