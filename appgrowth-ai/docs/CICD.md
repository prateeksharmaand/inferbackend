# CI/CD

Workflows live at the repository root (`.github/workflows/appgrowth-*.yml`) and only run for `appgrowth-ai/**` changes.

**appgrowth-ci** (push/PR): API lint + typecheck → migrations applied from scratch + drift check against `schema.prisma`
→ unit tests → integration/e2e tests (Postgres + Redis services) · web lint/typecheck/build · AI ruff + pytest ·
security (npm audit high+, pip-audit, gitleaks) · Docker builds for all three images + Trivy scan.

**appgrowth-deploy** (manual `workflow_dispatch`): choose `staging` or `production`; runs in a GitHub Environment so
production can require reviewers. Secrets: `APPGROWTH_SSH_KEY`, `APPGROWTH_KNOWN_HOSTS`, `APPGROWTH_HOST`; variables:
`APPGROWTH_DIR`, `APPGROWTH_DOMAIN` (staging can point at another directory/domain on the same or another host). The
script never prints secrets; server `.env` files are never transferred. Rollback: `scripts/rollback.sh` (previous images).
