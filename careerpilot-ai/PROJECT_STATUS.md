# Project status

_Last updated: 2026-11-21._

**Deployed** to https://jobs.inferapp.online (pending the DNS A record) on the shared VPS. AI runs on Google Gemini
(`gemini-3.5-flash`); live structured-output and Google-Search-grounded research calls verified 2026-11-21.

## Summary
All seven phases are implemented. The backend (58 tests), frontend (11 tests, type-check, production build)
and Docker Compose stack were run and verified locally. Features that call external paid services are built,
tested against mocks, and waiting for credentials. They are **not yet verified live**; see the table below.

## Phase checklist
| Phase | Scope | State |
|---|---|---|
| 1 Foundation | Auth (Argon2id, httpOnly JWT, rotating refresh with reuse detection, CSRF, lockout, rate limits), profile, resume upload & parsing (PDF/DOCX), dashboard shell | Done · tested |
| 2 Job discovery | Connector framework; Greenhouse/Lever/Ashby (live), JSearch, Adzuna, manual entry, URL import; normalisation; 4-layer dedupe; filters/sort/pagination; link verification | Done · tested |
| 3 AI intelligence | Claude client (structured outputs, refusal fallbacks), weighted matching + guardrails + rule fallback, AI shortlist, company research & recruiter discovery with grounding checks | Done · tested with mocks; **live Claude calls unverified** |
| 4 Applications | Kanban + table, status history, duplicate prevention, tailored resumes with fact-check reversion, cover letters, DOCX/PDF, outreach drafts with approval gating, interviews | Done · tested |
| 5 Automation | Celery worker + beat, DB-driven IST schedules, idempotent runs, retries, timeouts, logs, email/Telegram notifications with dedupe & preferences, follow-ups, weekly report | Done · verified in Docker; **email/Telegram delivery unverified (no credentials)** |
| 6 Interview prep | 40-question built-in bank, mock sessions, AI/rules evaluation, weakness analysis, progress & history | Done · tested |
| 7 Production | Analytics + CSV export, data export & account deletion, security headers, Dockerfiles, Compose (7 services, health checks, volumes), nginx (rate limits, SSL template), backup/restore/deploy scripts, docs | Done · stack verified locally on port 8080; **not yet deployed to a VPS; SSL path untested** |

## Verified end-to-end (2026-11-20)
On the local dev stack and again on the Docker Compose stack:
register → upload the real resume (6 employers, 35 skills, 13 yrs / 4.5 yrs Flutter extracted) → apply stated
preferences → add job → score (81, Strong Match) → shortlist → tailored resume PDF/DOCX + cover letter →
send-before-approval refused → approve → mark applied → automation run via Celery → agent answers from real DB
rows → every page returns 200 → backup script produces DB dump + storage archive → Celery Beat tick enqueues
scheduled steps.

## Awaiting credentials
| Item | What to set | Effect when missing |
|---|---|---|
| Claude (optional) | `ANTHROPIC_API_KEY` + `AI_PROVIDER=anthropic` | Gemini is used instead (configured in production) |
| JSearch | `SEARCH_PROVIDER_API_KEY` | No LinkedIn/Indeed/Naukri/Foundit coverage |
| Adzuna | `JOB_SEARCH_API_KEY` | One fewer source |
| SMTP | `SMTP_*` | Notifications stay in-app; outreach emails can't be sent from the app |
| Telegram | `TELEGRAM_*` | No Telegram alerts |

## Known limitations
- Company career boards: only 5 Indian companies are pre-configured (each verified live). None currently lists
  a mobile role, so most discovery volume depends on JSearch. Add boards in Settings → Job sources.
- LinkedIn, Naukri, Indeed, Foundit, Instahyre, Wellfound, Cutshort, Hirist: no authorised API, so they are
  intentionally not scraped (see docs/INTEGRATIONS.md).
- The heuristic resume parser (no AI) handles common layouts, but some project descriptions land in experience
  bullets. Review in Resume Studio, or reparse with Claude once a key is set.
- No browser-driven E2E suite (Playwright). E2E was verified with an HTTP script through the same proxy the
  browser uses, plus component tests.
- Gmail OAuth is not implemented; SMTP with a Gmail App Password covers sending.
- Single-user design (multi-user safe at the data level); job sources are global to the instance.

## Candidate-profile items needing the user's confirmation
Flagged in the app (Resume Studio → Profile): current CTC, notice period; location (resume says Noida, brief
says Jaipur); skills from the brief that the resume doesn't mention: CI/CD, Codemagic, Xcode, Android Studio,
App Security, SSL Pinning.
