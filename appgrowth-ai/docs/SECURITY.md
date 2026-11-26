# Security

| Control | Implementation |
|---|---|
| Passwords | Argon2id (19 MiB, t=2); strength policy; constant-time unknown-user path |
| Sessions | 15-min HS256 access JWT; 30-day rotating refresh tokens stored hashed; reuse of a used token revokes the session and is logged as a security event |
| Brute force | 5 failures → 15-min lock; per-route throttling (login, reset, invites, AI, uploads) |
| MFA | TOTP, mandatory for Super Admin/Support (console blocked until enrolled and verified per session) |
| CSRF | SameSite=Lax cookies + double-submit `X-CSRF-Token` for cookie-authenticated mutations |
| XSS | React escaping, strict CSP, `nosniff`, frame-ancestors none; no HTML from users or models is rendered |
| SQL injection | Prisma parameterised queries; raw SQL only via tagged templates |
| Authorization | global guard: membership + declared permission per route, deny by default; Super Admin routes separate |
| Tenant isolation | service filters + PostgreSQL RLS role (tested) |
| Secrets at rest | AES-256-GCM (`DATA_ENCRYPTION_KEY`) for OAuth tokens, API keys, service accounts, MFA secrets, webhook secrets |
| Logs | audit log redacts token/secret/password keys; tokens never returned by any API; Promtail scrubs bearer/token patterns |
| Uploads | size limits, magic-byte type sniffing, square-icon check, optional ClamAV scan, files served only via expiring HMAC-signed URLs |
| Webhooks | HMAC-SHA256 over timestamp + raw body, 5-min tolerance, replay rejection, signature checked before anything else |
| OAuth | one-time state (hashed, 15 min), PKCE, provider-scoped redirect URIs |
| AI | untrusted-context wrapping, schema validation, no tool can mutate, banned/regulated-claim checks on creatives |
| CSV | formula-injection neutralisation in exports |
| Containers | non-root users, memory limits, internal-only network for databases/Redis, no published DB ports |
| Supply chain | npm audit, pip-audit, gitleaks, Trivy in CI; pinned image tags |
| Backups | AES-256 encrypted (`openssl -pbkdf2`), checksummed |

## Incident response
1. **Contain**: Super Admin suspends affected organizations (stops automation, read-only) or flips `integration.*` flags
   off; customers can press Emergency stop. Revoke sessions by disabling users.
2. **Assess**: Admin → Audit & security logs (filter security), `error_logs`, Loki, `integration_sync_logs`.
3. **Eradicate & rotate** (below), redeploy, verify with `scripts/health-check.sh`.
4. **Notify** affected customers within 72 hours with facts and actions; record a post-mortem.

## Credential rotation
- `JWT_ACCESS_SECRET`: change and redeploy — all users are signed out (refresh tokens remain hashed and are re-issued on next login).
- `AI_SERVICE_TOKEN`, `METRICS_TOKEN`, `REDIS_PASSWORD`, DB password: change in `.env`/`.env.ai` (and the DB role) → `scripts/deploy.sh --skip-web`.
- Platform OAuth secrets (Google/Meta/TikTok): rotate in the provider console, update `.env`, redeploy; customer tokens stay valid.
- Customer tokens: disconnect + reconnect in Integrations (revokes at the provider where supported).
- `DATA_ENCRYPTION_KEY`: requires re-encrypting stored secrets — run a maintenance script that decrypts with the old key and
  encrypts with the new (all `*Enc` columns) during a maintenance window; never change it in place without that.
- `DEVICE_HASH_SALT`: do not change after go-live (would split device identities).
