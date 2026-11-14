#!/usr/bin/env bash
# Install / update the Infer sales agent on the VPS and schedule it daily at 9:00 AM IST.
#
#   deploy-vps/setup-sales-agent.sh            # copy code, build image, create .env (first time), install cron
#   deploy-vps/setup-sales-agent.sh run-now    # same, then start a run immediately (in the background)
#
# On the VPS:
#   /opt/inferapp/sales-agent/          code + .env + google_creds.json + state (bounce log, quota, counters)
#   /opt/inferapp/sales-agent/logs/     one log per day
#   /etc/cron.d/infer-sales-agent       03:30 UTC = 09:00 IST
#
# The agent reads its own .env (python-dotenv). .env is created once from /opt/inferapp/.env (SMTP, WhatsApp, Groq) and never overwritten;
# secrets are copied on the server and never printed. Edit it there to add GOOGLE_SHEET_ID /
# GOOGLE_MAPS_API_KEY, and copy the Google service-account key to google_creds.json.
set -euo pipefail

VPS="${VPS:-root@187.127.135.184}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DIR=/opt/inferapp/sales-agent

echo "==> Copying sales-agent code to $VPS:$DIR"
ssh "$VPS" "mkdir -p $DIR/logs"
rsync -az \
  --exclude .env --exclude google_creds.json --exclude logs/ --exclude __pycache__/ --exclude '*.pyc' \
  --exclude quota.json --exclude bounce_log.json --exclude daily_email_count.json --exclude scrape_done.json \
  --exclude debug_html/ --exclude 'preview_*.html' \
  "$REPO/sales-agent/" "$VPS:$DIR/"

ssh "$VPS" "DIR=$DIR bash -s" <<'REMOTE'
set -euo pipefail
cd "$DIR"

echo "==> Building image infer-sales-agent"
docker build -q -t infer-sales-agent . >/dev/null

if [ ! -f .env ]; then
  echo "==> Creating .env from /opt/inferapp/.env (values not shown)"
  umask 077
  {
    echo "# Infer sales agent — created $(date -u +%F). SMTP / WhatsApp / Groq copied from /opt/inferapp/.env"
    grep -E '^(GROQ_API_KEY|SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_PASS|SMTP_FROM|FROM_NAME|WA_ACCESS_TOKEN|WA_PHONE_NUMBER_ID|WA_API_VERSION)=' /opt/inferapp/.env
    cat <<'ENV'
IMAP_HOST=imap.hostinger.com
IMAP_PORT=993

# Lead sheet (Google Sheets CRM) — fill these in
GOOGLE_SHEET_ID=
GOOGLE_CREDS_FILE=/app/google_creds.json

# Lead search (Google Maps Places API) — fill in; runs are capped at MAPS_MONTHLY_CAP calls a month
GOOGLE_MAPS_API_KEY=
MAPS_MONTHLY_CAP=9500
SCRAPE_CITIES=Mumbai,Pune,Delhi,Bangalore
MAX_PER_COMBO=10

# Sending
MAX_DAILY_EMAILS=300
DELAY_MIN=45
DELAY_MAX=90
BURST_EVERY=10
BURST_PAUSE=180
SMTP_PROBE=false

# Daily "work done" report
REPORT_EMAIL=support@inferapp.online

BACKEND_URL=https://api.inferapp.online
ENV
  } > .env
  chmod 600 .env
else
  echo "==> Keeping existing .env"
fi

echo "==> Installing cron: daily 03:30 UTC (09:00 IST)"
cat > /etc/cron.d/infer-sales-agent <<CRON
# Infer sales agent — 09:00 IST daily. flock stops a run starting while the previous one is still sending.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 3 * * * root flock -n /tmp/infer-sales-agent.lock docker run --rm --name infer-sales-agent -v $DIR:/app -w /app infer-sales-agent python agent.py >> $DIR/logs/agent-\$(date +\%F).log 2>&1
CRON
chmod 644 /etc/cron.d/infer-sales-agent

echo "==> Config check (names only)"
for k in GROQ_API_KEY SMTP_HOST SMTP_USER SMTP_PASS WA_ACCESS_TOKEN WA_PHONE_NUMBER_ID GOOGLE_SHEET_ID GOOGLE_MAPS_API_KEY REPORT_EMAIL; do
  if grep -qE "^$k=.+" .env; then echo "   ✓ $k"; else echo "   ✗ $k (empty)"; fi
done
[ -f google_creds.json ] && echo "   ✓ google_creds.json" || echo "   ✗ google_creds.json (missing)"
REMOTE

if [ "${1:-}" = "run-now" ]; then
  echo "==> Starting a run now (background); log: $DIR/logs/agent-$(date -u +%F).log"
  ssh "$VPS" "cd $DIR && nohup flock -n /tmp/infer-sales-agent.lock docker run --rm --name infer-sales-agent -v $DIR:/app -w /app infer-sales-agent python agent.py >> $DIR/logs/agent-\$(date +%F).log 2>&1 &"
fi
echo "Done."
