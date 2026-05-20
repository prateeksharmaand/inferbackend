#!/usr/bin/env bash
# deploy.sh — PHR backend deployment (Docker Compose)
# Run from the repo root: bash backend/deploy.sh
# Flags:
#   --skip-rebuild   don't rebuild docker image
#   --skip-migrate   skip all migrations
#   --reset-db       wipe postgres volume (DESTROYS ALL DATA)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
SKIP_REBUILD=false
SKIP_MIGRATE=false
RESET_DB=false

for arg in "$@"; do
  case $arg in
    --skip-rebuild) SKIP_REBUILD=true ;;
    --skip-migrate) SKIP_MIGRATE=true ;;
    --reset-db)     RESET_DB=true     ;;
  esac
done

log()  { echo -e "\033[1;32m[deploy]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m   $*"; }
die()  { echo -e "\033[1;31m[error]\033[0m  $*" >&2; exit 1; }

command -v docker >/dev/null || die "docker not found"
docker compose version >/dev/null 2>&1 || \
  command -v docker-compose >/dev/null 2>&1 || die "docker compose not found"
[[ -f "$ENV_FILE" ]] || die ".env not found at $ENV_FILE"
DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"

# ── Pull latest code ──────────────────────────────────────────────────────────
log "Pulling latest code..."
cd "$REPO_ROOT"
git pull --ff-only origin main

# ── Reset DB ──────────────────────────────────────────────────────────────────
if [[ "$RESET_DB" == "true" ]]; then
  warn "⚠️  Wiping database volume — ALL DATA WILL BE LOST"
  $DC down -v
  SKIP_REBUILD=false
fi

# ── Build image ───────────────────────────────────────────────────────────────
if [[ "$SKIP_REBUILD" == "false" ]]; then
  log "Building backend image..."
  $DC build backend
fi

# ── STEP 1: Run cleanup migration (006) BEFORE backend starts ─────────────────
# Stop backend first so the crash loop doesn't interfere with the migration.
log "Stopping backend for schema cleanup..."
$DC stop backend 2>/dev/null || true

if [[ "$SKIP_MIGRATE" == "false" ]]; then
  log "Starting postgres..."
  $DC up -d postgres
  log "Waiting for postgres..."
  for i in {1..20}; do
    $DC exec -T postgres pg_isready -U "${DB_USER:-phr_user}" -q 2>/dev/null && break
    [[ $i -eq 20 ]] && die "Postgres not ready after 40s"
    sleep 2
  done

  log "  → backend/migrations/006_schema_reconciliation.sql"
  source "$ENV_FILE" 2>/dev/null || true
  $DC exec -T postgres psql \
    -U "${DB_USER:-phr_user}" \
    -d "${DB_NAME:-phr_db}" \
    --set ON_ERROR_STOP=off \
    -f "/dev/stdin" \
    < "$REPO_ROOT/backend/migrations/006_schema_reconciliation.sql" 2>&1 \
    | grep -Ev "does not exist|skipping" || true
fi

# ── STEP 2: Start backend (database.js initializes correct schema) ─────────────
log "Starting backend..."
$DC up -d --no-deps backend
$DC exec -T nginx nginx -s reload 2>/dev/null || $DC restart nginx

log "Waiting for backend to be healthy..."
for i in {1..20}; do
  if $DC exec -T backend node -e \
    "require('http').get('http://localhost:3000/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))" \
    2>/dev/null; then
    log "Health check passed ✓"
    break
  fi
  [[ $i -eq 20 ]] && die "Backend not healthy — check: $DC logs backend"
  sleep 3
done

# ── STEP 3: Run incremental migrations (users table now exists) ───────────────
if [[ "$SKIP_MIGRATE" == "false" ]]; then
  log "Running incremental migrations..."
  for migration in \
      backend/migrations/002_gmail_sync.sql \
      backend/migrations/003_risk_predictions.sql \
      backend/migrations/004_abdm_m2_sessions.sql \
      backend/migrations/005_emr.sql \
      backend/migrations/007_emr_full.sql; do

    if [[ -f "$REPO_ROOT/$migration" ]]; then
      log "  → $migration"
      $DC exec -T postgres psql \
        -U "${DB_USER:-phr_user}" \
        -d "${DB_NAME:-phr_db}" \
        --set ON_ERROR_STOP=off \
        -f "/dev/stdin" \
        < "$REPO_ROOT/$migration" 2>&1 \
        | grep -Ev "already exists|skipping" || true
    fi
  done
fi

# ── Done ──────────────────────────────────────────────────────────────────────
log ""
log "Deployment complete."
log "  EMR UI  → https://api.inferapp.online/emr"
log "  API     → https://api.inferapp.online/api"
log "  Logs    → $DC logs -f backend"
log ""
log "First-time EMR setup:"
log "  Register clinic: POST https://api.inferapp.online/api/emr/auth/register-clinic"
log "  { clinic_name, admin_email, admin_password }"
