# VPS deployment

## Target
`marketing.noushealthcare.online` on the shared Nous VPS (Ubuntu, Docker). Inspected 2026-11-25: **1 vCPU, 3.8 GB RAM
(≈270 MB available, no swap), 49 GB disk (81 % used)**, 24 containers. Caddy (`beyondlife-caddy-1`) owns ports 80/443 and
issues Let's Encrypt certificates automatically, so on this server AppGrowth uses Caddy instead of its own nginx, and the
shared `careerpilot-postgres` (own role + database) instead of its own PostgreSQL — the same pattern as EventPro.

AppGrowth's core containers need about **1.1–1.3 GB RAM** (api 320 MB, worker 384 MB, scheduler 160 MB, web 256 MB,
ai 256 MB, redis 128 MB limits). The monitoring profile adds ≈0.7 GB and ClamAV ≈1.2 GB. **The current server does not
have that headroom**: before go-live either upgrade the VPS (recommended: 4 vCPU / 8 GB), add swap as a stop-gap, or move
AppGrowth to its own server (then use the `db` and `nginx` profiles).

## DNS
Create an **A record** `marketing` → the server's public IPv4 (and AAAA if IPv6 is used) on `noushealthcare.online`.

## First deployment
```bash
# on the server
mkdir -p /opt/appgrowth/secrets && cd /opt/appgrowth
# create .env and .env.ai from the examples (chmod 600), and secrets/backup.pass (random, chmod 600)
# from the repo (local machine)
scripts/provision-db.sh                      # role + database + RLS role in the shared PostgreSQL
scripts/deploy.sh --seed                     # build, migrate, seed reference data + first Super Admin, start, health-check
# add infrastructure/vps/Caddyfile.snippet to /opt/beyondlife/deploy/Caddyfile, validate and reload Caddy
```
Then remove `SEED_SUPERADMIN_PASSWORD` from `.env`, sign in, and enrol two-factor authentication.

## Dedicated server (alternative)
`docker compose --profile db --profile nginx up -d`, issue the first certificate with
`docker compose run --rm certbot certonly --webroot -w /var/www/acme -d marketing.noushealthcare.online`, restart nginx.
The certbot container renews every 12 hours.

## What deploy.sh does
validate `.env` (required keys, key formats, no test flags) and compose files → build the web app off-box → rsync →
tag current images `:previous` → build images → `prisma migrate deploy` → start → health checks (containers, API
db/redis, AI service, HTTPS, certificate expiry) → automatic rollback on failure.

## Resource notes
Background jobs never run on the request path; API memory is capped with `--max-old-space-size`; Redis uses
`noeviction` (queues must not lose jobs) with a 96 MB ceiling; logs rotate at 10 MB × 5.
