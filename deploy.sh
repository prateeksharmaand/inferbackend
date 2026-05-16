#!/usr/bin/env bash
# Run this ONCE on the VPS after cloning the repo.
# Usage: bash deploy.sh

set -e

DOMAIN="api.inferapp.online"
EMAIL="prateek.sharma6@globallogic.com"

echo "==> Pulling latest images and building..."
docker compose pull --ignore-pull-failures
docker compose build --no-cache backend

echo "==> Starting services (HTTP only for cert issuance)..."
# Temporarily use a minimal nginx that only serves port 80 for certbot challenge
docker compose up -d postgres backend

echo "==> Requesting Let's Encrypt certificate..."
docker run --rm \
  -v "$(pwd)/nginx/ssl:/etc/letsencrypt" \
  -v "$(pwd)/nginx/ssl:/var/lib/letsencrypt" \
  -p 80:80 \
  certbot/certbot certonly \
    --standalone \
    --agree-tos \
    --no-eff-email \
    -m "$EMAIL" \
    -d "$DOMAIN"

echo "==> Copying certs to nginx/ssl/..."
cp "$(pwd)/nginx/ssl/live/$DOMAIN/fullchain.pem" nginx/ssl/fullchain.pem
cp "$(pwd)/nginx/ssl/live/$DOMAIN/privkey.pem"   nginx/ssl/privkey.pem

echo "==> Starting nginx with SSL..."
docker compose up -d nginx

echo "==> Done. Test with: curl https://$DOMAIN/health"
