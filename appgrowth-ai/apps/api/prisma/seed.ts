/* Idempotent platform seed: reference data only. No demo customers, campaigns or analytics are created. */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../src/common/permissions';

const prisma = new PrismaClient();

const PLANS = [
  { key: 'free_trial', name: 'Free Trial', priceMinor: 0n, trialDays: 14, maxApps: 1, maxMembers: 2, maxAdAccounts: 1, aiGenerationsMonth: 50, aiTokensMonth: 500_000n, sortOrder: 0, features: { reports: ['daily'], autonomy: ['RECOMMENDATION'] } },
  { key: 'starter', name: 'Starter', priceMinor: 2_999_00n, trialDays: 0, maxApps: 2, maxMembers: 3, maxAdAccounts: 2, aiGenerationsMonth: 200, aiTokensMonth: 2_000_000n, sortOrder: 1, features: { reports: ['daily', 'weekly'], autonomy: ['RECOMMENDATION', 'APPROVED_AUTOMATION'] } },
  { key: 'professional', name: 'Professional', priceMinor: 9_999_00n, trialDays: 0, maxApps: 10, maxMembers: 10, maxAdAccounts: 8, aiGenerationsMonth: 1000, aiTokensMonth: 10_000_000n, sortOrder: 2, features: { reports: ['daily', 'weekly', 'monthly'], autonomy: ['RECOMMENDATION', 'APPROVED_AUTOMATION', 'AUTONOMOUS'] } },
  { key: 'agency', name: 'Agency', priceMinor: 29_999_00n, trialDays: 0, maxApps: 50, maxMembers: 50, maxAdAccounts: 40, aiGenerationsMonth: 5000, aiTokensMonth: 50_000_000n, sortOrder: 3, features: { reports: ['daily', 'weekly', 'monthly'], autonomy: ['RECOMMENDATION', 'APPROVED_AUTOMATION', 'AUTONOMOUS'], multiClient: true } },
  { key: 'enterprise', name: 'Enterprise', priceMinor: 0n, trialDays: 0, maxApps: 500, maxMembers: 500, maxAdAccounts: 500, aiGenerationsMonth: 50000, aiTokensMonth: 500_000_000n, sortOrder: 4, isPublic: false, features: { reports: ['daily', 'weekly', 'monthly'], autonomy: ['RECOMMENDATION', 'APPROVED_AUTOMATION', 'AUTONOMOUS'], customPricing: true } },
];

const PROVIDERS = [
  { key: 'google_ads', name: 'Google Ads', category: 'advertising', docsUrl: 'https://developers.google.com/google-ads/api/docs/start' },
  { key: 'apple_ads', name: 'Apple Ads (Search Ads)', category: 'advertising', docsUrl: 'https://developer.apple.com/documentation/apple_ads' },
  { key: 'meta_ads', name: 'Meta Ads', category: 'advertising', docsUrl: 'https://developers.facebook.com/docs/marketing-apis' },
  { key: 'tiktok_ads', name: 'TikTok Ads', category: 'advertising', docsUrl: 'https://business-api.tiktok.com/portal/docs' },
  { key: 'firebase', name: 'Firebase Analytics', category: 'analytics', docsUrl: 'https://firebase.google.com/docs/analytics' },
  { key: 'ga4', name: 'Google Analytics 4', category: 'analytics', docsUrl: 'https://developers.google.com/analytics/devguides/reporting/data/v1' },
  { key: 'appsflyer', name: 'AppsFlyer', category: 'analytics', docsUrl: 'https://dev.appsflyer.com/hc/docs/pull-api' },
  { key: 'adjust', name: 'Adjust', category: 'analytics', docsUrl: 'https://dev.adjust.com/en/api/rs-api' },
  { key: 'play_console', name: 'Google Play Developer API', category: 'store', docsUrl: 'https://developers.google.com/android-publisher' },
  { key: 'app_store_connect', name: 'App Store Connect API', category: 'store', docsUrl: 'https://developer.apple.com/documentation/appstoreconnectapi' },
];

const TOOLS = [
  { key: 'app.get_profile', description: 'Read the application profile, platforms, targets and countries', mutating: false },
  { key: 'store.get_listing', description: 'Read the latest store listing snapshot', mutating: false },
  { key: 'store.lookup_public', description: 'Look up public App Store / Play metadata for an app id', mutating: false },
  { key: 'research.web_search', description: 'Grounded web search through the AI provider (sources returned)', mutating: false },
  { key: 'analytics.get_summary', description: 'Read install, spend and CPI aggregates for a date range', mutating: false },
  { key: 'analytics.get_campaign_daily', description: 'Read per-campaign daily metrics', mutating: false },
  { key: 'analytics.get_retention', description: 'Read D1/D7/D30 retention cohorts', mutating: false },
  { key: 'budget.get_status', description: 'Read budgets, spend to date, remaining and policy limits', mutating: false },
  { key: 'campaign.list', description: 'List campaigns with status and settings', mutating: false },
  { key: 'campaign.propose_change', description: 'Record a proposed budget/status change for review', mutating: false },
  { key: 'campaign.set_budget', description: 'Change a campaign budget (policy-checked, locked, idempotent)', mutating: true },
  { key: 'campaign.pause', description: 'Pause a campaign on the ad platform', mutating: true },
  { key: 'campaign.resume', description: 'Resume a paused campaign', mutating: true },
  { key: 'creative.save_variant', description: 'Save a generated creative as a pending draft', mutating: false },
  { key: 'report.save', description: 'Save a generated report', mutating: false },
];

const AGENTS = [
  { key: 'market_research', name: 'Market Research Agent', description: 'Markets, competitors, audiences, keywords and opportunities with evidence and confidence', tools: ['app.get_profile', 'store.get_listing', 'research.web_search'] },
  { key: 'aso', name: 'ASO Agent', description: 'Store listing audit: title, description, keywords, screenshots and localisation', tools: ['app.get_profile', 'store.get_listing', 'store.lookup_public', 'research.web_search'] },
  { key: 'creative', name: 'Creative Agent', description: 'Ad copy, headlines, image prompts/assets and video scripts within brand and policy rules', tools: ['app.get_profile', 'store.get_listing', 'creative.save_variant'] },
  { key: 'campaign_strategy', name: 'Campaign Strategy Agent', description: 'Channel mix, CPI and budget estimates, campaign structure and forecast before execution', tools: ['app.get_profile', 'analytics.get_summary', 'budget.get_status', 'campaign.list'] },
  { key: 'campaign_execution', name: 'Campaign Execution Agent', description: 'Creates, launches, pauses and syncs campaigns through official ad APIs', tools: ['campaign.list', 'campaign.pause', 'campaign.resume'] },
  { key: 'budget_optimization', name: 'Budget Optimization Agent', description: 'Spend and CPI monitoring, reallocation within hard limits', tools: ['budget.get_status', 'analytics.get_campaign_daily', 'campaign.list', 'campaign.propose_change', 'campaign.set_budget', 'campaign.pause'], schedule: '15 */4 * * *' },
  { key: 'analytics', name: 'Analytics Agent', description: 'Installs, CPI, funnels, anomalies and month-end forecast', tools: ['analytics.get_summary', 'analytics.get_campaign_daily', 'analytics.get_retention'], schedule: '30 2 * * *' },
  { key: 'growth', name: 'Growth Agent', description: 'Evaluates growth, proposes experiments, audiences and countries; coordinates other agents', tools: ['app.get_profile', 'analytics.get_summary', 'budget.get_status', 'campaign.list'] },
  { key: 'retention', name: 'Retention Agent', description: 'D1/D7/D30 retention and acquisition quality by source', tools: ['analytics.get_retention', 'analytics.get_summary'] },
  { key: 'reporting', name: 'Reporting Agent', description: 'Narrative for daily, weekly and monthly reports from computed metrics', tools: ['analytics.get_summary', 'budget.get_status', 'campaign.list', 'report.save'] },
];

const WORKFLOWS = [
  { key: 'app_onboarding', name: 'New application onboarding', description: 'Validate ids, fetch store metadata, research, ASO, strategy, budget estimate, notify', steps: ['validate_identifiers', 'fetch_store_metadata', 'market_research', 'aso_audit', 'growth_strategy', 'notify'] },
  { key: 'campaign_creation', name: 'Campaign creation', description: 'From an approved strategy: verify auth and budget, build structure, creatives, policy checks, create via API', steps: ['load_strategy', 'verify_account', 'verify_budget', 'build_structure', 'generate_creatives', 'policy_checks', 'create_campaigns', 'verify_status'] },
  { key: 'campaign_monitoring', name: 'Campaign monitoring', description: 'Sync metrics and spend, compute CPI, detect anomalies, apply permitted actions, alert', steps: ['sync_metrics', 'sync_spend', 'compute_kpis', 'detect_anomalies', 'apply_actions', 'alerts'], schedule: '0 */2 * * *' },
  { key: 'budget_optimization', name: 'Budget optimization', description: 'Spend vs limits, efficiency, reallocations under policy and locks', steps: ['load_campaigns', 'compute_spend', 'evaluate', 'reallocate', 'record'], schedule: '15 */4 * * *' },
  { key: 'daily_reporting', name: 'Daily reporting', description: 'Generate and email the daily report to opted-in users', steps: ['compute', 'narrate', 'render', 'deliver'], schedule: '30 3 * * *' },
  { key: 'monthly_planning', name: 'Monthly growth planning', description: 'Review last month and draft next month’s plan for approval', steps: ['review', 'forecast', 'plan', 'notify'], schedule: '0 4 1 * *' },
  { key: 'integration_health', name: 'Integration health', description: 'Expired/revoked credentials, failing APIs, disable unsafe automation, notify', steps: ['check_tokens', 'probe_apis', 'disable_unsafe', 'notify'], schedule: '45 * * * *' },
];

const AI_PROVIDERS = [
  { key: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com', models: [{ modelId: 'gemini-3.5-flash', purpose: 'text' }] },
  { key: 'anthropic', name: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com', models: [{ modelId: 'claude-sonnet-5-5', purpose: 'text' }, { modelId: 'claude-haiku-5-5', purpose: 'text' }] },
  { key: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com', models: [{ modelId: 'gpt-image-1', purpose: 'image' }] },
  { key: 'ollama', name: 'Ollama (self-hosted)', baseUrl: 'http://ollama:11434', models: [{ modelId: 'llama3.1:8b', purpose: 'text' }] },
];

const FLAGS = [
  { key: 'integration.google_ads', description: 'Allow connecting Google Ads (requires developer token approval)' },
  { key: 'integration.apple_ads', description: 'Allow connecting Apple Ads' },
  { key: 'integration.meta_ads', description: 'Allow connecting Meta Ads (requires app review for ads_management)' },
  { key: 'integration.tiktok_ads', description: 'Allow connecting TikTok Ads' },
  { key: 'creative.video_generation', description: 'Video generation provider configured' },
  { key: 'billing.online_payments', description: 'Online subscription payments via gateway' },
];

async function main() {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, create: { key, description }, update: { description } });
  }
  const perms = await prisma.permission.findMany();
  for (const [key, r] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({ where: { key }, create: { key, name: r.name, description: r.description }, update: { name: r.name, description: r.description } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: perms.filter((p) => (r.permissions as string[]).includes(p.key)).map((p) => ({ roleId: role.id, permissionId: p.id })) });
  }
  for (const p of PLANS) {
    // Prices/limits are owned by Super Admin after the first seed: only create, never overwrite.
    await prisma.subscriptionPlan.upsert({ where: { key: p.key }, create: { ...p, currency: 'INR' }, update: {} });
  }
  for (const p of PROVIDERS) await prisma.integrationProvider.upsert({ where: { key: p.key }, create: p, update: { name: p.name, docsUrl: p.docsUrl } });
  for (const t of TOOLS) await prisma.aiAgentTool.upsert({ where: { key: t.key }, create: { ...t, inputSchema: {} }, update: { description: t.description, mutating: t.mutating } });
  for (const a of AGENTS) await prisma.aiAgentDefinition.upsert({ where: { key: a.key }, create: a, update: { name: a.name, description: a.description, tools: a.tools } });
  for (const w of WORKFLOWS) {
    const wf = await prisma.automationWorkflow.upsert({ where: { key: w.key }, create: { key: w.key, name: w.name, description: w.description, schedule: w.schedule }, update: { name: w.name, description: w.description } });
    await prisma.workflowVersion.upsert({ where: { workflowId_version: { workflowId: wf.id, version: wf.currentVersion } }, create: { workflowId: wf.id, version: wf.currentVersion, steps: w.steps }, update: { steps: w.steps } });
  }
  for (const p of AI_PROVIDERS) {
    const envKey = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', ollama: 'OLLAMA_BASE_URL' }[p.key]!;
    const provider = await prisma.aiProvider.upsert({
      where: { key: p.key },
      create: { key: p.key, name: p.name, baseUrl: p.baseUrl, enabled: !!process.env[envKey], isDefault: p.key === (process.env.AI_DEFAULT_PROVIDER ?? 'gemini') },
      update: { name: p.name },
    });
    for (const m of p.models) await prisma.aiModel.upsert({ where: { providerId_modelId: { providerId: provider.id, modelId: m.modelId } }, create: { providerId: provider.id, ...m }, update: {} });
  }
  for (const f of FLAGS) await prisma.featureFlag.upsert({ where: { key: f.key }, create: { ...f, orgAllowList: [] }, update: { description: f.description } });

  const email = process.env.SEED_SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (email && password) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({ data: { email, name: process.env.SEED_SUPERADMIN_NAME ?? 'Platform Admin', passwordHash, platformRole: 'SUPER_ADMIN', emailVerifiedAt: new Date() } });
      console.log(`Super Admin created: ${email} (enable two-factor authentication at first sign-in)`);
    } else if (existing.platformRole !== 'SUPER_ADMIN') {
      await prisma.user.update({ where: { email }, data: { platformRole: 'SUPER_ADMIN' } });
      console.log(`Existing user promoted to Super Admin: ${email}`);
    }
  }
  console.log('Seed complete');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
