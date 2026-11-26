# Implementation status

Legend: **Done** = implemented and covered by automated tests · **Implemented, unverified** = written against the official
API documentation but not yet exercised against the live service (needs credentials/approval) · **Needs input** = blocked on
something only the owner can provide.

| Area | Status | Notes |
|---|---|---|
| Auth (Argon2id, short JWT, rotating refresh with reuse detection, lockout, reset, invitations) | Done | e2e: `auth-tenancy` |
| Admin MFA (TOTP) | Done | mandatory for Super Admin/Support; e2e + Playwright |
| Multi-tenancy (service filters + PostgreSQL RLS role) | Done | e2e proves cross-tenant reads/writes fail at DB level |
| RBAC (owner/admin/marketer/analyst/viewer, deny-by-default) | Done | |
| Applications (store URL parsing, validation, iOS metadata via iTunes Lookup, assets, targets) | Done | Android listing text needs Play Developer API (service account per app) — implemented, unverified |
| Budgets, spend policy, forecast | Done | unit-tested policy engine; enforced at request and execution |
| AI service + 9 LLM agents + orchestrator, tool permissions, quotas, cost tracking | Done (stub provider) | real provider calls need an API key — **Needs input** |
| Creative studio (generation, policy flags, versions, approvals, image/video) | Done (stub provider) | image: Gemini/OpenAI; video: Gemini Veo — behind `creative.video_generation` flag |
| Campaign lifecycle, execution engine (locks, idempotency, re-check), sync | Done (fake adapter) | |
| Google Ads adapter | Implemented, unverified | needs OAuth client + approved developer token |
| Meta Ads adapter | Implemented, unverified | needs Meta app with ads_management Advanced Access; ads (creative upload) to be added after verification |
| TikTok Ads adapter | Implemented, unverified | needs approved Marketing API app; ads (video upload) to be added after verification |
| Apple Ads adapter (ES256 client credentials) | Implemented, unverified | JWT signing unit-tested; needs a customer API user to verify |
| Attribution: signed webhook ingest, de-dup, reinstalls, SKAN/AAK aggregate | Done | e2e `campaigns-attribution` |
| AppsFlyer / Adjust / GA4-Firebase pull adapters | Implemented, unverified | need customer API tokens |
| Rollups, CPI, countries, D1/D7/D30 retention | Done | |
| Workflows A–G (onboarding, creation, monitoring, budget optimisation, daily report, monthly planning, integration health) | Done | BullMQ repeatable schedules; idempotent per tick |
| Reports PDF/CSV + email | Done | email needs SMTP — **Needs input** |
| Notifications (in-app, email, preferences, thresholds) | Done | |
| Subscriptions, invoices, manual payments | Done | online payment gateway not integrated (flag `billing.online_payments`) |
| Support tickets, Super Admin console (all modules) | Done | |
| Docker/Compose, Caddy/nginx, Prometheus/Grafana/Loki, scripts, CI/CD | Done | monitoring profile needs ~0.7 GB RAM |
| Production deployment | **Needs input** | DNS record, server capacity decision (see VPS_DEPLOYMENT.md) |

Known limitations
- Ad-creative *media* upload (images/video) to Meta/TikTok/Google is not yet implemented: Google App campaigns receive
  text assets; Meta/TikTok campaigns are created with their ad set/ad group and need ads attached in the platform UI until
  media upload is added and verified.
- Keyword popularity is an AI estimate unless a keyword data vendor is added.
- Forecasts are statistical estimates from recent CPI and budget; they are labelled and never guaranteed.
