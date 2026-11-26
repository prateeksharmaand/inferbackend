# Operations runbook

| Situation | Action |
|---|---|
| Health check failing | `scripts/health-check.sh`; `docker logs appgrowth-api --tail 200`; Admin → System health |
| Worker not processing | Admin → System health (worker heartbeat), Background jobs; `docker restart appgrowth-worker` |
| Failed jobs piling up | Admin → Background jobs → inspect reason → fix cause → Retry |
| Customer reports overspend | Suspend org (Admin) or customer presses Emergency stop; check campaign actions + optimization decisions; reconcile `advertising_spend` vs platform billing |
| Ad platform outage / auth errors | Accounts auto-marked EXPIRED/ERROR with automation off; customers notified; nothing else needed |
| AI provider failing | Admin → AI providers → Test connection; switch default provider; agents retry transient errors automatically |
| Disk filling | `docker system df`; prune old images; check `backups/` retention and Loki retention (14 days) |
| Release went wrong | `scripts/rollback.sh` |
| Rotate secrets | docs/SECURITY.md |

Dashboards: Grafana (`/grafana`, monitoring profile) — latency, status codes, jobs, provider errors, memory, error logs.
Prometheus alerts: p95 > 800 ms, 5xx rate, job failures, provider errors, API down.
