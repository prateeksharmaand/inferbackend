import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { AppError, notFound } from '../../common/errors';
import { toMinor } from '../../common/money';
import { skipTake, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { QUEUES, queue } from '../../queues/queues';
import type { AuditQuery, OrgListQuery, PlanUpdateDto } from './dto';

const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** Super Admin operations. Runs as the owner DB role (cross-tenant by design); every change is audited. */
@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private audit: AuditService, private redis: RedisService) {}

  async dashboard() {
    const since = monthStart();
    const [orgs, activeOrgs, apps, android, ios, installs, campaigns, failed, ai, integrations, revenue, subs, queues] = await Promise.all([
      this.prisma.organization.count({ where: { deletedAt: null } }),
      this.prisma.organization.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.application.count({ where: { deletedAt: null } }),
      this.prisma.applicationPlatform.count({ where: { platform: 'ANDROID' } }),
      this.prisma.applicationPlatform.count({ where: { platform: 'IOS' } }),
      this.prisma.analyticsDaily.aggregate({ where: { date: { gte: since } }, _sum: { firstInstalls: true, paidInstalls: true, organicInstalls: true, aggregateAttributedInstalls: true, spendMinor: true } }),
      this.prisma.campaign.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.campaign.count({ where: { status: 'FAILED', deletedAt: null } }),
      this.prisma.aiUsage.aggregate({ where: { date: { gte: since } }, _sum: { inputTokens: true, outputTokens: true, costMicros: true, generations: true } }),
      this.prisma.connectedAccount.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
      this.prisma.payment.aggregate({ where: { receivedAt: { gte: since }, status: 'succeeded' }, _sum: { amountMinor: true } }),
      this.prisma.subscription.findMany({ where: { status: 'ACTIVE' }, include: { plan: { select: { priceMinor: true, interval: true } } } }),
      this.queueStats(),
    ]);
    const mrr = subs.reduce((s, x) => s + (x.plan.interval === 'year' ? x.plan.priceMinor / 12n : x.plan.priceMinor), 0n);
    return {
      period: { from: since.toISOString().slice(0, 10), currency: 'INR' },
      customers: { total: orgs, active: activeOrgs },
      applications: { total: apps, android, ios },
      installs: {
        total: installs._sum.firstInstalls ?? 0, paid: installs._sum.paidInstalls ?? 0, organic: installs._sum.organicInstalls ?? 0,
        aggregateAttributed: installs._sum.aggregateAttributedInstalls ?? 0,
      },
      // Ad spend is in each customer's own currency; this total is only meaningful when all customers use INR.
      advertisingSpendMinor: installs._sum.spendMinor ?? 0n,
      campaigns: { active: campaigns, failed },
      ai: { inputTokens: ai._sum.inputTokens ?? 0n, outputTokens: ai._sum.outputTokens ?? 0n, generations: ai._sum.generations ?? 0, costMicrosUsd: ai._sum.costMicros ?? 0n },
      integrations: Object.fromEntries(integrations.map((g) => [g.status, g._count])),
      revenue: { collectedThisMonthMinor: revenue._sum.amountMinor ?? 0n, mrrMinor: mrr, activeSubscriptions: subs.length },
      queues,
    };
  }

  async queueStats() {
    return Promise.all(Object.values(QUEUES).map(async (name) => {
      try {
        const c = await queue(name).getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
        return { name, ...c, ok: true };
      } catch (e) {
        return { name, ok: false, error: (e as Error).message };
      }
    }));
  }

  async failedJobs(name: string, limit = 50) {
    if (!(Object.values(QUEUES) as string[]).includes(name)) throw notFound('Queue');
    const jobs = await queue(name as (typeof QUEUES)[keyof typeof QUEUES]).getFailed(0, limit - 1);
    return jobs.map((j) => ({ id: j.id, name: j.name, attemptsMade: j.attemptsMade, failedReason: j.failedReason?.slice(0, 500), timestamp: j.timestamp, finishedOn: j.finishedOn, orgId: (j.data as { organizationId?: string })?.organizationId }));
  }

  async retryJob(name: string, id: string, actorId: string) {
    if (!(Object.values(QUEUES) as string[]).includes(name)) throw notFound('Queue');
    const job = await queue(name as (typeof QUEUES)[keyof typeof QUEUES]).getJob(id);
    if (!job) throw notFound('Job');
    await job.retry();
    await this.audit.record({ actorUserId: actorId, actor: `user:${actorId}`, action: 'admin.job_retried', entityType: 'job', entityId: `${name}:${id}` });
  }

  async organizations(q: OrgListQuery) {
    const where: Prisma.OrganizationWhereInput = {
      deletedAt: null, status: q.status,
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { slug: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.organization.findMany({
        where, orderBy: { createdAt: 'desc' }, ...skipTake(q),
        include: {
          _count: { select: { applications: { where: { deletedAt: null } }, members: true, campaigns: { where: { status: 'ACTIVE' } } } },
          subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: { select: { key: true, name: true } } } },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);
    return paged(rows.map((o) => ({
      id: o.id, name: o.name, slug: o.slug, status: o.status, suspendedReason: o.suspendedReason, createdAt: o.createdAt, currency: o.currency,
      apps: o._count.applications, members: o._count.members, activeCampaigns: o._count.campaigns,
      subscription: o.subscriptions[0] ? { status: o.subscriptions[0].status, plan: o.subscriptions[0].plan, currentPeriodEnd: o.subscriptions[0].currentPeriodEnd } : null,
    })), total, q);
  }

  async organization(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        members: { include: { user: { select: { id: true, email: true, name: true, lastLoginAt: true, mfaEnabledAt: true } }, role: { select: { key: true } } } },
        subscriptions: { orderBy: { createdAt: 'desc' }, include: { plan: true } },
        applications: { where: { deletedAt: null }, select: { id: true, name: true, monthlyInstallTarget: true, createdAt: true, platforms: { select: { platform: true, storeId: true } } } },
        accounts: { where: { deletedAt: null }, select: { id: true, providerKey: true, name: true, status: true, statusDetail: true, lastSyncedAt: true } },
        policy: true,
      },
    });
    if (!org) throw notFound('Organization');
    return org;
  }

  /** Suspension pauses automation immediately (emergency stop) and makes the org read-only for its members. */
  async setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', actorId: string, reason?: string) {
    const before = await this.prisma.organization.findUnique({ where: { id } });
    if (!before) throw notFound('Organization');
    const org = await this.prisma.organization.update({
      where: { id },
      data: status === 'SUSPENDED'
        ? { status, suspendedReason: reason, automationEnabled: false, emergencyStopAt: new Date() }
        : { status, suspendedReason: null },
    });
    await this.audit.record({ organizationId: id, actorUserId: actorId, actor: `user:${actorId}`, action: status === 'SUSPENDED' ? 'admin.org_suspended' : 'admin.org_reactivated', entityType: 'organization', entityId: id, before: { status: before.status }, after: { status, reason }, security: true });
    return { id: org.id, status: org.status, suspendedReason: org.suspendedReason };
  }

  async auditLogs(q: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = { ...(q.securityOnly ? { security: true } : {}), ...(q.action ? { action: { startsWith: q.action } } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q) }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paged(items, total, q);
  }

  async systemHealth() {
    const check = async (fn: () => Promise<unknown>) => { const t = Date.now(); try { await fn(); return { ok: true, ms: Date.now() - t }; } catch (e) { return { ok: false, error: (e as Error).message.slice(0, 200) }; } };
    const aiUrl = process.env.AI_SERVICE_URL;
    const [db, redis, ai, dbSize, recentErrors, providerErrors, workerBeat] = await Promise.all([
      check(() => this.prisma.$queryRaw`SELECT 1`),
      check(() => this.redis.client.ping()),
      aiUrl ? check(async () => { const r = await fetch(`${aiUrl}/health`, { signal: AbortSignal.timeout(4000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); }) : Promise.resolve({ ok: false, error: 'AI_SERVICE_URL not set' }),
      this.prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`,
      this.prisma.errorLog.count({ where: { createdAt: { gt: new Date(Date.now() - 86_400_000) } } }),
      this.prisma.integrationSyncLog.groupBy({ by: ['providerKey'], where: { status: 'error', startedAt: { gt: new Date(Date.now() - 86_400_000) } }, _count: true }),
      this.redis.client.get('heartbeat:worker'),
    ]);
    const workerAgeSec = workerBeat ? Math.round((Date.now() - Number(workerBeat)) / 1000) : null;
    return {
      services: { database: db, redis, aiService: ai, worker: { ok: workerAgeSec !== null && workerAgeSec < 120, lastHeartbeatSecondsAgo: workerAgeSec } },
      database: { sizeBytes: dbSize[0]?.size ?? 0n },
      errorsLast24h: recentErrors,
      providerErrorsLast24h: Object.fromEntries(providerErrors.map((p) => [p.providerKey, p._count])),
      queues: await this.queueStats(),
    };
  }

  plans() { return this.prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { subscriptions: { where: { status: { in: ['ACTIVE', 'TRIALING'] } } } } } } }); }

  async updatePlan(key: string, dto: PlanUpdateDto, actorId: string) {
    const before = await this.prisma.subscriptionPlan.findUnique({ where: { key } });
    if (!before) throw notFound('Plan');
    const { price, aiTokensMonth, ...rest } = dto;
    const plan = await this.prisma.subscriptionPlan.update({
      where: { key },
      data: { ...rest, ...(price !== undefined ? { priceMinor: toMinor(price) } : {}), ...(aiTokensMonth !== undefined ? { aiTokensMonth: BigInt(aiTokensMonth) } : {}) },
    });
    await this.audit.record({ actorUserId: actorId, actor: `user:${actorId}`, action: 'admin.plan_updated', entityType: 'subscription_plan', entityId: plan.id, before, after: plan });
    return plan;
  }

  /** Moves an org to another plan from today (manual billing; online payments are a separate, flagged feature). */
  async assignPlan(orgId: string, planKey: string, actorId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { key: planKey } });
    if (!plan || !plan.isActive) throw new AppError('Unknown or inactive plan', 400, 'invalid_plan');
    const current = await this.prisma.subscription.findFirst({ where: { organizationId: orgId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
    const now = new Date();
    const end = new Date(now); end.setUTCMonth(end.getUTCMonth() + (plan.interval === 'year' ? 12 : 1));
    const sub = await this.prisma.$transaction(async (tx) => {
      if (current) await tx.subscription.update({ where: { id: current.id }, data: { status: 'CANCELLED', currentPeriodEnd: now } });
      const s = await tx.subscription.create({ data: { organizationId: orgId, planId: plan.id, status: plan.trialDays && plan.key === 'free_trial' ? 'TRIALING' : 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: end } });
      const order = (k?: string) => ['free_trial', 'starter', 'professional', 'agency', 'enterprise'].indexOf(k ?? '');
      await tx.subscriptionTransaction.create({ data: { organizationId: orgId, subscriptionId: s.id, kind: !current ? 'created' : order(plan.key) > order(current.plan.key) ? 'upgraded' : 'downgraded', fromPlanKey: current?.plan.key, toPlanKey: plan.key, actor: `user:${actorId}` } });
      return s;
    });
    await this.audit.record({ organizationId: orgId, actorUserId: actorId, actor: `user:${actorId}`, action: 'admin.plan_assigned', entityType: 'subscription', entityId: sub.id, before: { plan: current?.plan.key }, after: { plan: plan.key } });
    return sub;
  }

  flags() { return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }); }
  async setFlag(key: string, enabled: boolean, actorId: string) {
    const f = await this.prisma.featureFlag.update({ where: { key }, data: { enabled } }).catch(() => { throw notFound('Feature flag'); });
    await this.audit.record({ actorUserId: actorId, actor: `user:${actorId}`, action: 'admin.flag_changed', entityType: 'feature_flag', entityId: key, after: { enabled } });
    return f;
  }

  async users(q: { page: number; pageSize: number; search?: string }) {
    const where: Prisma.UserWhereInput = { deletedAt: null, ...(q.search ? { OR: [{ email: { contains: q.search, mode: 'insensitive' } }, { name: { contains: q.search, mode: 'insensitive' } }] } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q), select: { id: true, email: true, name: true, status: true, platformRole: true, lastLoginAt: true, mfaEnabledAt: true, lockedUntil: true, createdAt: true, _count: { select: { memberships: true } } } }),
      this.prisma.user.count({ where }),
    ]);
    return paged(items, total, q);
  }

  async setUserStatus(id: string, status: 'ACTIVE' | 'DISABLED', actorId: string) {
    if (id === actorId) throw new AppError('You cannot disable your own account', 400, 'self');
    const u = await this.prisma.user.update({ where: { id }, data: { status, ...(status === 'ACTIVE' ? { lockedUntil: null, failedLogins: 0 } : {}) } });
    if (status === 'DISABLED') await this.prisma.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.record({ actorUserId: actorId, actor: `user:${actorId}`, action: status === 'DISABLED' ? 'admin.user_disabled' : 'admin.user_enabled', entityType: 'user', entityId: id, security: true });
    return { id: u.id, status: u.status };
  }

  async campaigns(q: { page: number; pageSize: number; status?: string; provider?: string }) {
    const where: Prisma.CampaignWhereInput = { deletedAt: null, ...(q.status ? { status: q.status as never } : { status: { not: 'ARCHIVED' } }), ...(q.provider ? { provider: q.provider as never } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.campaign.findMany({ where, orderBy: { updatedAt: 'desc' }, ...skipTake(q), select: { id: true, name: true, provider: true, platform: true, status: true, statusReason: true, dailyBudgetMinor: true, currency: true, externalStatus: true, lastSyncedAt: true, automationEnabled: true, organization: { select: { id: true, name: true } }, application: { select: { name: true } } } }),
      this.prisma.campaign.count({ where }),
    ]);
    const failedActions = await this.prisma.campaignAction.count({ where: { status: 'failed', createdAt: { gt: new Date(Date.now() - 7 * 86_400_000) } } });
    return { ...paged(items, total, q), failedActionsLast7d: failedActions };
  }

  async integrationsHealth() {
    const [providers, byStatus, errors, flags] = await Promise.all([
      this.prisma.integrationProvider.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.connectedAccount.groupBy({ by: ['providerKey', 'status'], where: { deletedAt: null }, _count: true }),
      this.prisma.integrationSyncLog.groupBy({ by: ['providerKey', 'errorCode'], where: { status: 'error', startedAt: { gt: new Date(Date.now() - 7 * 86_400_000) } }, _count: true }),
      this.prisma.featureFlag.findMany({ where: { key: { startsWith: 'integration.' } } }),
    ]);
    return { providers: providers.map((p) => ({ ...p, featureEnabled: flags.find((f) => f.key === `integration.${p.key}`)?.enabled ?? null, accounts: Object.fromEntries(byStatus.filter((b) => b.providerKey === p.key).map((b) => [b.status, b._count])), errors7d: errors.filter((e) => e.providerKey === p.key).map((e) => ({ code: e.errorCode, count: e._count })) })) };
  }

  async setProviderReadiness(key: string, readiness: string, note: string, actorId: string) {
    const p = await this.prisma.integrationProvider.update({ where: { key }, data: { readiness, readinessNote: note } }).catch(() => { throw notFound('Provider'); });
    await this.audit.record({ actorUserId: actorId, actor: `user:${actorId}`, action: 'admin.integration_readiness', entityType: 'integration_provider', entityId: key, after: { readiness, note } });
    return p;
  }

  async usage(storage: { usage(): Promise<{ bytes: number; objects: number }> }) {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [byOrg, byRoute, slow, stor, orgs] = await Promise.all([
      this.prisma.apiLog.groupBy({ by: ['organizationId'], where: { createdAt: { gte: since } }, _count: true, _avg: { durationMs: true }, orderBy: { _count: { organizationId: 'desc' } }, take: 20 }),
      this.prisma.apiLog.groupBy({ by: ['route', 'method'], where: { createdAt: { gte: since } }, _count: true, _avg: { durationMs: true }, orderBy: { _count: { route: 'desc' } }, take: 25 }),
      this.prisma.apiLog.count({ where: { createdAt: { gte: since }, durationMs: { gt: 800 } } }),
      storage.usage().catch(() => ({ bytes: -1, objects: -1 })),
      this.prisma.organization.findMany({ select: { id: true, name: true } }),
    ]);
    const name = new Map(orgs.map((o) => [o.id, o.name]));
    const errs = await this.prisma.apiLog.groupBy({ by: ['status'], where: { createdAt: { gte: since }, status: { gte: 500 } }, _count: true });
    return { since, byOrganization: byOrg.map((r) => ({ organization: r.organizationId ? name.get(r.organizationId) ?? r.organizationId : 'unauthenticated', requests: r._count, avgMs: Math.round(r._avg.durationMs ?? 0) })), byRoute: byRoute.map((r) => ({ route: `${r.method} ${r.route}`, requests: r._count, avgMs: Math.round(r._avg.durationMs ?? 0) })), slowRequests: slow, serverErrors: errs.reduce((s, e) => s + e._count, 0), storage: stor };
  }

  async errorLogs() { return this.prisma.errorLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }); }
}
