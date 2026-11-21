# Deploying on a Linux VPS

Tested with Docker Engine 27+ / Compose v2. Needs ~2 GB RAM, 10 GB disk.

## 1. DNS
Create an **A record** for your subdomain (e.g. `careers.example.com`) pointing to the VPS IPv4 address
(and an AAAA record if you use IPv6). Wait until `dig +short careers.example.com` returns the IP.

## 2. Server prep
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER && newgrp docker
sudo ufw allow 22,80,443/tcp && sudo ufw enable
git clone <your repo> /opt/careerpilot-ai && cd /opt/careerpilot-ai
```

## 3. Configure
```bash
cp .env.example .env && chmod 600 .env
# Required: APP_ENV=production, DOMAIN, APP_BASE_URL=https://DOMAIN, CORS_ORIGINS=["https://DOMAIN"],
#           POSTGRES_PASSWORD, JWT_SECRET, ENCRYPTION_KEY
# Until SSL is set up (step 5) also set COOKIE_SECURE=false, then remove it.
```
If port 80/443 is already used by another proxy (e.g. Caddy) on the VPS, set `HTTP_PORT=8088` and
`HTTPS_PORT=8448` in `.env` and reverse-proxy your domain to `127.0.0.1:8088` from the existing proxy
(it then terminates TLS; keep CareerPilot on HTTP and leave `COOKIE_SECURE` unset).

## 4. Start
```bash
./infrastructure/scripts/deploy.sh     # builds images, runs migrations, starts all services, waits for health
```
Open `http://DOMAIN`, create your account, then set `ALLOW_REGISTRATION=false` and `docker compose up -d backend`.

## 5. SSL (Let's Encrypt)
```bash
docker run --rm -v careerpilot_certbot-www:/var/www/certbot -v $PWD/infrastructure/nginx/certs:/etc/letsencrypt \
  certbot/certbot certonly --webroot -w /var/www/certbot -d $DOMAIN --email you@example.com --agree-tos -n
cp infrastructure/nginx/https.conf.example infrastructure/nginx/templates/https-server.inc.template
echo 'return 301 https://$host$request_uri;' > infrastructure/nginx/templates/https-redirect.inc.template
# remove COOKIE_SECURE=false from .env
docker compose up -d && docker compose restart nginx
```
Renewal (host cron, monthly):
`0 3 1 * * cd /opt/careerpilot-ai && docker run --rm -v careerpilot_certbot-www:/var/www/certbot -v $PWD/infrastructure/nginx/certs:/etc/letsencrypt certbot/certbot renew -q && docker compose restart nginx`

## 6. Backups
```bash
./infrastructure/scripts/backup.sh                  # backups/<stamp>/db.dump + storage.tgz, 14-day retention
crontab -e  →  15 2 * * * cd /opt/careerpilot-ai && ./infrastructure/scripts/backup.sh >> backups/backup.log 2>&1
./infrastructure/scripts/restore.sh backups/<stamp> # asks for confirmation; replaces DB and files
```
Copy `backups/` off the server regularly (e.g. `rclone` to cloud storage). Resumes contain personal data.

## 7. Operations
- Logs: `docker compose logs -f backend celery-worker celery-beat`
- Health: `curl https://DOMAIN/api/health`; Settings → Integrations shows every service's state.
- Updates: `./infrastructure/scripts/deploy.sh` (migrations run automatically at backend start).
- Persistent volumes: `pgdata` (database), `storage` (resumes & generated documents), `redisdata`.

## Live instance: jobs.inferapp.online (shared VPS 187.127.135.184)
This VPS's ports 80/443 belong to the beyondlife Caddy container, so CareerPilot runs without its own nginx:
- Code + server-only `.env` in `/opt/careerpilot` (compose project `careerpilot`), using
  `infrastructure/vps/docker-compose.vps.yml`: backend and frontend join `beyondlife_default` as
  `careerpilot-api` / `careerpilot-web`; postgres/redis are `careerpilot-db` / `careerpilot-redis` (the shared
  network already has hosts called `db` and `redis`).
- Caddy site block appended to `/opt/beyondlife/deploy/Caddyfile` (`/api/*` → careerpilot-api:8000, rest →
  careerpilot-web:3000); applied with `caddy reload` (no restart). Caddy issues the TLS certificate.
- Images are built on the server. The frontend is prebuilt on a dev machine
  (`cd frontend && INTERNAL_API_URL=http://backend:8000 npm run build`) and packaged with
  `infrastructure/docker/frontend.prebuilt.Dockerfile`, so `next build` never runs on the shared 4 GB box.
- AI: `AI_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.5-flash` (same key as the Infer stack).

Redeploy:
```bash
cd frontend && INTERNAL_API_URL=http://backend:8000 npm run build && cd ..
rsync -az --partial --delete --exclude .git --exclude 'frontend/node_modules' --exclude .venv --exclude .env \
  --exclude storage --exclude backups --exclude __pycache__ --exclude frontend/.next/cache ./ root@187.127.135.184:/opt/careerpilot/
ssh root@187.127.135.184 'cd /opt/careerpilot && docker compose -p careerpilot -f docker-compose.yml \
  -f infrastructure/vps/docker-compose.vps.yml up -d --build'
```
