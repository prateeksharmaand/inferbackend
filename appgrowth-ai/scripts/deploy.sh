#!/usr/bin/env bash
# Deploy to the VPS. Steps: validate config → build web locally (the server has 1 CPU) → sync → build images on the
# server → migrate → start → health-check (containers, API, HTTPS) → report. Keeps the previous version for rollback.
# Usage: scripts/deploy.sh [--skip-web] [--seed]
source "$(dirname "$0")/common.sh"
SKIP_WEB=false; SEED=false
for a in "$@"; do case $a in --skip-web) SKIP_WEB=true ;; --seed) SEED=true ;; *) fail "unknown flag $a" ;; esac; done
VERSION=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)$(git -C "$ROOT" diff --quiet 2>/dev/null || echo -dirty)

log "1/8 validating configuration"
remote "test -f .env && test -f .env.ai" || fail ".env and .env.ai must exist in $DIR on the server (see .env.example)"
remote "grep -qE '^DATA_ENCRYPTION_KEY=[0-9a-f]{64}$' .env" || fail "DATA_ENCRYPTION_KEY missing or not 64 hex chars"
for k in JWT_ACCESS_SECRET DATABASE_URL REDIS_URL REDIS_PASSWORD AI_SERVICE_TOKEN PUBLIC_URL METRICS_TOKEN DEVICE_HASH_SALT; do remote "grep -qE '^$k=.+' .env" || fail "$k is not set in .env"; done
remote "grep -qE '^THROTTLE_DISABLED=true' .env" && fail "THROTTLE_DISABLED must not be set in production"

if [ "$SKIP_WEB" = false ]; then
  log "2/8 building web (Next.js standalone) locally"
  (cd "$ROOT/apps/web" && API_ORIGIN=http://appgrowth-api:4100 npx next build >/dev/null)
  rm -rf "$ROOT/.web-build" && mkdir -p "$ROOT/.web-build"
  cp -R "$ROOT/apps/web/.next/standalone" "$ROOT/.web-build/standalone"; cp -R "$ROOT/apps/web/.next/static" "$ROOT/.web-build/static"; cp -R "$ROOT/apps/web/public" "$ROOT/.web-build/public"
fi

log "3/8 syncing source"
ssh "$HOST" "mkdir -p $DIR/web-build $DIR/secrets $DIR/backups"
rsync -az --delete --exclude node_modules --exclude .next --exclude dist --exclude dist-seed --exclude .venv --exclude 'apps/api/storage' --exclude test-results --exclude '.env*' --exclude .web-build --exclude .git \
  "$ROOT/apps" "$ROOT/infrastructure" "$ROOT/scripts" "$ROOT/docker-compose.yml" "$ROOT/.dockerignore" "$HOST:$DIR/"
[ "$SKIP_WEB" = false ] && rsync -az --delete "$ROOT/.web-build/" "$HOST:$DIR/web-build/"
remote "$COMPOSE config -q" || fail "compose files are invalid on the server"
remote "grep '^METRICS_TOKEN=' .env | cut -d= -f2- > secrets/metrics_token && chmod 600 secrets/metrics_token .env .env.ai"

log "4/8 building images on the server (version $VERSION)"
remote "for i in api web ai; do docker image inspect appgrowth-\$i:latest >/dev/null 2>&1 && docker tag appgrowth-\$i:latest appgrowth-\$i:previous || true; done"
remote "APP_VERSION=latest nice -n 15 $COMPOSE build api ai web" >/dev/null
remote "echo $VERSION > .deployed-version"

log "5/8 running database migrations"
remote "$COMPOSE run --rm --no-deps api npx prisma migrate deploy" | tail -3
[ "$SEED" = true ] && { log "seeding reference data"; remote "$COMPOSE run --rm --no-deps api node dist-seed/prisma/seed.js" | tail -3; }

log "6/8 starting services"
remote "$COMPOSE up -d --remove-orphans api worker scheduler web ai redis" | tail -8

log "7/8 health checks"
"$ROOT/scripts/health-check.sh" || { log "health check failed — rolling back"; "$ROOT/scripts/rollback.sh"; fail "deployment of $VERSION failed and was rolled back"; }

log "8/8 deployed $VERSION to https://$DOMAIN"
