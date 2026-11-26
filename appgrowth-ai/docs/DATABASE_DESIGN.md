# Database design

PostgreSQL 16, Prisma schema at `apps/api/prisma/schema.prisma`, migrations in `apps/api/prisma/migrations` (forward-only).

## Conventions
UUID primary keys · `timestamptz` (UTC) · money as `BigInt` minor units + ISO currency · provider ids in `external*`
columns · soft deletion (`deletedAt`) for organizations, users, applications, campaigns, creatives, connected accounts.

## Tenant isolation
Every tenant-owned table has `organizationId` (NOT NULL). Migration `*_rls` enables Row Level Security with policy
`organizationId = current_setting('app.org_id')` for role `appgrowth_tenant`. Customer requests run through
`PrismaService.tenant(orgId, userId, fn)`, which sets the setting and `SET LOCAL ROLE appgrowth_tenant` inside a
transaction. The owner role (system jobs, Super Admin) bypasses RLS and always filters explicitly. Notifications use a
per-user policy. Re-run `SELECT apply_tenant_rls();` in a migration after adding tenant tables.

## Entity groups
SaaS/auth (organizations, users, organization_members, roles, permissions, role_permissions, user_sessions,
refresh_tokens, password_reset_tokens, invitations, subscription_plans, subscriptions, invoices, payments) · Applications
(applications, application_platforms, application_store_listings [snapshots], application_assets, _countries,
_languages, _targets, _events) · Integrations (integration_providers, connected_accounts, oauth_tokens [encrypted],
oauth_states, integration_permissions, account_applications, integration_sync_logs, webhook_endpoints, webhook_events)
· Intelligence (market_research, competitors, competitor_apps, keyword_research, aso_audits, audience_segments,
marketing_strategies) · Creative (brand_kits, creative_projects, creative_assets, creative_versions, creative_prompts,
creative_approvals, creative_performance) · Campaigns (campaign_groups, campaigns, campaign_adsets, campaign_ads,
campaign_creatives, campaign_budgets, campaign_metrics, campaign_actions, campaign_experiments) · AI/automation
(ai_providers, ai_models, ai_agent_definitions, ai_agent_tools, ai_agent_executions, ai_execution_logs, ai_usage,
automation_policies, automation_workflows, workflow_versions, workflow_executions, scheduled_jobs,
optimization_decisions) · Analytics (install_events, attribution_events, conversion_events, analytics_daily,
analytics_campaign_daily, retention_metrics, country_metrics) · Finance (organization_budgets,
advertising_budget_allocations, advertising_spend, subscription_transactions, usage_charges, cost_records) · Operations
(notifications, notification_preferences, reports, audit_logs, support_tickets, system_settings, feature_flags, api_logs, error_logs).

## De-duplication keys
`install_events(applicationId, dedupeKey)`, `conversion_events(applicationId, dedupeKey)`, `attribution_events(applicationId,
dedupeKey)`, `campaign_metrics(campaignId, date, country)`, `advertising_spend(connectedAccountId, campaignId, date)`,
`webhook_events(providerKey, externalId)`, `campaign_actions(idempotencyKey)`, `workflow_executions(idempotencyKey)`.
