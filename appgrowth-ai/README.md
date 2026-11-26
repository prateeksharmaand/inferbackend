# AppGrowth AI

Multi-tenant SaaS by **Nous Healthcare Solutions** that helps businesses grow genuine Android and iOS app installs:
AI market research, ASO audits, growth strategies, creative generation, app install campaigns on Google, Apple, Meta and
TikTok through their official APIs, budget-safe automation, de-duplicated attribution and reporting.

Production: https://marketing.noushealthcare.online · Self-hosted, no AWS services.

## Repository layout
| Path | What |
|---|---|
| `apps/api` | NestJS API (REST `/api/v1`, Swagger at `/api/docs`) + background **worker** + **scheduler** (same image), Prisma/PostgreSQL |
| `apps/web` | Next.js 15 app: customer dashboard, Super Admin console, public home page |
| `apps/ai` | Python FastAPI AI service: provider adapters (Gemini, Anthropic, OpenAI, Ollama) and structured agent outputs |
| `infrastructure` | Dockerfiles, Compose override for the shared VPS, Caddy/nginx, Prometheus/Grafana/Loki |
| `scripts` | `deploy.sh`, `migrate.sh`, `backup.sh`, `restore.sh`, `health-check.sh`, `rollback.sh`, `provision-db.sh` |
| `docs` | Product, architecture, security, operations documentation |

## Run locally
Prerequisites: Node 22+, Python 3.12 (via `uv`), PostgreSQL 16+, Redis 7.
```bash
cd apps/api && cp ../../.env.example .env   # set DATABASE_URL/REDIS_URL to local, generate secrets
createdb appgrowth && npx prisma migrate deploy && SEED_SUPERADMIN_EMAIL=you@x SEED_SUPERADMIN_PASSWORD='…' npx prisma db seed
npm run dev                                  # API on :4100
npm run build && node dist/worker            # background worker (separate terminal)
node dist/scheduler                          # schedules (separate terminal)
cd ../ai && uv sync && AI_SERVICE_TOKEN=… GEMINI_API_KEY=… uv run uvicorn app.main:app --port 8100
cd ../web && npm run dev                     # web on :3100 (proxies /api to :4100)
```

## Tests
| Suite | Command |
|---|---|
| API unit (money, spend policy, forecast, state machine, Apple JWT) | `cd apps/api && npx jest` |
| API integration/e2e (auth, RLS tenant isolation, apps, budgets, AI pipeline, campaigns, attribution, reports, OAuth) | `npx jest --config test/jest-e2e.json` (uses database `appgrowth_test`) |
| AI service | `cd apps/ai && uv run pytest` |
| Browser e2e (customer + admin journeys, mobile) | `cd apps/web && npx playwright test` against a running stack |

## Status
See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for what works, what is verified, and what needs
credentials or platform approvals (advertising APIs, AI keys, SMTP).
