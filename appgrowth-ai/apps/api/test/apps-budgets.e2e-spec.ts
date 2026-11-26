import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/common/prisma.service';
import { closeQueues } from '../src/queues/queues';
import { makeApp, signUp } from './helpers';

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

describe('Applications', () => {
  let app: INestApplication; let prisma: PrismaService;
  beforeAll(async () => ({ app, prisma } = await makeApp()));
  afterAll(async () => { await closeQueues(); await app.close(); });

  it('adds an Android + iOS app from store URLs, imports iOS metadata and starts onboarding exactly once', async () => {
    const a = await signUp(app, 'Fit Co');
    const r = await a.as('post', '/api/v1/apps').send({
      name: 'Fit Tracker', monthlyInstallTarget: 10000, targetCpi: '25.50', countries: ['IN', 'AE'], languages: ['en', 'hi'],
      android: { storeUrl: 'https://play.google.com/store/apps/details?id=com.example.fit' },
      ios: { storeUrl: 'https://apps.apple.com/in/app/fit-tracker/id123456789' },
    }).expect(201);
    expect(r.body.platforms.map((p: { platform: string }) => p.platform).sort()).toEqual(['ANDROID', 'IOS']);
    expect(r.body.platforms.find((p: { platform: string }) => p.platform === 'IOS').storeId).toBe('com.example.fit');
    expect(r.body.targetCpi).toBe('25.50');
    expect(r.body.countries.sort()).toEqual(['AE', 'IN']);
    expect(r.body.listings[0]).toMatchObject({ platform: 'IOS', title: 'Fit Tracker', source: 'itunes_lookup' });
    expect(r.body.onboardingExecutionId).toBeTruthy();
    const execs = await prisma.workflowExecution.findMany({ where: { organizationId: a.orgId, workflowKey: 'app_onboarding' } });
    expect(execs).toHaveLength(1);
    // asking again while it is still queued returns the same run
    const again = await a.as('post', `/api/v1/apps/${r.body.id}/onboarding`).expect(202);
    expect(again.body).toMatchObject({ executionId: execs[0].id, alreadyRunning: true });
  });

  it('validates identifiers and store URLs', async () => {
    const a = await signUp(app);
    const bad = await a.as('post', '/api/v1/apps').send({ name: 'Bad', android: { packageName: 'not a package' } }).expect(400);
    expect(bad.body.error.code).toBe('validation_error');
    await a.as('post', '/api/v1/apps').send({ name: 'Nothing' }).expect(400);
    const missing = await a.as('post', '/api/v1/apps').send({ name: 'Gone', android: { packageName: 'com.missing.app' } }).expect(400);
    expect(missing.body.error.code).toBe('android_not_found');
    const wrongStore = await a.as('post', '/api/v1/apps').send({ name: 'Wrong', android: { storeUrl: 'https://apps.apple.com/in/app/x/id123456789' } }).expect(400);
    expect(wrongStore.body.error.code).toBe('invalid_store_url');
    const ios404 = await a.as('post', '/api/v1/apps').send({ name: 'Gone iOS', ios: { storeUrl: 'https://apps.apple.com/in/app/x/id404404404' } }).expect(400);
    expect(ios404.body.error.code).toBe('ios_not_found');
  });

  it('enforces the plan app limit and duplicate store ids', async () => {
    const a = await signUp(app);
    await a.as('post', '/api/v1/apps').send({ name: 'One', android: { packageName: 'com.example.one' }, runOnboarding: false }).expect(201);
    const limit = await a.as('post', '/api/v1/apps').send({ name: 'Two', android: { packageName: 'com.example.two' }, runOnboarding: false }).expect(403);
    expect(limit.body.error.code).toBe('plan_limit'); // free trial = 1 app
    const pro = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { key: 'professional' } });
    await prisma.subscription.updateMany({ where: { organizationId: a.orgId }, data: { planId: pro.id, status: 'ACTIVE' } });
    const dup = await a.as('post', '/api/v1/apps').send({ name: 'Copy', android: { packageName: 'com.example.one' }, runOnboarding: false }).expect(409);
    expect(dup.body.error.code).toBe('duplicate_app');
  });

  it('keeps apps private to their organization', async () => {
    const a = await signUp(app); const b = await signUp(app);
    const r = await a.as('post', '/api/v1/apps').send({ name: 'Secret', android: { packageName: 'com.example.secret' }, runOnboarding: false }).expect(201);
    await b.as('get', `/api/v1/apps/${r.body.id}`).expect(404);
    await b.as('patch', `/api/v1/apps/${r.body.id}`).send({ name: 'Mine now' }).expect(404);
    await b.as('delete', `/api/v1/apps/${r.body.id}`).expect(404);
    expect((await b.as('get', '/api/v1/apps').expect(200)).body.total).toBe(0);
    expect((await a.as('get', '/api/v1/apps').expect(200)).body.total).toBe(1);
  });

  it('updates targets and uploads validated assets', async () => {
    const a = await signUp(app);
    const r = await a.as('post', '/api/v1/apps').send({ name: 'Assets', android: { packageName: 'com.example.assets' }, runOnboarding: false }).expect(201);
    const id = r.body.id;
    await a.as('patch', `/api/v1/apps/${id}`).send({ monthlyInstallTarget: 25000, targetCpi: '18.00' }).expect(200);
    const next = new Date(); next.setUTCMonth(next.getUTCMonth() + 1);
    const month = next.toISOString().slice(0, 7);
    await a.as('put', `/api/v1/apps/${id}/targets/${month}`).send({ installs: 30000 }).expect(200);
    await a.as('put', `/api/v1/apps/${id}/targets/2020-01`).send({ installs: 1 }).expect(400);
    const icon = await a.as('post', `/api/v1/apps/${id}/assets?kind=icon`).attach('file', PNG_1x1, 'icon.png').expect(201);
    expect(icon.body).toMatchObject({ kind: 'icon', width: 1, height: 1 });
    expect(icon.body.url).toMatch(/^\/api\/v1\/files\?key=/);
    const file = await a.as('get', icon.body.url, null).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    // a text file renamed to .png is rejected by content sniffing
    const fake = await a.as('post', `/api/v1/apps/${id}/assets?kind=screenshot`).attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' }).expect(400);
    expect(fake.body.error.code).toBe('invalid_file_type');
    // tampered signature
    await a.as('get', icon.body.url.replace(/sig=[^&]+/, 'sig=AAAA'), null).expect(403);
    const got = await a.as('get', `/api/v1/apps/${id}`).expect(200);
    expect(got.body.monthlyInstallTarget).toBe(25000);
    expect(got.body.targets.map((t: { installs: number }) => t.installs)).toContain(30000);
  });
});

describe('Budgets', () => {
  let app: INestApplication;
  beforeAll(async () => ({ app } = await makeApp()));
  afterAll(async () => { await closeQueues(); await app.close(); });
  const thisMonth = () => new Date().toISOString().slice(0, 7);

  it('creates a monthly budget with allocations and reports spend', async () => {
    const a = await signUp(app);
    const b = await a.as('post', '/api/v1/budgets').send({ month: thisMonth(), monthlyLimit: '300000.00', dailyLimit: '12000', allocations: [{ provider: 'GOOGLE_ADS', limit: '200000' }, { provider: 'META_ADS', limit: '100000' }] }).expect(201);
    expect(b.body).toMatchObject({ monthlyLimit: '300000.00', dailyLimit: '12000.00', alertThresholds: [50, 75, 90] });
    expect(b.body.allocations).toHaveLength(2);
    const spend = await a.as('get', '/api/v1/budgets/spend').expect(200);
    expect(spend.body).toMatchObject({ spent: '0.00', remaining: '300000.00', spendableAfterReserve: '270000.00', usedPct: 0 });
    await a.as('post', '/api/v1/budgets').send({ month: thisMonth(), monthlyLimit: '1.00' }).expect(409); // one budget per month
  });

  it('rejects inconsistent limits', async () => {
    const a = await signUp(app);
    expect((await a.as('post', '/api/v1/budgets').send({ month: thisMonth(), monthlyLimit: '1000', dailyLimit: '2000' }).expect(400)).body.error.code).toBe('invalid_amount');
    expect((await a.as('post', '/api/v1/budgets').send({ month: thisMonth(), monthlyLimit: '1000', allocations: [{ provider: 'GOOGLE_ADS', limit: '700' }, { provider: 'META_ADS', limit: '400' }] }).expect(400)).body.error.code).toBe('invalid_allocation');
    expect((await a.as('post', '/api/v1/budgets').send({ month: '2020-01', monthlyLimit: '1000' }).expect(400)).body.error.code).toBe('past_month');
    await a.as('post', '/api/v1/budgets').send({ month: thisMonth(), monthlyLimit: '0.1.1' }).expect(400);
  });

  it('forecasts honestly with no data', async () => {
    const a = await signUp(app);
    const f = await a.as('get', '/api/v1/budgets/forecast').expect(200);
    expect(f.body).toMatchObject({ expected: 0, onTrack: false, confidence: 'low' });
    expect(f.body.disclaimer).toMatch(/not guaranteed/);
    const o = await a.as('get', '/api/v1/analytics/overview').expect(200);
    expect(o.body).toMatchObject({ hasData: false, totals: { installs: 0, spend: '0.00', cpi: null } });
    expect(o.body.series).toHaveLength(30);
  });

  it('viewers can read but not set budgets', async () => {
    const a = await signUp(app);
    const { default: request } = await import('supertest');
    const email = `viewer-${Date.now()}@example.test`;
    const inv = await a.as('post', `/api/v1/organizations/${a.orgId}/invitations`).send({ email, role: 'viewer' }).expect(201);
    const token = new URL(inv.body.inviteUrl).searchParams.get('token');
    await request(app.getHttpServer()).post('/api/v1/auth/accept-invite').send({ token, name: 'Vic Viewer', password: 'Sup3rSecretPass' }).expect(200);
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login?client=api').send({ email, password: 'Sup3rSecretPass' }).expect(200);
    const v = (m: 'get' | 'post', url: string) => request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${login.body.accessToken}`).set('X-Organization-Id', a.orgId);
    await v('get', '/api/v1/budgets').expect(200);
    await v('get', '/api/v1/budgets/spend').expect(200);
    await v('post', '/api/v1/budgets').send({ month: thisMonth(), monthlyLimit: '1000' }).expect(403);
    await v('post', '/api/v1/apps').send({ name: 'Nope', android: { packageName: 'com.example.nope' } }).expect(403);
  });
});
