import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { CryptoService } from '../src/common/crypto.service';
import { PrismaService } from '../src/common/prisma.service';
import { AiClient } from '../src/modules/ai/ai-client';
import { AnalyticsEngine } from '../src/modules/attribution/analytics-engine.service';
import { BudgetEngine } from '../src/modules/automation/budget-engine.service';
import { CampaignExecutor } from '../src/modules/campaigns/executor.service';
import { SyncService } from '../src/modules/campaigns/sync.service';
import { overrideProvider } from '../src/modules/integrations/providers/registry';
import { AdvertisingProvider } from '../src/modules/integrations/providers/types';
import { ReportsService } from '../src/modules/reports/reports.service';
import { StoreService } from '../src/modules/store/store.service';
import { closeQueues } from '../src/queues/queues';
import { ServicesModule } from '../src/services.module';
import { fakeStore, signUp } from './helpers';

/** Fake Google Ads adapter recording calls; behaves like the real one from the platform's point of view. */
const platform = { created: 0, statuses: [] as string[], budgets: [] as string[], campaigns: new Map<string, string>() };
const fakeGoogle: AdvertisingProvider = {
  key: 'google_ads', enumKey: 'GOOGLE_ADS', name: 'Google Ads', authType: 'oauth', readiness: 'implemented_unverified',
  configured: () => true, setupChecklist: () => [],
  authorizeUrl: (state) => `https://accounts.example/auth?state=${state}`,
  listAccounts: async () => [{ externalId: '1234567890', name: 'Test account', currency: 'INR', timezone: 'Asia/Kolkata' }],
  checkPermissions: async () => ({ read_reports: true, manage_campaigns: true }),
  createCampaign: async (_c, spec, idem) => { const hit = platform.campaigns.get(idem); if (hit) return { externalCampaignId: hit, externalStatus: 'PAUSED' }; platform.created++; const id = `9${platform.created}`; platform.campaigns.set(idem, id); expect(spec.creatives.headlines.length).toBeGreaterThan(0); return { externalCampaignId: id, externalStatus: 'PAUSED' }; },
  setStatus: async (_c, id, s) => { platform.statuses.push(`${id}:${s}`); return s === 'ACTIVE' ? 'ENABLED' : 'PAUSED'; },
  setDailyBudget: async (_c, id, minor) => { platform.budgets.push(`${id}:${minor}`); },
  getStatus: async () => 'ENABLED/ELIGIBLE',
  metrics: async (_c, ids) => ids.flatMap((id) => [0, 1, 2].map((d) => ({ externalCampaignId: id, date: new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10), country: 'IN', impressions: 10000n, clicks: 400n, installs: 50, spendMinor: 100_000n }))),
};
const fakeAi = { runAgent: async () => ({ output: { headline: 'h', summary: 's', highlights: [], concerns: [], next_steps: [], decisions: [] }, usage: { input_tokens: 1, output_tokens: 1 }, cost_micros: 0, sources: [], provider: 'fake', model: 'f', grounded: false, warnings: [], duration_ms: 1 }), media: async () => { throw new Error('n/a'); }, check: async () => ({ ok: true }), health: async () => true };

describe('Campaigns, budget protection, attribution and reports', () => {
  let app: INestApplication; let prisma: PrismaService; let crypto: CryptoService; let executor: CampaignExecutor;
  beforeAll(async () => {
    overrideProvider('google_ads', fakeGoogle);
    const mod = await Test.createTestingModule({ imports: [AppModule, ServicesModule] }).overrideProvider(StoreService).useValue(fakeStore).overrideProvider(AiClient).useValue(fakeAi).compile();
    app = mod.createNestApplication({ bodyParser: false }); configureApp(app); await app.init();
    prisma = app.get(PrismaService); crypto = app.get(CryptoService); executor = app.get(CampaignExecutor);
    await prisma.featureFlag.update({ where: { key: 'integration.google_ads' }, data: { enabled: true } });
    await prisma.aiProvider.update({ where: { key: 'gemini' }, data: { enabled: true, isDefault: true } });
  });
  afterAll(async () => { await prisma?.featureFlag.update({ where: { key: 'integration.google_ads' }, data: { enabled: false } }); await closeQueues(); await app?.close(); });

  async function setup(orgName: string) {
    const a = await signUp(app, orgName);
    const pro = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { key: 'professional' } });
    await prisma.subscription.updateMany({ where: { organizationId: a.orgId }, data: { planId: pro.id, status: 'ACTIVE' } });
    const appRes = await a.as('post', '/api/v1/apps').send({ name: 'Fit', android: { packageName: `com.example.fit${Date.now()}` }, runOnboarding: false, targetCpi: '20.00' }).expect(201);
    // Account as it exists after a completed OAuth flow.
    const acc = await prisma.connectedAccount.create({ data: { organizationId: a.orgId, providerKey: 'google_ads', externalAccountId: '1234567890', name: 'Test account', currency: 'INR', status: 'CONNECTED', scopes: [] } });
    await prisma.oAuthToken.create({ data: { organizationId: a.orgId, connectedAccountId: acc.id, accessTokenEnc: crypto.encrypt('access'), refreshTokenEnc: crypto.encrypt('refresh'), expiresAt: new Date(Date.now() + 3600_000) } });
    const proj = await prisma.creativeProject.create({ data: { organizationId: a.orgId, applicationId: appRes.body.id, name: 'p' } });
    const cr = await prisma.creativeAsset.create({ data: { organizationId: a.orgId, projectId: proj.id, applicationId: appRes.body.id, type: 'HEADLINE', title: 'h', approvalStatus: 'APPROVED', versions: { create: { organizationId: a.orgId, version: 1, content: { headline: 'Log meals fast' }, provider: 'manual', model: 'human' } } } });
    return { a, appId: appRes.body.id as string, accountId: acc.id, creativeId: cr.id };
  }
  const today = () => new Date().toISOString().slice(0, 10);
  async function runAction(actionId: string) { return executor.run(actionId); }

  it('runs the full lifecycle: draft → approval → launch (idempotent) → budget → pause; policy enforced twice', async () => {
    const { a, appId, accountId, creativeId } = await setup('Lifecycle');
    const c = await a.as('post', '/api/v1/campaigns').send({ applicationId: appId, provider: 'GOOGLE_ADS', platform: 'ANDROID', connectedAccountId: accountId, name: 'UAC India', countries: ['IN'], dailyBudget: '1000.00', startDate: today(), creativeIds: [creativeId] }).expect(201);
    expect(c.body.status).toBe('DRAFT');
    await a.as('post', `/api/v1/campaigns/${c.body.id}/launch`).expect(409); // can't skip approval
    await a.as('post', `/api/v1/campaigns/${c.body.id}/submit`).expect(200);
    await a.as('post', `/api/v1/campaigns/${c.body.id}/approve`).expect(200);
    // No monthly budget yet: a person may still launch (agents may not). Set a budget that cannot cover the campaign.
    await a.as('post', '/api/v1/budgets').send({ month: today().slice(0, 7), monthlyLimit: '5000.00' }).expect(201);
    const blocked = await a.as('post', `/api/v1/campaigns/${c.body.id}/launch`).expect(409);
    expect(blocked.body.error.code).toBe('policy_monthly_cap');
    const b = await a.as('get', '/api/v1/budgets').expect(200);
    await a.as('patch', `/api/v1/budgets/${b.body[0].id}`).send({ monthlyLimit: '100000.00' }).expect(200);
    const launch = await a.as('post', `/api/v1/campaigns/${c.body.id}/launch`).expect(202);
    // Between request and execution the budget shrinks: the executor re-checks and refuses.
    await prisma.organizationBudget.update({ where: { id: b.body[0].id }, data: { monthlyLimitMinor: 100_00n } });
    expect(await runAction(launch.body.actionId)).toBe('failed');
    expect((await prisma.campaignAction.findUniqueOrThrow({ where: { id: launch.body.actionId } })).error).toMatch(/spending policy/);
    expect(platform.created).toBe(0);
    await prisma.organizationBudget.update({ where: { id: b.body[0].id }, data: { monthlyLimitMinor: 100_000_00n } });
    const launch2 = await a.as('post', `/api/v1/campaigns/${c.body.id}/launch`).expect(202);
    expect(await runAction(launch2.body.actionId)).toBe('succeeded');
    expect(await runAction(launch2.body.actionId)).toBe('succeeded'); // idempotent re-run
    const live = await a.as('get', `/api/v1/campaigns/${c.body.id}`).expect(200);
    expect(live.body).toMatchObject({ status: 'ACTIVE', externalCampaignId: '91' });
    expect(platform.created).toBe(1);
    // Budget change above the per-campaign cap is refused; within limits it goes to the platform.
    await a.as('patch', `/api/v1/organizations/${a.orgId}/automation-policy`).send({ maxCampaignBudget: '2000.00' }).expect(200);
    const over = await a.as('patch', `/api/v1/campaigns/${c.body.id}`).send({ dailyBudget: '2500.00' }).expect(409);
    expect(over.body.error.code).toBe('policy_campaign_cap');
    await a.as('patch', `/api/v1/campaigns/${c.body.id}`).send({ dailyBudget: '1500.00' }).expect(200);
    const act = await prisma.campaignAction.findFirstOrThrow({ where: { campaignId: c.body.id, action: 'budget_change' } });
    expect(await runAction(act.id)).toBe('succeeded');
    expect(platform.budgets).toContain('91:150000');
    const pause = await a.as('post', `/api/v1/campaigns/${c.body.id}/pause`).send({ reason: 'test' }).expect(202);
    expect(await runAction(pause.body.actionId)).toBe('succeeded');
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: c.body.id } })).status).toBe('PAUSED');
    // Another org can't see or act on it.
    const other = await signUp(app, 'Other');
    await other.as('get', `/api/v1/campaigns/${c.body.id}`).expect(404);
    await other.as('post', `/api/v1/campaigns/${c.body.id}/resume`).expect(404);
  });

  it('syncs platform metrics idempotently and rolls them up', async () => {
    const { a, appId, accountId } = await setup('Sync');
    const camp = await prisma.campaign.create({ data: { organizationId: a.orgId, applicationId: appId, connectedAccountId: accountId, name: 'synced', provider: 'GOOGLE_ADS', platform: 'ANDROID', countries: ['IN'], languages: ['en'], dailyBudgetMinor: 100_000n, currency: 'INR', startDate: new Date(), status: 'ACTIVE', externalCampaignId: '777' } });
    const sync = app.get(SyncService);
    await sync.syncAccount(accountId); await sync.syncAccount(accountId); // twice: must not double
    const m = await prisma.campaignMetric.aggregate({ where: { campaignId: camp.id }, _sum: { installs: true, spendMinor: true } });
    expect(m._sum).toEqual({ installs: 150, spendMinor: 300_000n });
    const spend = await prisma.advertisingSpend.aggregate({ where: { campaignId: camp.id }, _sum: { amountMinor: true } });
    expect(spend._sum.amountMinor).toBe(300_000n);
    await app.get(AnalyticsEngine).rollupOrg(a.orgId, 5);
    const cpi = await a.as('get', `/api/v1/analytics/campaigns?applicationId=${appId}`).expect(200);
    expect(cpi.body.find((x: { id: string }) => x.id === camp.id)).toMatchObject({ installs: 150, spend: '3000.00', cpi: '20.00' });
  });

  it('applies optimisation decisions according to autonomy level', async () => {
    const { a, appId, accountId } = await setup('Autonomy');
    await a.as('post', '/api/v1/budgets').send({ month: today().slice(0, 7), monthlyLimit: '900000.00' }).expect(201);
    const camp = await prisma.campaign.create({ data: { organizationId: a.orgId, applicationId: appId, connectedAccountId: accountId, name: 'opt', provider: 'GOOGLE_ADS', platform: 'ANDROID', countries: ['IN'], languages: ['en'], dailyBudgetMinor: 100_000n, currency: 'INR', startDate: new Date(), status: 'ACTIVE', externalCampaignId: '555' } });
    const engine = app.get(BudgetEngine);
    const res = (decisions: unknown[]) => ({ output: { decisions }, usage: { input_tokens: 0, output_tokens: 0 }, cost_micros: 0, sources: [], provider: 'f', model: 'f', grounded: false, warnings: [], duration_ms: 0 });
    // Level 1: everything is proposed
    let r = await engine.apply(a.orgId, '00000000-0000-0000-0000-000000000001', res([{ campaign_id: camp.id, kind: 'decrease', new_daily_budget: 800, rationale: 'CPI high', confidence: 0.8 }]));
    expect(r).toMatchObject({ proposed: 1, executed: 0 });
    // Level 2: decreases execute, increases wait; a 50% increase is beyond the 20% cap → proposed
    await a.as('patch', `/api/v1/organizations/${a.orgId}/automation-policy`).send({ autonomyLevel: 'APPROVED_AUTOMATION' }).expect(200);
    r = await engine.apply(a.orgId, '00000000-0000-0000-0000-000000000002', res([{ campaign_id: camp.id, kind: 'decrease', new_daily_budget: 800, rationale: 'r', confidence: 0.8 }, { campaign_id: camp.id, kind: 'increase', new_daily_budget: 1100, rationale: 'r', confidence: 0.8 }]));
    expect(r).toMatchObject({ executed: 1, proposed: 1 });
    // Level 3: increases within the cap execute; over-cap ones are proposed; unknown campaigns ignored
    await a.as('patch', `/api/v1/organizations/${a.orgId}/automation-policy`).send({ autonomyLevel: 'AUTONOMOUS' }).expect(200);
    r = await engine.apply(a.orgId, '00000000-0000-0000-0000-000000000003', res([{ campaign_id: camp.id, kind: 'increase', new_daily_budget: 1100, rationale: 'r', confidence: 0.9 }, { campaign_id: camp.id, kind: 'increase', new_daily_budget: 5000, rationale: 'r', confidence: 0.9 }, { campaign_id: '00000000-0000-0000-0000-00000000dead', kind: 'pause', rationale: 'x', confidence: 1 }]));
    expect(r).toMatchObject({ executed: 1, proposed: 1, ignored: 1 });
    // Emergency stop: nothing executes
    await a.as('post', `/api/v1/organizations/${a.orgId}/automation`).send({ enabled: false }).expect(201);
    r = await engine.apply(a.orgId, '00000000-0000-0000-0000-000000000004', res([{ campaign_id: camp.id, kind: 'pause', rationale: 'r', confidence: 1 }]));
    expect(r).toMatchObject({ executed: 0, proposed: 1 });
    const list = await a.as('get', '/api/v1/automation/decisions?outcome=proposed').expect(200);
    expect(list.body.length).toBeGreaterThanOrEqual(3);
  });

  it('ingests signed events with de-duplication, reinstall detection and aggregate iOS attribution', async () => {
    const { a, appId } = await setup('Attribution');
    const src = await a.as('put', `/api/v1/apps/${appId}/attribution/APPSFLYER`).send({ config: { appId: 'com.example.fit' } }).expect(200);
    expect(src.body.webhookSecret).toBeTruthy();
    const send = (events: unknown[], opts: { secret?: string; t?: number } = {}) => {
      const body = JSON.stringify({ events }); const t = opts.t ?? Math.floor(Date.now() / 1000);
      const sig = createHmac('sha256', opts.secret ?? src.body.webhookSecret).update(`${t}.${body}`).digest('hex');
      return request(app.getHttpServer()).post(`/api/v1/ingest/${src.body.id}/events`).set('Content-Type', 'application/json').set('X-AppGrowth-Signature', `t=${t},v1=${sig}`).send(body);
    };
    const at = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const events = [
      { event_id: 'e1', type: 'install', device_id: 'DEV-1', occurred_at: at, country: 'in', media_source: 'googleadwords_int', platform: 'android' },
      { event_id: 'e2', type: 'install', device_id: 'DEV-2', occurred_at: at, country: 'IN', media_source: 'organic', platform: 'android' },
      { event_id: 'e3', type: 'install', device_id: 'DEV-1', occurred_at: new Date().toISOString(), platform: 'android' }, // same device again → reinstall
      { event_id: 'e4', type: 'sign_up', device_id: 'DEV-2', occurred_at: at, platform: 'android' },
      { event_id: 'e5', type: 'skan_install', installs: 12, occurred_at: at, platform: 'ios' },
      { type: 'install', occurred_at: 'not a date' },
    ];
    const r1 = await send(events).expect(202);
    expect(r1.body).toMatchObject({ installs: 3, conversions: 1, aggregates: 1, rejected: 1 });
    const r2 = await send(events, { t: Math.floor(Date.now() / 1000) - 1 }).expect(202); // same events, new request
    expect(r2.body).toMatchObject({ accepted: 0, duplicates: 5 });
    await send(events, { secret: 'wrong' }).expect(401);
    await send(events, { t: Math.floor(Date.now() / 1000) - 3600 }).expect(401); // stale timestamp
    const kinds = await prisma.installEvent.groupBy({ by: ['kind', 'attribution'], where: { applicationId: appId }, _count: true });
    expect(kinds.find((k) => k.kind === 'REINSTALL')?._count).toBe(1);
    expect(await prisma.installEvent.count({ where: { applicationId: appId, deviceIdHash: 'DEV-1' } })).toBe(0); // raw ids never stored
    await app.get(AnalyticsEngine).rollupOrg(a.orgId, 5);
    const o = await a.as('get', `/api/v1/analytics/overview?applicationId=${appId}`).expect(200);
    expect(o.body.totals).toMatchObject({ installs: 2 + 12, paidInstalls: 1 + 12, organicInstalls: 1, reinstalls: 1, registrations: 1, aggregateAttributedInstalls: 12 });
  });

  it('builds downloadable PDF/CSV reports safely', async () => {
    const { a, appId } = await setup('Reports');
    await prisma.campaign.create({ data: { organizationId: a.orgId, applicationId: appId, name: '=HYPERLINK("http://evil")', provider: 'GOOGLE_ADS', platform: 'ANDROID', countries: ['IN'], languages: ['en'], dailyBudgetMinor: 100n, currency: 'INR', startDate: new Date(), status: 'ACTIVE' } });
    const req = await a.as('post', '/api/v1/reports/generate').send({ kind: 'weekly' }).expect(202);
    const built = await app.get(ReportsService).build(req.body.id);
    expect(built!.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(built!.csv).toContain(`"'=HYPERLINK(""http://evil"")`); // formula neutralised
    const dl = await a.as('get', `/api/v1/reports/${req.body.id}/download?format=csv`).expect(200);
    const file = await a.as('get', dl.body.url, null).expect(200);
    expect(file.headers['content-type']).toMatch(/text\/csv/);
    const other = await signUp(app, 'Snoop');
    await other.as('get', `/api/v1/reports/${req.body.id}`).expect(404);
  });

  it('protects the OAuth flow with single-use state and feature flags', async () => {
    const { a } = await setup('OAuth');
    const c = await a.as('post', '/api/v1/integrations/google_ads/connect').expect(200);
    const state = new URL(c.body.authorizeUrl).searchParams.get('state');
    const bad = await request(app.getHttpServer()).get('/api/v1/integrations/google_ads/callback?code=x&state=forged').expect(302);
    expect(bad.headers.location).toMatch(/error=/);
    const denied = await request(app.getHttpServer()).get(`/api/v1/integrations/google_ads/callback?error=access_denied&state=${state}`).expect(302);
    expect(denied.headers.location).toMatch(/error=access_denied/);
    const reused = await request(app.getHttpServer()).get(`/api/v1/integrations/google_ads/callback?code=x&state=${state}`).expect(302);
    expect(reused.headers.location).toMatch(/already%20used|expired/);
    const meta = await a.as('post', '/api/v1/integrations/meta_ads/connect').expect(409);
    expect(meta.body.error.code).toBe('integration_unavailable'); // flag off until API access is approved
    const ov = await a.as('get', '/api/v1/integrations').expect(200);
    expect(JSON.stringify(ov.body)).not.toMatch(/accessTokenEnc|refreshTokenEnc/);
  });
});
