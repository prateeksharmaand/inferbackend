import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma.service';
import { makeApp, PASSWORD, signUp, uniq } from './helpers';

describe('Authentication, authorization and tenant isolation', () => {
  let app: INestApplication; let prisma: PrismaService;
  beforeAll(async () => ({ app, prisma } = await makeApp()));
  afterAll(async () => app.close());

  it('registers a user with an owner membership, trial subscription and default policy', async () => {
    const a = await signUp(app, 'Alpha Apps');
    const me = await a.as('get', '/api/v1/auth/me', null).expect(200);
    expect(me.body.organizations).toHaveLength(1);
    expect(me.body.organizations[0]).toMatchObject({ id: a.orgId, role: 'owner' });
    expect(me.body.organizations[0].permissions).toContain('billing.manage');
    const org = await a.as('get', `/api/v1/organizations/${a.orgId}`).expect(200);
    expect(org.body.subscription.plan.key).toBe('free_trial');
    const policy = await a.as('get', `/api/v1/organizations/${a.orgId}/automation-policy`).expect(200);
    expect(policy.body.autonomyLevel).toBe('RECOMMENDATION');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: a.userId } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rejects duplicate emails and weak passwords', async () => {
    const a = await signUp(app);
    await request(app.getHttpServer()).post('/api/v1/auth/register').send({ name: 'X', email: a.email, password: PASSWORD, organizationName: 'Y' }).expect(400); // name too short
    await request(app.getHttpServer()).post('/api/v1/auth/register').send({ name: 'Xavier', email: a.email, password: PASSWORD, organizationName: 'Yes' }).expect(409);
    const weak = await request(app.getHttpServer()).post('/api/v1/auth/register').send({ name: 'Xavier', email: `w-${uniq()}@example.test`, password: 'password', organizationName: 'Yes' }).expect(400);
    expect(weak.body.error.code).toBe('validation_error');
  });

  it('blocks cross-tenant access through the API', async () => {
    const a = await signUp(app, 'Tenant A');
    const b = await signUp(app, 'Tenant B');
    // B uses its own token with A's organization id
    const r = await b.as('get', `/api/v1/organizations/${a.orgId}`, a.orgId).expect(403);
    expect(r.body.error.code).toBe('forbidden');
    await b.as('get', `/api/v1/organizations/${a.orgId}/members`, a.orgId).expect(403);
    // B with its own org header but A's id in the path
    await b.as('get', `/api/v1/organizations/${a.orgId}`, b.orgId).expect(400);
    // no org header at all
    await b.as('get', `/api/v1/organizations/${b.orgId}`, null).expect(403);
  });

  it('enforces tenant isolation in Postgres (RLS) even when code forgets the filter', async () => {
    const a = await signUp(app, 'RLS A');
    const b = await signUp(app, 'RLS B');
    // Unfiltered queries inside A's tenant context see only A's rows.
    const seen = await prisma.tenant(a.orgId, a.userId, (tx) => tx.organizationMember.findMany());
    expect(seen.every((m) => m.organizationId === a.orgId)).toBe(true);
    expect(await prisma.tenant(a.orgId, a.userId, (tx) => tx.organization.findMany())).toHaveLength(1);
    expect(await prisma.tenant(a.orgId, a.userId, (tx) => tx.automationPolicy.findUnique({ where: { organizationId: b.orgId } }))).toBeNull();
    // Writing a row for B from A's context is rejected by the policy.
    await expect(prisma.tenant(a.orgId, a.userId, (tx) => tx.application.create({ data: { organizationId: b.orgId, name: 'Sneaky' } }))).rejects.toThrow(/row-level security/i);
    // Updating B's org from A's context affects nothing.
    const upd = await prisma.tenant(a.orgId, a.userId, (tx) => tx.organization.updateMany({ where: { id: b.orgId }, data: { name: 'pwned' } }));
    expect(upd.count).toBe(0);
  });

  it('requires a declared permission and respects roles', async () => {
    const a = await signUp(app, 'Roles');
    const viewerEmail = `v-${uniq()}@example.test`;
    const inv = await a.as('post', `/api/v1/organizations/${a.orgId}/invitations`).send({ email: viewerEmail, role: 'viewer' }).expect(201);
    expect(inv.body.emailSent).toBe(false); // SMTP not configured in tests: the API says so instead of claiming delivery
    const token = new URL(inv.body.inviteUrl).searchParams.get('token');
    await request(app.getHttpServer()).post('/api/v1/auth/accept-invite').send({ token, name: 'Vera Viewer', password: PASSWORD }).expect(200);
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login?client=api').send({ email: viewerEmail, password: PASSWORD }).expect(200);
    const v = (m: 'get' | 'patch', url: string) => request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${login.body.accessToken}`).set('X-Organization-Id', a.orgId);
    await v('get', `/api/v1/organizations/${a.orgId}`).expect(200);
    const denied = await v('patch', `/api/v1/organizations/${a.orgId}`).send({ name: 'Renamed' }).expect(403);
    expect(denied.body.error.message).toMatch(/org\.manage/);
    // invitations are single use
    await request(app.getHttpServer()).post('/api/v1/auth/accept-invite').send({ token, name: 'Again', password: PASSWORD }).expect(400);
  });

  it('keeps at least one owner', async () => {
    const a = await signUp(app, 'Owners');
    const members = await a.as('get', `/api/v1/organizations/${a.orgId}/members`).expect(200);
    const me = members.body.members[0];
    const r = await a.as('patch', `/api/v1/organizations/${a.orgId}/members/${me.id}`).send({ role: 'admin' }).expect(409);
    expect(r.body.error.code).toBe('last_owner');
  });

  it('rotates refresh tokens and revokes the session when an old one is replayed', async () => {
    const a = await signUp(app);
    const r1 = await request(app.getHttpServer()).post('/api/v1/auth/refresh?client=api').send({ refreshToken: a.refreshToken }).expect(200);
    expect(r1.body.refreshToken).not.toBe(a.refreshToken);
    const replay = await request(app.getHttpServer()).post('/api/v1/auth/refresh?client=api').send({ refreshToken: a.refreshToken }).expect(401);
    expect(replay.body.error.code).toBe('token_reuse');
    // the whole session is gone: the newest refresh token and the access token stop working
    await request(app.getHttpServer()).post('/api/v1/auth/refresh?client=api').send({ refreshToken: r1.body.refreshToken }).expect(401);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${r1.body.accessToken}`).expect(401);
    expect(await prisma.auditLog.count({ where: { action: 'auth.refresh_token_reuse', actorUserId: a.userId } })).toBe(1);
  });

  it('locks the account after repeated wrong passwords', async () => {
    const a = await signUp(app);
    for (let i = 0; i < 5; i++) await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: a.email, password: 'Wrong-pass-123' }).expect(401);
    const locked = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: a.email, password: PASSWORD }).expect(429);
    expect(locked.body.error.code).toBe('account_locked');
  });

  it('rejects tampered and missing tokens', async () => {
    const a = await signUp(app);
    const [h, p] = a.token.split('.');
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${h}.${p}.invalidsig`).expect(401);
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('requires the CSRF header for cookie-authenticated changes', async () => {
    const agent = request.agent(app.getHttpServer());
    const email = `c-${uniq()}@example.test`;
    const reg = await agent.post('/api/v1/auth/register').send({ name: 'Cookie User', email, password: PASSWORD, organizationName: 'Cookies' }).expect(201);
    expect(reg.body.accessToken).toBeUndefined(); // web clients never see tokens
    const cookies = ([] as string[]).concat(reg.headers['set-cookie'] ?? []);
    expect(cookies.find((c) => c.startsWith('ag_access='))).toMatch(/HttpOnly/);
    const csrf = cookies.find((c) => c.startsWith('ag_csrf='))!.split(';')[0].split('=')[1];
    const orgId = reg.body.organization.id;
    await agent.patch(`/api/v1/organizations/${orgId}`).set('X-Organization-Id', orgId).send({ name: 'Renamed Org' }).expect(403);
    await agent.patch(`/api/v1/organizations/${orgId}`).set('X-Organization-Id', orgId).set('X-CSRF-Token', csrf).send({ name: 'Renamed Org' }).expect(200);
  });

  it('keeps Super Admin endpoints behind MFA', async () => {
    const a = await signUp(app);
    await prisma.user.update({ where: { id: a.userId }, data: { platformRole: 'SUPER_ADMIN' } });
    const r = await a.as('get', '/api/v1/admin/dashboard', null).expect(403);
    expect(r.body.error.code).toBe('mfa_setup_required');
  });

  it('stops all writes for a suspended organization but keeps reads', async () => {
    const a = await signUp(app);
    await prisma.organization.update({ where: { id: a.orgId }, data: { status: 'SUSPENDED' } });
    await a.as('get', `/api/v1/organizations/${a.orgId}`).expect(200);
    const r = await a.as('patch', `/api/v1/organizations/${a.orgId}`).send({ name: 'Nope Org' }).expect(403);
    expect(r.body.error.code).toBe('org_suspended');
  });
});

describe('Super Admin with MFA', () => {
  let app: INestApplication; let prisma: PrismaService;
  beforeAll(async () => ({ app, prisma } = await makeApp()));
  afterAll(async () => { const { closeQueues } = await import('../src/queues/queues'); await closeQueues(); await app.close(); });

  it('enrols TOTP, then reaches the admin console and can suspend an organization', async () => {
    const { authenticator } = await import('otplib');
    const admin = await signUp(app, 'Platform');
    const customer = await signUp(app, 'Customer Co');
    await prisma.user.update({ where: { id: admin.userId }, data: { platformRole: 'SUPER_ADMIN' } });
    const setup = await admin.as('post', '/api/v1/auth/mfa/setup', null).expect(201);
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    await admin.as('post', '/api/v1/auth/mfa/enable', null).send({ code: '000000' }).expect(400);
    await admin.as('post', '/api/v1/auth/mfa/enable', null).send({ code: authenticator.generate(setup.body.secret) }).expect(204);
    const dash = await admin.as('get', '/api/v1/admin/dashboard', null).expect(200);
    expect(dash.body.customers.total).toBeGreaterThanOrEqual(2);
    expect(dash.body.queues.map((q: { name: string }) => q.name)).toContain('campaigns');
    await admin.as('post', `/api/v1/admin/organizations/${customer.orgId}/suspend`, null).send({ reason: 'Payment overdue' }).expect(200);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: customer.orgId } });
    expect(org).toMatchObject({ status: 'SUSPENDED', automationEnabled: false });
    expect(org.emergencyStopAt).not.toBeNull();
    // A fresh sign-in without the code is refused once MFA is on.
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: admin.email, password: PASSWORD }).expect(401);
    expect(r.body.error.code).toBe('mfa_required');
    // A customer can never reach admin routes.
    await customer.as('get', '/api/v1/admin/organizations', null).expect(403);
  });
});
