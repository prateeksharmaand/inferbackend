#!/usr/bin/env bash
# deploy.sh — PHR backend deployment (Docker Compose)
# Run from the repo root on the server: bash backend/deploy.sh
# Flags:
#   --skip-migrate   skip running SQL migrations
#   --skip-rebuild   only restart containers, don't docker-compose build
#   --reset-db       wipe the postgres volume and start fresh (DESTROYS ALL DATA)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
SKIP_MIGRATE=false
SKIP_REBUILD=false
RESET_DB=false

for arg in "$@"; do
  case $arg in
    --skip-migrate)  SKIP_MIGRATE=true  ;;
    --skip-rebuild)  SKIP_REBUILD=true  ;;
    --reset-db)      RESET_DB=true      ;;
  esac
done

log()  { echo -e "\033[1;32m[deploy]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m   $*"; }
die()  { echo -e "\033[1;31m[error]\033[0m  $*" >&2; exit 1; }

# ── Pre-flight ────────────────────────────────────────────────────────────────
command -v docker >/dev/null || die "docker not found"
docker compose version >/dev/null 2>&1 || \
  command -v docker-compose >/dev/null 2>&1 || die "docker compose not found"
[[ -f "$ENV_FILE" ]] || die ".env not found at $ENV_FILE"

DC="docker compose"
docker compose version >/dev/null 2>&1 || DC="docker-compose"

# ── Pull latest code ──────────────────────────────────────────────────────────
log "Pulling latest code..."
cd "$REPO_ROOT"
git pull --ff-only origin main

# ── Reset DB (wipe postgres volume) ──────────────────────────────────────────
if [[ "$RESET_DB" == "true" ]]; then
  warn "⚠️  Resetting database — ALL DATA WILL BE LOST"
  $DC down -v
  log "Postgres volume removed. Starting fresh postgres..."
  $DC up -d postgres
  log "Waiting for postgres to initialize (20s)..."
  sleep 20
  SKIP_REBUILD=false   # must rebuild after down -v
fi

# ── Rebuild + restart backend ─────────────────────────────────────────────────
cd "$REPO_ROOT"
if [[ "$SKIP_REBUILD" == "false" ]]; then
  log "Building backend image..."
  $DC build backend
fi

log "Starting / restarting containers..."
$DC up -d --no-deps backend
$DC exec -T nginx nginx -s reload 2>/dev/null || $DC restart nginx

# ── Run DB migrations ─────────────────────────────────────────────────────────
if [[ "$SKIP_MIGRATE" == "false" ]]; then
  log "Running database migrations..."
  source "$ENV_FILE" 2>/dev/null || true

  # Wait for postgres to be ready
  for i in {1..20}; do
    $DC exec -T postgres pg_isready -U "${DB_USER:-phr_user}" -q 2>/dev/null && break
    [[ $i -eq 20 ]] && die "Postgres not ready after 40s"
    sleep 2
  done

  for migration in \
      backend/migrations/001_initial_schema.sql \
      backend/migrations/002_gmail_sync.sql \
      backend/migrations/003_risk_predictions.sql \
      backend/migrations/004_abdm_m2_sessions.sql \
      backend/migrations/005_emr.sql \
      backend/migrations/006_schema_reconciliation.sql; do

    if [[ -f "$REPO_ROOT/$migration" ]]; then
      log "  → $migration"
      $DC exec -T postgres psql \
        -U "${DB_USER:-phr_user}" \
        -d "${DB_NAME:-phr_db}" \
        --set ON_ERROR_STOP=off \
        -f "/dev/stdin" \
        < "$REPO_ROOT/$migration" 2>&1 \
        | grep -Ev "already exists|skipping" || true
    else
      warn "  Not found, skipping: $migration"
    fi
  done
else
  warn "Skipping migrations (--skip-migrate)"
fi

# ── Health check ──────────────────────────────────────────────────────────────
log "Waiting for backend to be healthy..."
for i in {1..15}; do
  if $DC exec -T backend wget -qO- http://localhost:3000/health 2>/dev/null | grep -q '"status"'; then
    log "Health check passed ✓"
    break
  fi
  [[ $i -eq 15 ]] && die "Backend not healthy — check: $DC logs backend"
  sleep 2
done

# ── Done ──────────────────────────────────────────────────────────────────────
log ""
log "Deployment complete."
log "  EMR UI  → https://api.inferapp.online/emr"
log "  API     → https://api.inferapp.online/api"
log "  Logs    → $DC logs -f backend"
