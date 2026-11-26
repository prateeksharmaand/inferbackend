# Testing strategy

| Layer | Where | Covers |
|---|---|---|
| Unit | `apps/api/src/**/*.spec.ts` | money maths and CPI rounding, spend policy (reserve, monthly/daily/campaign caps, increase cap, concurrency, autonomy, channel allow-list), forecast, campaign state machine, Apple ES256 client secret |
| Integration / e2e (API + PostgreSQL + Redis) | `apps/api/test/*.e2e-spec.ts` | registration/org bootstrap, roles & permissions, cross-tenant API access, **RLS at the database level**, CSRF, lockout, refresh-token reuse, tampered tokens, MFA admin console, suspension, apps (validation, plan limits, duplicates, uploads + magic bytes, signed URLs), budgets, AI onboarding pipeline (tool permissions, validated persistence, quotas, cancellation), campaign lifecycle with spend policy enforced at request and execution, idempotent launch, metric sync idempotency, autonomy levels, signed webhook ingest (bad/expired/replayed signatures, de-dup, reinstalls, SKAN aggregates), rollups, PDF/CSV reports with formula-injection guard, OAuth state, provider/AI fakes |
| AI service | `apps/ai/tests` | service auth, creative policy flags, evidence-URL filtering, retry, context block escaping, unconfigured providers |
| Browser e2e | `apps/web/e2e` (Playwright) | registration, real App Store import, honest onboarding failure without AI keys, budget, campaign draft, policy guard, every customer and admin page renders without errors, admin TOTP enrolment, mobile layout |

External APIs are replaced by adapters' fakes in tests (never in production). Live adapter verification happens once
credentials exist and is recorded in Admin → Integrations readiness.

## Load targets (initial)
Common dashboard queries p95 < 500 ms and standard API p95 < 800 ms at 20 requests/second on the production server size;
revisit once the server is sized (see VPS_DEPLOYMENT.md). Measure with `k6` against staging: dashboard overview, apps
list, campaigns list, analytics campaigns, login.
