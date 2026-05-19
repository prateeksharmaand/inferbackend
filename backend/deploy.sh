#!/usr/bin/env bash
# deploy.sh — PHR backend deployment script
# Usage: bash deploy.sh [--skip-migrate] [--skip-restart]
# Run from repo root or backend/ directory on the server.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # backend/ dir
REPO_ROOT="$(dirname "$APP_DIR")"
ENV_FILE="$REPO_ROOT/.env"
PM2_APP_NAME="phr-backend"
NODE_ENV="${NODE_ENV:-production}"
SKIP_MIGRATE=false
SKIP_RESTART=false

for arg in "$@"; do
  case $arg in
    --skip-migrate)  SKIP_MIGRATE=true  ;;
    --skip-restart)  SKIP_RESTART=true  ;;
  esac
done

log()  { echo -e "\033[1;32m[deploy]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m   $*"; }
die()  { echo -e "\033[1;31m[error]\033[0m  $*" >&2; exit 1; }

# ── Pre-flight checks ─────────────────────────────────────────────────────────
log "Checking prerequisites..."
command -v node  >/dev/null || die "node not found"
command -v npm   >/dev/null || die "npm not found"
command -v pm2   >/dev/null || die "pm2 not found — run: npm i -g pm2"
command -v psql  >/dev/null || die "psql not found"
command -v git   >/dev/null || die "git not found"

[[ -f "$ENV_FILE" ]] || die ".env not found at $ENV_FILE — copy .env.production.example and fill in values"

# ── Pull latest code ──────────────────────────────────────────────────────────
log "Pulling latest code..."
cd "$REPO_ROOT"
git pull --ff-only origin main

# ── Install dependencies ──────────────────────────────────────────────────────
log "Installing dependencies..."
cd "$APP_DIR"
npm ci --omit=dev

# ── Run DB migrations ─────────────────────────────────────────────────────────
if [[ "$SKIP_MIGRATE" == "false" ]]; then
  log "Running database migrations..."
  cd "$APP_DIR"
  # Source .env so psql can pick up DB vars
  set -o allexport
  source "$ENV_FILE"
  set +o allexport

  PSQL_CMD="psql -v ON_ERROR_STOP=1 -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} -U ${DB_USER:-phr_user} -d ${DB_NAME:-phr_db}"

  for migration in migrations/001_initial_schema.sql \
                   migrations/002_gmail_sync.sql \
                   migrations/003_risk_predictions.sql \
                   migrations/004_abdm_m2_sessions.sql \
                   migrations/005_emr.sql; do
    if [[ -f "$migration" ]]; then
      log "  → $migration"
      PGPASSWORD="${DB_PASSWORD:-}" $PSQL_CMD -f "$migration" 2>&1 | grep -v "already exists" || true
    else
      warn "  Migration file not found, skipping: $migration"
    fi
  done
else
  warn "Skipping migrations (--skip-migrate)"
fi

# ── PM2 start / reload ────────────────────────────────────────────────────────
if [[ "$SKIP_RESTART" == "false" ]]; then
  log "Restarting application with PM2..."
  cd "$APP_DIR"

  if pm2 describe "$PM2_APP_NAME" &>/dev/null; then
    pm2 reload "$PM2_APP_NAME" --update-env
    log "Reloaded existing PM2 process '$PM2_APP_NAME'"
  else
    pm2 start server.js \
      --name "$PM2_APP_NAME" \
      --env production \
      --max-memory-restart 512M \
      --log-date-format "YYYY-MM-DD HH:mm:ss" \
      --
    log "Started new PM2 process '$PM2_APP_NAME'"
  fi

  pm2 save
else
  warn "Skipping restart (--skip-restart)"
fi

# ── Health check ──────────────────────────────────────────────────────────────
log "Waiting for server to come up..."
sleep 3
PORT="${PORT:-3000}"
if curl -sf "http://localhost:${PORT}/health" | grep -q '"status":"healthy"'; then
  log "Health check passed ✓"
else
  die "Health check failed — check: pm2 logs $PM2_APP_NAME"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
log ""
log "Deployment complete."
log "  EMR UI  → http://localhost:${PORT}/emr"
log "  API     → http://localhost:${PORT}/api"
log "  Logs    → pm2 logs $PM2_APP_NAME"
log "  Status  → pm2 status"
