# Automation workflows

Engine: `WorkflowEngine` records each step's status in `workflow_executions.steps`, so retried jobs resume after the last
finished step. Executions are unique per idempotency key; scheduled ticks fan out to one execution per organization
(`<workflow>:<org>:<minute>`). Schedules are UTC cron, editable by the Super Admin (`automation_workflows.schedule`).

| Workflow | Trigger | Steps |
|---|---|---|
| A App onboarding | app added / manual | validate ids → store metadata → market research → ASO audit (per platform with a listing) → growth strategy → notify |
| B Campaign creation | approved strategy | load strategy → verify accounts → verify budget → draft campaigns → generate creatives → policy checks → notify for approval (platform creation happens at launch) |
| C Monitoring | `0 */2 * * *` | sync metrics & spend → pull attribution → rollups → detect anomalies → apply permitted actions → alerts |
| D Budget optimisation | `15 */4 * * *` | live campaigns → spend → Budget Optimization agent → BudgetEngine under policy → decisions recorded |
| E Daily reporting | `30 3 * * *` | compute → AI narrative → PDF/CSV → email |
| F Monthly planning | `0 4 1 * *` | rollups + monthly report → analytics agent → strategy per app → notify |
| G Integration health | `45 * * * *` | expiring tokens → API probes → disable unsafe automation → notify on failing sources |

Anomaly rules (monitoring): CPI over target × policy multiple (≥10 installs, 3 days) → pause/propose; spend with no installs
→ pause/propose; no impressions for 2 days → alert; spend > 1.5× daily budget → alert; platform installs but none
attributed → tracking alert; monthly budget (after reserve) exhausted → pause all active campaigns (customer limit, executed
whenever automation is on). Mutating workflows skip organizations with automation stopped.
