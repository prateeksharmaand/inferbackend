#!/usr/bin/env bash
# Applies pending Prisma migrations (forward-only; never resets). Takes a backup first.
source "$(dirname "$0")/common.sh"
"$(dirname "$0")/backup.sh"
remote "$COMPOSE run --rm --no-deps api npx prisma migrate status" || true
remote "$COMPOSE run --rm --no-deps api npx prisma migrate deploy"
