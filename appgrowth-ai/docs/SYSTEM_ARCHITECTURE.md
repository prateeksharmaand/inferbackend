# System architecture

```
Browser ──HTTPS──> Caddy / nginx ──┬── /api/* ──> appgrowth-api  (NestJS modular monolith, REST /api/v1)
                                  └── /*     ──> appgrowth-web  (Next.js standalone)
appgrowth-api ──> PostgreSQL (Prisma, RLS) · Redis (cache, locks, BullMQ)
appgrowth-worker (same image) ── consumes queues: workflows, agents, campaigns, sync, analytics, reports, notifications
appgrowth-scheduler (same image) ── BullMQ job schedulers (cron, UTC) from automation_workflows / ai_agent_definitions
appgrowth-ai (FastAPI) ── called only by api/worker with a bearer token; calls LLM providers
Ad platforms / MMPs / stores ── called only from worker/api through provider adapters
```

## Components
| Component | Responsibility |
|---|---|
| API | auth, RBAC, tenancy, business APIs, Swagger, webhooks, signed file serving, metrics |
| Worker | Campaign Execution Engine, Analytics Processing Engine, Notification delivery, AI orchestration, workflows |
| Scheduler | repeatable schedules in Redis (no in-memory timers for critical work), re-synced every 5 min |
| AI service | stateless reasoning: provider adapters, structured outputs, grounding, creative safety checks |
| Web | customer app, admin console, public site |

## Design decisions
- **Modular monolith** for business APIs (one deployable, clear modules); AI and worker are separately deployable.
- **Provider adapters** for everything external: `AdvertisingProvider` (Google, Apple, Meta, TikTok), AI providers
  (Gemini, Anthropic, OpenAI, Ollama), `StorageProvider` (local, MinIO), attribution (webhook, AppsFlyer, Adjust, GA4/Firebase).
  Adding one does not change core logic.
- **Context-first agents**: the orchestrator gathers data via registered read-only tools, the model returns structured
  proposals, and Node applies them under policy. Models never get SQL, shell or arbitrary HTTP.
- **Money** is BigInt minor units end-to-end; JSON carries it as strings.
- **Idempotency**: workflow executions (unique key), campaign actions (unique key; platform-side name tags), event
  ingestion (unique dedupe keys), rollups (delete+insert per range in one transaction).
- **Fail safe**: errors never loosen limits; auth failures disable automation for the account; emergency stop halts all
  AI-initiated changes.
