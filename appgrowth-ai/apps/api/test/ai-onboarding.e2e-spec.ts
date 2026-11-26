import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/common/prisma.service';
import { AiClient } from '../src/modules/ai/ai-client';
import { Orchestrator } from '../src/modules/ai/orchestrator.service';
import { ToolRegistry } from '../src/modules/ai/tools';
import { StoreService } from '../src/modules/store/store.service';
import { OnboardingWorkflow } from '../src/modules/workflows/onboarding.workflow';
import { WorkflowEngine } from '../src/modules/workflows/workflow-engine.service';
import { closeQueues } from '../src/queues/queues';
import { ServicesModule } from '../src/services.module';
import { fakeStore, signUp } from './helpers';

const OUT: Record<string, Record<string, unknown>> = {
  market_research: { summary: 'Strong demand in IN', markets: [{ country: 'IN', opportunity: 'high', reasoning: 'r', confidence: 0.7 }, { country: 'bad', opportunity: 'low', reasoning: 'x', confidence: 2 }],
    competitors: [{ name: 'HealthifyMe', website: 'https://healthifyme.com', android_package: 'com.healthifyme.basic', ios_app_id: '943291000', notes: 'n' }],
    audiences: [{ name: 'Busy pros', description: 'd', countries: ['IN', 'xx'], age_range: '25-40', interests: ['fitness'] }],
    keywords: [{ keyword: 'Calorie Counter', relevance: 0.9, popularity: 'high', competition: 'high' }], opportunities: [], strategies: ['s'], evidence: [], confidence: 0.6 },
  aso: { score: 140, findings: [{ area: 'title', issue: 'i', recommendation: 'r', impact: 'high' }], suggested_title: 'Fit Tracker: Meal Log', suggested_subtitle: 's', suggested_keywords: ['meal'], localization: [], screenshot_feedback: 'f' },
  campaign_strategy: { title: 'Dec plan', summary: 'Target needs ₹2.5L at ₹25 CPI', channels: [{ provider: 'GOOGLE_ADS', share_pct: 70, platforms: ['ANDROID', 'IOS'], rationale: 'r' }, { provider: 'FAKE_ADS', share_pct: 30, platforms: ['IOS'], rationale: 'x' }],
    country_allocations: [{ country: 'IN', share_pct: 100, rationale: 'r' }], estimated_cpi: { low: 18, expected: 25.5, high: 40 }, estimated_monthly_budget: 255000, forecast_installs: { low: 6000, expected: 10000, high: 13000 },
    campaign_plan: [{ name: 'UAC IN', provider: 'GOOGLE_ADS', platform: 'ANDROID', objective: 'installs', countries: ['IN'], daily_budget: 5000, duration_days: 30, creative_themes: [] }, { name: 'bad', provider: 'APPLE_ADS', platform: 'ANDROID', objective: 'installs', countries: ['IN'], daily_budget: 1, duration_days: 30, creative_themes: [] }],
    assumptions: ['a'], risks: ['r'] },
};
const calls: { key: string; context: Record<string, unknown> }[] = [];
const fakeAi = {
  runAgent: async (key: string, _sel: unknown, context: Record<string, unknown>) => { calls.push({ key, context }); return { output: OUT[key] ?? {}, usage: { input_tokens: 1000, output_tokens: 500 }, cost_micros: 1500, sources: [], provider: 'fake', model: 'fake-1', grounded: false, warnings: [], duration_ms: 5 }; },
  media: async () => { throw new Error('n/a'); }, check: async () => ({ ok: true }), health: async () => true,
};

describe('AI onboarding pipeline', () => {
  let app: INestApplication; let prisma: PrismaService; let engine: WorkflowEngine; let orch: Orchestrator;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule, ServicesModule], providers: [OnboardingWorkflow] }).overrideProvider(StoreService).useValue(fakeStore).overrideProvider(AiClient).useValue(fakeAi).compile();
    app = mod.createNestApplication({ bodyParser: false }); configureApp(app); await app.init();
    prisma = app.get(PrismaService); engine = app.get(WorkflowEngine); orch = app.get(Orchestrator);
    await prisma.aiProvider.update({ where: { key: 'gemini' }, data: { enabled: true, isDefault: true } }); // a provider must be enabled to select
  });
  afterAll(async () => { await closeQueues(); await app?.close(); });

  it('runs onboarding: research, ASO, strategy are persisted with validated values, team notified', async () => {
    const a = await signUp(app, 'Pipeline Co');
    const created = await a.as('post', '/api/v1/apps').send({ name: 'Fit Tracker', ios: { storeUrl: 'https://apps.apple.com/in/app/fit/id123456789' }, monthlyInstallTarget: 10000 }).expect(201);
    const status = await engine.run(created.body.onboardingExecutionId);
    const wf = await prisma.workflowExecution.findUniqueOrThrow({ where: { id: created.body.onboardingExecutionId } });
    expect((wf.steps as { key: string; status: string }[]).map((s) => `${s.key}:${s.status}`)).toEqual(['validate_identifiers:SUCCEEDED', 'fetch_store_metadata:SUCCEEDED', 'market_research:SUCCEEDED', 'aso_audit:SUCCEEDED', 'growth_strategy:SUCCEEDED', 'notify:SUCCEEDED']);
    expect(status).toBe('SUCCEEDED');
    // context came only from registered tools; the app description is data
    const research = calls.find((c) => c.key === 'market_research')!;
    expect(Object.keys(research.context).sort()).toEqual(expect.arrayContaining(['app', 'store_listings', 'organization']));
    expect(research.context).not.toHaveProperty('budget'); // not in market_research's tool list
    const ins = await a.as('get', `/api/v1/ai/insights/${created.body.id}`).expect(200);
    expect(ins.body.research.markets).toEqual([{ country: 'IN', opportunity: 'high', reasoning: 'r', confidence: 0.7 }]); // invalid country dropped, confidence clamped
    expect(ins.body.competitors[0].apps.map((x: { platform: string }) => x.platform).sort()).toEqual(['ANDROID', 'IOS']);
    expect(ins.body.keywords[0].keyword).toBe('calorie counter');
    expect(ins.body.audiences[0].countries).toEqual(['IN']);
    expect(ins.body.aso[0]).toMatchObject({ platform: 'IOS', score: 100 }); // clamped
    const s = ins.body.strategies[0];
    expect(s).toMatchObject({ status: 'PENDING', estimatedCpi: '25.50', estimatedBudget: '255000.00' });
    expect(s.channels.map((c: { provider: string }) => c.provider)).toEqual(['GOOGLE_ADS']);       // unknown channel dropped
    expect(s.campaignPlan.map((c: { name: string }) => c.name)).toEqual(['UAC IN']);              // Apple Ads on Android dropped
    expect((await prisma.application.findUniqueOrThrow({ where: { id: created.body.id } })).onboardingStatus).toBe('done');
    expect(await prisma.notification.count({ where: { organizationId: a.orgId, kind: 'ai_ready' } })).toBe(1);
    const usage = await prisma.aiUsage.aggregate({ where: { organizationId: a.orgId }, _sum: { inputTokens: true, requests: true } });
    expect(usage._sum.requests).toBe(3);
    // re-running a finished workflow is a no-op
    calls.length = 0;
    await engine.run(created.body.onboardingExecutionId);
    expect(calls).toHaveLength(0);
    // approve the strategy (one approved plan per app)
    await a.as('post', `/api/v1/ai/strategies/${s.id}/approve`).send({}).expect(200);
    await a.as('post', `/api/v1/ai/strategies/${s.id}/approve`).send({}).expect(409);
  });

  it('refuses tools outside an agent’s definition', async () => {
    const tools = app.get(ToolRegistry);
    await expect(tools.call({ key: 'aso', tools: ['app.get_profile'] }, 'budget.get_status', { orgId: '00000000-0000-0000-0000-000000000000' })).rejects.toThrow(/not permitted/);
  });

  it('enforces the monthly AI token allowance and cancellation', async () => {
    const a = await signUp(app, 'Quota Co');
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    await prisma.aiUsage.create({ data: { organizationId: a.orgId, date: day, provider: 'fake', model: 'x', inputTokens: 600_000n, outputTokens: 0n } });
    const r = await a.as('post', '/api/v1/ai/agents/analytics/run').send({}).expect(402);
    expect(r.body.error.code).toBe('ai_quota_exceeded');
    await prisma.aiUsage.deleteMany({ where: { organizationId: a.orgId } });
    const q = await a.as('post', '/api/v1/ai/agents/analytics/run').send({}).expect(202);
    await a.as('post', `/api/v1/ai/executions/${q.body.id}/cancel`).expect(204);
    expect((await orch.execute(q.body.id)).status).toBe('CANCELLED');
    const b = await signUp(app, 'Other');
    await b.as('get', `/api/v1/ai/executions/${q.body.id}`).expect(404); // tenant-scoped
  });
});
