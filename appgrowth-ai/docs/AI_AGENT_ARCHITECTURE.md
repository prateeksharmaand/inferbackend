# AI agents

## Orchestrator (`apps/api/src/modules/ai/orchestrator.service.ts`)
Holds organization, application, campaign and budget context, the agent's previous result (execution history), tool
permissions and decision logs. For each run it: checks the plan's monthly AI allowance → selects provider/model (agent
override, else platform default — never hard-coded) → calls each **registered read tool** listed in the agent definition,
inside the organization's RLS context → sends context to the AI service → stores output, tokens and cost (`ai_usage`,
`cost_records`) → hands the output to the agent's persister. Runs are queued (BullMQ), retried for transient errors,
cancellable, time-limited, and can require manual review.

## Safety model
- Context is wrapped in `<context>` and declared as data; the block cannot be closed from inside.
- Models return schema-validated JSON (pydantic in Python, re-validated in Node before persisting: enums, ranges, ISO codes).
- No model can execute SQL, shell commands or HTTP. Grounded web search is done by the provider; evidence URLs not among
  the returned sources are removed.
- Mutating actions are never model-callable tools: proposals pass through the spend policy and autonomy level.

## Agents
| Agent | Tools (read) | Output → persisted as |
|---|---|---|
| Market Research | app profile, store listing, web search | market_research, competitors, keyword_research, audience_segments |
| ASO | app profile, listing, web search | aso_audits (never edits store listings) |
| Creative | app profile, listing | creative_assets + versions with policy flags (pending approval) |
| Campaign Strategy | app profile, analytics, budget, campaigns | marketing_strategies (pending approval) |
| Campaign Execution | — (deterministic engine) | campaign_actions via the execution engine |
| Budget Optimization | budget, campaign daily, campaigns | optimization_decisions; executed only within policy |
| Analytics / Growth / Retention | analytics, retention, budget | execution output (dashboard, reports) |
| Reporting | analytics, budget, campaigns | report narrative (numbers come from the database, not the model) |

## Attribution methodology
User-level first installs are de-duplicated per device per app (provider event id or fingerprint). A device seen before is
a reinstall. Paid = attributed to a campaign/media source; organic = explicitly organic; otherwise unattributed. iOS
SKAdNetwork and AdAttributionKit postbacks are aggregate (`aggregateAttributedInstalls`) and are never matched to users or
de-duplicated against user-level installs. Aggregate GA4/Firebase/Adjust counts are used only for days without user-level
data. Default attribution window: 7 days (configurable per source). CPI = spend ÷ platform-reported installs per campaign.

## Providers
Gemini (google-genai, Google Search grounding, images via Gemini image models, video via Veo), Anthropic (structured
outputs, web search tool), OpenAI (structured outputs, images), Ollama (self-hosted, JSON-schema output). Prices per
model are configured by the Super Admin for cost tracking.
