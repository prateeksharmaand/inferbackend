#!/usr/bin/env bash
# Verifies containers are healthy, the API reports db+redis OK, the AI service answers, and HTTPS serves the site.
source "$(dirname "$0")/common.sh"
ok=true
for i in $(seq 1 40); do
  st=$(remote "docker inspect -f '{{.State.Health.Status}}' appgrowth-api appgrowth-web appgrowth-ai 2>/dev/null | sort -u | tr '\n' ' '")
  [ "$st" = "healthy " ] && break; sleep 3
done
echo "containers: ${st:-unknown}"; [ "$st" = "healthy " ] || ok=false
remote "docker ps --filter name=appgrowth-worker --filter name=appgrowth-scheduler --format '{{.Names}} {{.Status}}'"
api=$(remote "docker exec appgrowth-api node -e \"fetch('http://127.0.0.1:4100/api/v1/health').then(r=>r.text()).then(t=>console.log(t))\"" || true)
echo "api: $api"; echo "$api" | grep -q '"status":"ok"' || ok=false
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMAIN/" || true); echo "https $DOMAIN → $code"; [ "$code" = 200 ] || ok=false
hc=$(curl -s --max-time 15 "https://$DOMAIN/api/v1/health" || true); echo "public api: ${hc:0:80}"; echo "$hc" | grep -q '"status":"ok"' || ok=false
cert=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null || true); echo "certificate: ${cert:-none}"
$ok && echo "✓ healthy" || { echo "✗ unhealthy"; exit 1; }
