#!/usr/bin/env bash
# Encrypted backup of the database and uploaded files. Keeps 14 days on the server.
# Requires BACKUP_PASSPHRASE_FILE on the server (default $DIR/secrets/backup.pass, 0600). Copy backups off-site.
source "$(dirname "$0")/common.sh"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
remote "set -e; PASS=secrets/backup.pass; test -s \$PASS || { echo 'missing secrets/backup.pass'; exit 1; }
  DB=\$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/?.*//')
  docker exec careerpilot-postgres-1 pg_dump --no-owner --format=custom \"\$DB\" | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass file:\$PASS -out backups/db-$STAMP.dump.enc
  docker run --rm -v appgrowth_storage:/s:ro alpine tar czf - -C /s . | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass file:\$PASS -out backups/files-$STAMP.tgz.enc
  sha256sum backups/*-$STAMP.* > backups/$STAMP.sha256
  find backups -type f -mtime +14 -delete
  ls -lh backups | tail -4"
echo "backup $STAMP done — copy $DIR/backups off the server (e.g. scripts/backup.sh && rsync $HOST:$DIR/backups/ ./backups/)"
