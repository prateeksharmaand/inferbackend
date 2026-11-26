#!/usr/bin/env bash
# Shared settings for the deployment scripts. Override with environment variables.
set -euo pipefail
HOST=${APPGROWTH_HOST:-root@187.127.135.184}
DIR=${APPGROWTH_DIR:-/opt/appgrowth}
DOMAIN=${APPGROWTH_DOMAIN:-marketing.noushealthcare.online}
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
COMPOSE="docker compose -p appgrowth -f docker-compose.yml -f infrastructure/vps/docker-compose.vps.yml"
remote() { ssh -o ConnectTimeout=15 "$HOST" "cd $DIR && $*"; }
log() { printf '\033[1;34m▶ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
