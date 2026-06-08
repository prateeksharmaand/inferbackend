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
LANDING_DOMAIN="inferapp.online"
OPD_DOMAIN="opd.inferapp.online"
EMR_DOMAIN="emr.inferapp.online"
BACKEND_SERVICE="backend"
NGINX_SERVICE="nginx"
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
echo -e "${GREEN}║        Infer Health Deployment        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Pre-flight checks ─────────────────────────────────────────────────────────
log "Pre-flight checks..."
command -v docker >/dev/null 2>&1 || err "docker is not installed"
command -v git    >/dev/null 2>&1 || err "git is not installed"
command -v curl   >/dev/null 2>&1 || err "curl is not installed"

[ -f ".env" ]              || err ".env not found — copy .env.example and fill in values"
[ -f "docker-compose.yml" ] || err "docker-compose.yml not found — run from repo root"
[ -f "web/index.html" ]    || err "web/index.html not found — landing page missing"
[ -f "nginx/nginx.conf" ]  || err "nginx/nginx.conf not found"

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
for migration in backend/src/db/migrations/*.sql; do
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
log "Building Docker images${NO_CACHE:+ (no cache)}..."
docker compose build $NO_CACHE "$BACKEND_SERVICE" "$NGINX_SERVICE"
info "Image build: ✓"

# ── Restart backend and nginx ──────────────────────────────────────────────────
log "Restarting backend container..."
docker compose up -d --no-deps "$BACKEND_SERVICE"
info "Container started"

# ── Reload nginx (picks up config changes + new web/ files, zero downtime) ────
log "Reloading nginx..."

# `docker compose ps -q` returns the container ID if the service exists;
# `docker inspect` then confirms it is actually running.
# Avoids --status flag which requires Docker Compose v2.1+.
_NGINX_ID=$(docker compose ps -q "$NGINX_SERVICE" 2>/dev/null || true)
_NGINX_UP=false
if [ -n "$_NGINX_ID" ]; then
  _STATE=$(docker inspect -f '{{.State.Running}}' "$_NGINX_ID" 2>/dev/null || echo "false")
  [ "$_STATE" = "true" ] && _NGINX_UP=true
fi

docker compose up -d --no-deps "$NGINX_SERVICE"
sleep 3
info "Nginx restarted: ✓"

# ── Health check: API ──────────────────────────────────────────────────────────
log "Waiting for backend to respond at https://$DOMAIN/health ..."
MAX=40; ATTEMPT=0
until curl -sf "https://$DOMAIN/health" > /dev/null 2>&1; do
  ATTEMPT=$((ATTEMPT+1))
  [ $ATTEMPT -ge $MAX ] && err "Backend did not respond after $((MAX*3))s — check logs with: docker logs phr_backend"
  echo -n "."
  sleep 3
done
echo ""
HEALTH=$(curl -sf "https://$DOMAIN/health")
info "Health response: $HEALTH"

# ── Health check: Landing page ─────────────────────────────────────────────────
log "Checking landing page at https://$LANDING_DOMAIN ..."
if curl -sf --max-time 10 "https://$LANDING_DOMAIN" > /dev/null 2>&1; then
  info "Landing page: ✓  https://$LANDING_DOMAIN"
else
  warn "Landing page did not respond — check SSL cert for $LANDING_DOMAIN"
fi

# ── Health check: OPD + EMR portals ────────────────────────────────────────────
for SUBDOMAIN in "$OPD_DOMAIN" "$EMR_DOMAIN"; do
  if curl -sf --max-time 10 "https://$SUBDOMAIN" > /dev/null 2>&1; then
    info "$SUBDOMAIN: ✓"
  else
    warn "$SUBDOMAIN did not respond — SSL cert may be missing for this subdomain"
    warn "Run: certbot certonly --nginx -d $SUBDOMAIN"
  fi
done

# ── Sales Agent: install deps + start ─────────────────────────────────────────
log "Setting up sales agent..."
AGENT_DIR="$(pwd)/sales-agent"

if [ -d "$AGENT_DIR" ]; then
  if ! command -v python3 >/dev/null 2>&1; then
    warn "python3 not found — installing..."
    apt-get install -y python3 python3-pip python3-venv >/dev/null 2>&1 || warn "Could not install python3 — install manually"
  fi

  if [ ! -d "$AGENT_DIR/venv" ]; then
    info "Creating Python virtual environment..."
    python3 -m venv "$AGENT_DIR/venv"
  fi

  info "Installing sales agent dependencies..."
  "$AGENT_DIR/venv/bin/pip" install -q -r "$AGENT_DIR/requirements.txt"
  info "Dependencies installed: ✓"

  if [ ! -f "$AGENT_DIR/.env" ]; then
    warn "sales-agent/.env not found — agent will not run"
    warn "Copy sales-agent/.env.example to sales-agent/.env and fill in GROQ_API_KEY and GOOGLE_SHEET_ID"
  else
    info "sales-agent/.env: ✓"

    # Install cron job if not already present (runs daily at 9am)
    CRON_JOB="0 9 * * * cd $AGENT_DIR && ./venv/bin/python agent.py >> $AGENT_DIR/agent.log 2>&1"
    if ! crontab -l 2>/dev/null | grep -qF "sales-agent"; then
      (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
      info "Cron job added: runs daily at 9:00 AM ✓"
    else
      info "Cron job already set up: ✓"
    fi

    # Run agent once now
    info "Running sales agent (first run)..."
    cd "$AGENT_DIR" && ./venv/bin/python agent.py && cd - > /dev/null
    info "Sales agent run complete: ✓"
  fi
else
  warn "sales-agent/ directory not found — skipping"
fi

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
info "Landing:  https://$LANDING_DOMAIN"
info "API:      https://$DOMAIN"
info "OPD:      https://$OPD_DOMAIN"
info "EMR:      https://$EMR_DOMAIN"
info "Health:   https://$DOMAIN/health"
info "Commit:   $(git log -1 --format='%h — %s')"
echo ""
info "To watch live logs:  docker compose logs -f backend"
info "To watch nginx logs: docker compose logs -f nginx"
info "To rollback:         git revert HEAD && bash deployment.sh"
info "Agent logs:          tail -f sales-agent/agent.log"
info "Run agent manually:  cd sales-agent && ./venv/bin/python agent.py"
echo ""
