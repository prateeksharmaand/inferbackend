# CareerPilot AI

A self-hosted, AI-assisted job-search platform for a senior mobile engineer: discover jobs, score them against
your real profile, research companies and hiring contacts, tailor resumes and cover letters, track
applications through to offer, prepare for interviews, and get daily/weekly reports by email and Telegram.

> Ground rules built into the code: no invented experience, skills or contact details; no fake jobs; no scraping
> behind logins; and **nothing is ever sent or submitted without your explicit approval**.

## Stack
Next.js 15 · React 19 · TypeScript · Tailwind + shadcn-style Radix components · Recharts · TanStack Query —
FastAPI · SQLAlchemy 2 · Pydantic 2 · Alembic · PostgreSQL · Celery + Redis + Beat · Anthropic Claude API
(configurable model, default `claude-opus-5-5`) · PyMuPDF · python-docx · Docker Compose · nginx.

## Quick start (local development)
Requirements: Python 3.12 + [uv](https://docs.astral.sh/uv/), Node 22+, PostgreSQL 15+, Redis 7.

```bash
createdb careerpilot && createdb careerpilot_test
cp .env.example backend/.env           # set DATABASE_URL, JWT_SECRET; ANTHROPIC_API_KEY optional
cd backend && uv sync && uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000           # API + docs at http://localhost:8000/api/docs
uv run celery -A app.automation.celery_app worker -l info  # background jobs (separate terminal)
uv run celery -A app.automation.celery_app beat -l info    # scheduler (separate terminal)
cd ../frontend && npm install && npm run dev               # http://localhost:3000
```

First run:
1. Open http://localhost:3000, create your account, then set `ALLOW_REGISTRATION=false`.
2. **Resume Studio → Upload** your resume (PDF/DOCX). Your profile is filled from it.
3. Optionally apply your stated preferences in one go:
   `uv run python scripts/apply_preferences.py you@example.com` (edit `DEFAULT` in the script or pass a JSON file).
4. **Resume Studio → Profile & skills**: resolve everything in "Please confirm or complete".
5. **Settings → Job sources**: add company career boards; add API keys for JSearch/Adzuna for broad coverage.
6. **Agent Automation**: turn automation on.

Without `ANTHROPIC_API_KEY` everything still works with deterministic fallbacks (rule-based matching,
heuristic resume parsing, template letters, keyword interview scoring, keyword chat routing). Company/recruiter
research requires Claude.

## Tests
```bash
cd backend && uv run pytest          # 58 tests: auth, parsing, connectors (mocked), dedupe, matching guardrails,
                                     # tailoring fact-checks, applications, outreach approval, automation, agent
cd frontend && npm test              # unit + component tests (vitest)
cd frontend && npx tsc --noEmit && npm run build
```

## Production
`docker compose up -d` brings up postgres, redis, backend, celery-worker, celery-beat, frontend and nginx.
See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** (VPS, DNS, SSL, backups) and
**[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)** (Claude, job APIs, email, Telegram).

## Docs
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): modules, data model, matching, safety rules
- [PROJECT_STATUS.md](PROJECT_STATUS.md): what's done, verified, and awaiting credentials
