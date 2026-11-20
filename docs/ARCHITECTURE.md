# Architecture

```
Browser ── nginx ──┬── /api/*  → FastAPI (backend)  ── PostgreSQL
                   └── /*      → Next.js (frontend)    Redis ── Celery worker / Celery beat
                                         FastAPI → Anthropic Claude API (Messages API, web search tool)
                                         Connectors → JSearch, Adzuna, Greenhouse/Lever/Ashby public boards
```

## Backend layout (`backend/app`)
| Module | Responsibility |
|---|---|
| `core/` | settings, DB session, security (Argon2id, JWT, rotating refresh tokens, CSRF), rate limiting, error envelope |
| `models/` | SQLAlchemy models for all tables (users … agent_settings, plus refresh_tokens, mock interviews, agent chat) |
| `schemas/` | Pydantic request/response models |
| `api/` | REST routers: auth, profile, resumes, jobs, sources, companies, matches, recruiters, applications (+documents, interviews), outreach, automation, notifications, analytics, settings, interview-coach, agent |
| `connectors/` | provider-independent job sources (`search_jobs`, `fetch_job_details`, `normalize_job`, `verify_job`, `get_source_status`) |
| `services/` | resume parsing, profile, normalisation, dedupe/ingest, salary, tailoring + fact-checks, research, documents (DOCX/PDF), analytics, audit, storage, AI client |
| `matching/` | weighted scoring engine with server-side guardrails and rule-based fallback |
| `automation/` | Celery app, beat tick, idempotent pipeline steps, run bookkeeping |
| `notifications/` | SMTP + Telegram channels, deduplicated notifications, templates |
| `interview/` | question bank, mock sessions, evaluation |
| `agents/` | Career Agent: Messages-API tool loop over DB-backed tools |

## Conventions
- **Time:** stored UTC (`timestamptz`), displayed and scheduled in `Asia/Kolkata`.
- **Salary:** stored as INR lakhs per annum (`Numeric(6,2)`). Non-INR postings keep their currency and leave LPA
  null (no silent FX conversion). See `services/salary.py`.
- **Soft deletion:** jobs, resumes, recruiters, applications, companies, documents use `archived_at`.
- **Errors:** every error is `{"error": {"code", "message", "details"}}`.

## Duplicate detection
A job is a duplicate if any match an existing non-archived job: source+external id; normalised URL (tracking
params stripped); title+company key within 45 days (cross-posting); description fingerprint. Enforced in code
and by unique indexes (`dedup_hash`, `(source, external_id)`, `normalized_url`).

## Matching
Weights: technical 25 · leadership 20 · architecture/Flutter 20 · compensation 15 · location 10 · company 10.
Claude returns category scores and reasoning as structured output (validated by Pydantic). The server then:
removes "matching skills" you haven't confirmed; clamps categories; recomputes the overall as the sum; caps
compensation/location by hard facts (posted CTC vs target, preferred cities/modes); caps company at 7/10 until
researched; caps technical by verified skill overlap. Every correction is stored in `job_matches.adjustments`
with model + `prompt_version`, and match history is kept (`is_current`).

## Grounding & approvals
- Resume parsing is extractive; AI-extracted skills/employers not present in the text are dropped.
- Skills you claim outside your resume are **unconfirmed** until you confirm them, and are excluded from matching
  and generated documents meanwhile.
- Tailored resumes: each rewritten bullet cites its source bullet; any new number or unconfirmed technical skill
  reverts the bullet. A tailoring report lists every reversion.
- Research: company sources are only URLs returned by web search in that call; contacts whose source isn't
  among those results are dropped; emails are kept only if found verbatim on the cited page.
- Outreach: drafts → approve → send (email via SMTP) or "I sent it myself" (LinkedIn is never automated).
  Editing an approved draft resets it to draft. Applications are never submitted by the system.
- The Career Agent's tools only read data or create internal drafts. It has no send/submit tool.

## Automation
Celery Beat ticks every 60 s; `tick` reads each user's schedule from `agent_settings` (IST) and enqueues due
steps with an idempotency key (`task:user:date`, unique in `automation_runs.run_key`). Steps: discover →
verify/clean → AI match → research → digest (10:00) → follow-ups (18:00) → weekly report (Sun). Runs record
logs, stats and errors; failures notify you and can be retried (new run, `attempt+1`). Stuck runs are failed
after 40 min. Manual "Run now" uses Celery when a broker is reachable, else a background thread.
