#!/usr/bin/env bash
# Deploy the Infer stack to the shared VPS from this repo (run on your Mac, from anywhere).
#
#   deploy-vps/deploy.sh            # everything: backend + OPD app + EMR tool + landing page
#   deploy-vps/deploy.sh backend    # only the API (rebuild + restart container)
#   deploy-vps/deploy.sh opd        # only the OPD React app (built on the VPS)
#   deploy-vps/deploy.sh static     # only landing page (web/) + EMR tool (backend/public/emr)
#
# Layout on the VPS (see deploy-vps/docker-compose.yml):
#   /opt/inferapp/               compose project "inferapp" (api + postgres), .env with secrets
#   /opt/inferapp/src/backend    backend source the api image is built from
#   /opt/inferapp/src/emr-web    OPD app source, built in a node:20 container
#   /opt/sites/inferapp          landing page      -> inferapp.online, inferapp.noushealthcare.online
#   /opt/sites/inferapp-opd      OPD app (dist)    -> opd.inferapp.online, opd.inferapp.noushealthcare.online
#   /opt/sites/inferapp-emr      EMR tool          -> emr.inferapp.online, emr.inferapp.noushealthcare.online
# Static files are served by the shared Caddy (/opt/beyondlife/deploy/Caddyfile); no restart needed.
# The database and /opt/inferapp/.env are never touched by this script.
set -euo pipefail

VPS="${VPS:-root@187.127.135.184}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
WHAT="${1:-all}"

log() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }

deploy_backend() {
  log "Backend: syncing source"
  rsync -az --delete \
    --exclude node_modules --exclude uploads --exclude logs --exclude .env --exclude emr-web --exclude tests \
    "$REPO/backend/" "$VPS:/opt/inferapp/src/backend/"
  rsync -az "$REPO/deploy-vps/docker-compose.yml" "$REPO/deploy-vps/seed-clinic-defaults.sql" "$VPS:/opt/inferapp/"
  rsync -az "$REPO/deploy-vps/initdb/" "$VPS:/opt/inferapp/initdb/"

  log "Backend: building image and restarting api (database keeps running)"
  ssh "$VPS" 'set -e; cd /opt/inferapp
    docker compose build api 2>&1 | tail -1
    docker compose up -d api 2>&1 | tail -1
    for i in $(seq 1 40); do
      s=$(docker inspect -f "{{.State.Health.Status}}" inferapp-api-1 2>/dev/null || echo starting)
      [ "$s" = healthy ] && break; sleep 3
    done
    echo "api: $s"
    [ "$s" = healthy ] || { docker compose logs --tail 40 api; exit 1; }'
}

deploy_opd() {
  log "OPD app: syncing source"
  rsync -az --delete --exclude node_modules --exclude dist "$REPO/emr-web/" "$VPS:/opt/inferapp/src/emr-web/"

  log "OPD app: building on the VPS (node:20-alpine) and publishing"
  ssh "$VPS" 'set -e; cd /opt/inferapp/src/emr-web
    docker run --rm -v "$PWD":/build -w /build node:20-alpine \
      sh -c "npm install --legacy-peer-deps --no-audit --no-fund >/dev/null 2>&1 && npm run build 2>&1 | tail -2"
    test -f dist/index.html
    rsync -a --delete dist/ /opt/sites/inferapp-opd/
    echo "published $(grep -oE "assets/index-[^\"]+\.js" /opt/sites/inferapp-opd/index.html)"'
}

deploy_static() {
  log "Landing page (web/) and EMR tool (backend/public/emr)"
  rsync -az --delete "$REPO/web/" "$VPS:/opt/sites/inferapp/"
  rsync -az --delete "$REPO/backend/public/emr/" "$VPS:/opt/sites/inferapp-emr/"
}

check() {
  log "Smoke check"
  for u in https://api.inferapp.online/health \
           https://opd.inferapp.online/opd/ \
           https://emr.inferapp.online/ \
           https://inferapp.online/; do
    printf '  %s  %s\n' "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$u")" "$u"
  done
}

case "$WHAT" in
  all)     deploy_backend; deploy_opd; deploy_static ;;
  backend) deploy_backend ;;
  opd)     deploy_opd ;;
  static)  deploy_static ;;
  *) echo "usage: $0 [all|backend|opd|static]"; exit 2 ;;
esac
check
