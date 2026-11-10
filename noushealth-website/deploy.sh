#!/usr/bin/env bash
# Build and publish https://noushealthcare.online
# Files are served by the shared Caddy on the VPS from /opt/sites/noushealthcare (no restart needed).
set -euo pipefail
cd "$(dirname "$0")"
npm run build
rsync -az --delete dist/ root@187.127.135.184:/opt/sites/noushealthcare/
echo "Deployed → https://noushealthcare.online"
