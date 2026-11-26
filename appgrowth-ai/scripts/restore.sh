#!/usr/bin/env bash
# Restores an encrypted backup into a fresh database. Usage: scripts/restore.sh <STAMP> [--files] [--target-db appgrowth_restore]
# Default restores into a SEPARATE database (appgrowth_restore) so the live data is untouched; switch DATABASE_URL to promote it.
source "$(dirname "$0")/common.sh"
STAMP=${1:?usage: restore.sh <STAMP> [--files] [--target-db name]}; shift || true
FILES=false; TARGET=appgrowth_restore
while [ $# -gt 0 ]; do case $1 in --files) FILES=true ;; --target-db) TARGET=$2; shift ;; esac; shift; done
remote "set -e; sha256sum -c backups/$STAMP.sha256
  SUPER=\$(docker exec careerpilot-postgres-1 sh -c 'echo \$POSTGRES_USER')
  docker exec careerpilot-postgres-1 psql -U \$SUPER -d postgres -v ON_ERROR_STOP=1 -c \"DROP DATABASE IF EXISTS $TARGET\" -c \"CREATE DATABASE $TARGET OWNER appgrowth\"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:secrets/backup.pass -in backups/db-$STAMP.dump.enc | docker exec -i careerpilot-postgres-1 pg_restore -U \$SUPER -d $TARGET --no-owner --role=appgrowth
  docker exec careerpilot-postgres-1 psql -U \$SUPER -d $TARGET -tAc 'select count(*) from organizations'"
if $FILES; then remote "openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:secrets/backup.pass -in backups/files-$STAMP.tgz.enc | docker run --rm -i -v appgrowth_storage:/s alpine tar xzf - -C /s"; fi
echo "restored $STAMP into database $TARGET${FILES:+ (files restored into the live volume)}"
