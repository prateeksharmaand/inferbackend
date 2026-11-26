# Environment configuration

All variables are documented inline in [`.env.example`](../.env.example) (API, worker, scheduler) and
[`.env.ai.example`](../.env.ai.example) (AI service). On servers: `/opt/appgrowth/.env` and `.env.ai`, mode 600, never
committed or transferred by CI. Required at startup (the API refuses to start otherwise): `DATABASE_URL`, `REDIS_URL`,
`JWT_ACCESS_SECRET` (≥32 chars), `DATA_ENCRYPTION_KEY` (64 hex), `PUBLIC_URL`. `THROTTLE_DISABLED` is rejected in production.

Runtime configuration that is **not** in env files (Super Admin console): AI providers/models/prices/keys, agent
schedules and overrides, workflow schedules, subscription plans and limits, feature flags, integration readiness.
Per-organization: currency, timezone, brand kit, automation policy, budgets, notification preferences.
