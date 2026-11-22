#!/usr/bin/env bash
# Repeatable deploy on the VPS:  ./infrastructure/scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo ".env missing — copy .env.example and fill it in"; exit 1; }
git pull --ff-only
docker compose build
docker compose up -d --remove-orphans      # backend runs `alembic upgrade head` on start
docker compose ps
for i in $(seq 1 30); do
  if docker compose exec -T backend curl -fsS http://localhost:8000/api/health >/dev/null 2>&1; then echo "healthy"; exit 0; fi
  sleep 2
done
echo "backend not healthy"; docker compose logs --tail 50 backend; exit 1
