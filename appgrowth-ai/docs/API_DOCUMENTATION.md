# API

Base path `/api/v1`. Interactive OpenAPI: `https://marketing.noushealthcare.online/api/docs` (JSON at `/api/docs-json`).

## Conventions
- **Auth**: web uses httpOnly cookies + `X-CSRF-Token` (double submit) on mutations; API clients call
  `POST /auth/login?client=api` and send `Authorization: Bearer <accessToken>`; refresh with `POST /auth/refresh`.
- **Organization scope**: send `X-Organization-Id` on organization endpoints. Membership and permission are checked on
  every request; routes without a declared permission are denied.
- **Errors**: `{ "error": { "code": "…", "message": "…", "details"?: … } }`. Codes include `validation_error`,
  `unauthorized`, `token_expired`, `forbidden`, `not_found`, `conflict`, `rate_limited`, `org_suspended`, `plan_limit`,
  `policy_<rule>` (spend policy), `integration_unavailable`, `ai_quota_exceeded`.
- **Pagination**: `?page=&pageSize=` (max 100) → `{ items, page, pageSize, total, totalPages }`.
- **Money**: strings in major units on input (`"5000.00"`), strings on output.
- **Rate limits**: 300/min default per client; stricter on auth, AI and generation endpoints.

## Modules
Auth (`/auth/register|login|refresh|logout|forgot-password|reset-password|accept-invite|me|mfa/*`) · Organizations
(`/organizations`, members, invitations, brand kit, automation policy, emergency stop, audit log) · Apps (`/apps`, lookup,
assets, targets, refresh metadata, onboarding, Play credentials) · Integrations (`/integrations`, `/:provider/connect`,
`/:provider/callback`, `/:provider/accounts`, `/:id` delete, `/:id/sync`, Apple key pair/credentials, app mapping) ·
Campaigns (`/campaigns`, submit, approve, launch, pause, resume, refresh, complete, archive, from-strategy) · Analytics
(`/analytics/overview|installs|campaigns|countries|retention|cpi`) · AI (`/ai/research|strategy|campaign/recommend|
agents|agents/:key/run|executions|insights|strategies/:id/approve`) · Creatives (`/creatives`, generate, image, video,
approve, reject) · Budgets (`/budgets`, `/budgets/spend|forecast`) · Reports (`/reports`, generate, download) ·
Automation (`/automation/decisions`, `/automation/workflows`) · Attribution (`/apps/:id/attribution/:provider`,
`/attribution/:id/pull`, `POST /ingest/:sourceId/events` signed webhook) · Notifications, Support, Billing · Admin
(`/admin/dashboard|organizations|users|campaigns|integrations|plans|feature-flags|system/health|system/jobs|audit-logs|usage|ai/*|support/*|invoices|payments`).

## Webhook signature (ingest)
`X-AppGrowth-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`; requests older than 5 minutes
and replays are rejected. Body: `{ "events": [ { "event_id", "type": "install|reinstall|first_open|sign_up|login|purchase|subscribe|session|skan_install|aak_install", "platform", "device_id", "occurred_at", "country", "media_source", "campaign_id", "value", "currency", "installs" } ] }`.
