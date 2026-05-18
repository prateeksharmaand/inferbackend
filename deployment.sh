#!/usr/bin/env bash
# deployment.sh — Regular deployments after the server is already running.
# (Use deploy.sh only for the very first setup / SSL cert issuance.)
#
# Usage:
#   bash deployment.sh              # pull → migrate → rebuild → restart
#   bash deployment.sh --skip-pull  # skip git pull (useful if you pushed manually)
#   bash deployment.sh --no-cache   # force Docker layer cache bust

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
DOMAIN="api.inferapp.online"
BACKEND_SERVICE="backend"
POSTGRES_SERVICE="postgres"
DB_NAME="phr_db"
DB_USER="phr_user"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}==> ${NC}$*"; }
info() { echo -e "${CYAN}    ${NC}$*"; }
warn() { echo -e "${YELLOW}[WARN] ${NC}$*"; }
err()  { echo -e "${RED}[ERROR] ${NC}$*"; exit 1; }

# ── Args ──────────────────────────────────────────────────────────────────────
SKIP_PULL=false
NO_CACHE=""
for arg in "$@"; do
  case $arg in
    --skip-pull) SKIP_PULL=true ;;
    --no-cache)  NO_CACHE="--no-cache" ;;
  esac
done

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       PHR Backend Deployment         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Pre-flight checks ─────────────────────────────────────────────────────────
log "Pre-flight checks..."
command -v docker >/dev/null 2>&1 || err "docker is not installed"
command -v git    >/dev/null 2>&1 || err "git is not installed"
command -v curl   >/dev/null 2>&1 || err "curl is not installed"

[ -f ".env" ]              || err ".env not found — copy .env.example and fill in values"
[ -f "docker-compose.yml" ] || err "docker-compose.yml not found — run from repo root"

# Check required Gmail env vars and warn (soft — does not abort)
log "Checking environment variables..."
MISSING_VARS=()
for var in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REDIRECT_URI; do
  if ! grep -qE "^${var}=.+" .env 2>/dev/null; then
    MISSING_VARS+=("$var")
  fi
done
if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  for v in "${MISSING_VARS[@]}"; do
    warn "$v is missing from .env — Gmail sync will be disabled"
  done
  warn "Add these vars to .env when you have your Google OAuth credentials."
else
  info "Gmail env vars: ✓"
fi

# ── Git pull ──────────────────────────────────────────────────────────────────
if [ "$SKIP_PULL" = false ]; then
  log "Pulling latest code from origin/main..."
  git pull origin main
  info "Commit: $(git log -1 --format='%h — %s (%ar)')"
else
  info "Skipping git pull (--skip-pull)"
  info "Commit: $(git log -1 --format='%h — %s')"
fi

# ── Ensure postgres is running ────────────────────────────────────────────────
log "Ensuring postgres is up and healthy..."
docker compose up -d "$POSTGRES_SERVICE"

RETRIES=0
until docker compose exec -T "$POSTGRES_SERVICE" pg_isready -U "$DB_USER" -d "$DB_NAME" -q 2>/dev/null; do
  RETRIES=$((RETRIES+1))
  [ $RETRIES -ge 20 ] && err "Postgres did not become ready in time"
  echo -n "."
  sleep 2
done
echo ""
info "Postgres: ✓"

# ── Run all migrations (idempotent — safe to re-run) ──────────────────────────
log "Running database migrations..."
MIGRATION_COUNT=0
for migration in migrations/*.sql; do
  [ -f "$migration" ] || continue
  info "Applying: $migration"
  docker compose exec -T "$POSTGRES_SERVICE" \
    psql -U "$DB_USER" -d "$DB_NAME" -q < "$migration" \
    && info "  ✓ $migration" \
    || warn "  ⚠  $migration had warnings (may already be applied — that's fine)"
  MIGRATION_COUNT=$((MIGRATION_COUNT+1))
done
info "Total migrations applied: $MIGRATION_COUNT"

# ── Build backend image ───────────────────────────────────────────────────────
log "Building backend Docker image${NO_CACHE:+ (no cache)}..."
docker compose build $NO_CACHE "$BACKEND_SERVICE"
info "Image build: ✓"

# ── Restart only the backend (zero postgres/nginx downtime) ───────────────────
log "Restarting backend container..."
docker compose up -d --no-deps "$BACKEND_SERVICE"
info "Container started"

# ── Health check ──────────────────────────────────────────────────────────────
log "Waiting for backend to respond at https://$DOMAIN/health ..."
MAX=20; ATTEMPT=0
until curl -sf "https://$DOMAIN/health" > /dev/null 2>&1; do
  ATTEMPT=$((ATTEMPT+1))
  [ $ATTEMPT -ge $MAX ] && err "Backend did not respond after $((MAX*3))s — check logs below"
  echo -n "."
  sleep 3
done
echo ""
HEALTH=$(curl -sf "https://$DOMAIN/health")
info "Health response: $HEALTH"

# ── Tail recent logs ──────────────────────────────────────────────────────────
log "Recent backend logs (last 30 lines):"
echo "────────────────────────────────────────"
docker compose logs --tail=30 "$BACKEND_SERVICE"
echo "────────────────────────────────────────"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅  Deployment complete!            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
info "API:    https://$DOMAIN"
info "Health: https://$DOMAIN/health"
info "Commit: $(git log -1 --format='%h — %s')"
echo ""
info "To watch live logs:  docker compose logs -f backend"
info "To rollback:         git revert HEAD && bash deployment.sh"
echo ""
