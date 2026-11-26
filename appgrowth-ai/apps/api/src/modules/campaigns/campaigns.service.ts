import { Injectable } from '@nestjs/common';
import { AdProvider, CampaignStatus, Platform, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../../common/audit.service';
import { canTransition, EDITABLE } from '../../common/campaign-state';
import { AppError, notFound } from '../../common/errors';
import { cpiMinor, fromMinor, toMinor } from '../../common/money';
import { paged, skipTake } from '../../common/pagination';
import { PrismaService, Tx } from '../../common/prisma.service';
import { checkChange } from '../../common/spend-policy';
import { QUEUES, queue } from '../../queues/queues';
import { BudgetsService } from '../budgets/budgets.service';
import type { CampaignQuery, CreateCampaignDto, UpdateCampaignDto } from './dto';

const PROVIDER_KEY: Record<AdProvider, string> = { GOOGLE_ADS: 'google_ads', APPLE_ADS: 'apple_ads', META_ADS: 'meta_ads', TIKTOK_ADS: 'tiktok_ads' };
export type CampaignOp = 'launch' | 'pause' | 'resume' | 'budget_change' | 'sync_status';

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private budgets: BudgetsService) {}

  private view(c: Prisma.CampaignGetPayload<{ include: { application: { select: { id: true; name: true } }; account: { select: { id: true; name: true; status: true; externalAccountId: true } } } }>) {
    return {
      id: c.id, name: c.name, provider: c.provider, platform: c.platform, objective: c.objective, countries: c.countries, languages: c.languages, status: c.status, statusReason: c.statusReason,
      dailyBudget: fromMinor(c.dailyBudgetMinor), monthlyBudget: fromMinor(c.monthlyBudgetMinor), targetCpi: fromMinor(c.targetCpiMinor), currency: c.currency,
      startDate: c.startDate, endDate: c.endDate, externalCampaignId: c.externalCampaignId, externalStatus: c.externalStatus, automationEnabled: c.automationEnabled, lastSyncedAt: c.lastSyncedAt,
      application: c.application, account: c.account, strategyId: c.strategyId, createdAt: c.createdAt, updatedAt: c.updatedAt,
    };
  }
  private include = { application: { select: { id: true, name: true } }, account: { select: { id: true, name: true, status: true, externalAccountId: true } } } as const;

  async list(orgId: string, userId: string, q: CampaignQuery) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const where: Prisma.CampaignWhereInput = { organizationId: orgId, deletedAt: null, applicationId: q.applicationId, provider: q.provider, platform: q.platform, status: q.status ?? { not: 'ARCHIVED' }, ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}) };
      const [rows, total] = await Promise.all([tx.campaign.findMany({ where, orderBy: { updatedAt: 'desc' }, ...skipTake(q), include: this.include }), tx.campaign.count({ where })]);
      const since = new Date(Date.now() - 30 * 86_400_000);
      const m = await tx.campaignMetric.groupBy({ by: ['campaignId'], where: { campaignId: { in: rows.map((r) => r.id) }, date: { gte: since } }, _sum: { installs: true, spendMinor: true } });
      const mm = new Map(m.map((x) => [x.campaignId, x._sum]));
      return paged(rows.map((r) => { const s = mm.get(r.id); return { ...this.view(r), last30d: { installs: s?.installs ?? 0, spend: fromMinor(s?.spendMinor ?? 0n), cpi: fromMinor(cpiMinor(s?.spendMinor ?? 0n, s?.installs ?? 0)) } }; }), total, q);
    });
  }

  async get(orgId: string, userId: string, id: string) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const c = await tx.campaign.findFirst({ where: { id, organizationId: orgId, deletedAt: null }, include: { ...this.include, actions: { orderBy: { createdAt: 'desc' }, take: 30 }, budgets: { orderBy: { effectiveFrom: 'desc' }, take: 20 }, creatives: true } });
      if (!c) throw notFound('Campaign');
      const [metrics, decisions] = await Promise.all([
        tx.campaignMetric.groupBy({ by: ['date'], where: { campaignId: id, date: { gte: new Date(Date.now() - 60 * 86_400_000) } }, _sum: { impressions: true, clicks: true, installs: true, spendMinor: true }, orderBy: { date: 'asc' } }),
        tx.optimizationDecision.findMany({ where: { campaignId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      ]);
      const creatives = await tx.creativeAsset.findMany({ where: { id: { in: c.creatives.map((x) => x.creativeAssetId) } }, select: { id: true, title: true, type: true, approvalStatus: true } });
      return {
        ...this.view(c),
        actions: c.actions.map((a) => ({ id: a.id, action: a.action, actor: a.actor, status: a.status, error: a.error, createdAt: a.createdAt, completedAt: a.completedAt, request: a.request })),
        budgetHistory: c.budgets.map((b) => ({ daily: fromMinor(b.dailyMinor), monthly: fromMinor(b.monthlyMinor), changedBy: b.changedBy, reason: b.reason, effectiveFrom: b.effectiveFrom })),
        creatives: creatives.map((x) => ({ ...x, uploaded: !!c.creatives.find((y) => y.creativeAssetId === x.id)?.uploadedAt })),
        daily: metrics.map((d) => ({ date: d.date.toISOString().slice(0, 10), impressions: Number(d._sum.impressions ?? 0), clicks: Number(d._sum.clicks ?? 0), installs: d._sum.installs ?? 0, spend: fromMinor(d._sum.spendMinor ?? 0n), cpi: fromMinor(cpiMinor(d._sum.spendMinor ?? 0n, d._sum.installs ?? 0)) })),
        decisions: decisions.map((d) => ({ id: d.id, kind: d.kind, outcome: d.outcome, rationale: d.rationale, blockedReason: d.blockedReason, before: d.before, after: d.after, createdAt: d.createdAt })),
      };
    });
  }

  /** Validates app/platform/account consistency shared by create and update. */
  private async validate(tx: Tx, orgId: string, p: { applicationId: string; provider: AdProvider; platform: Platform; connectedAccountId?: string | null }) {
    const app = await tx.application.findFirst({ where: { id: p.applicationId, organizationId: orgId, deletedAt: null }, include: { platforms: true } });
    if (!app) throw notFound('Application');
    if (!app.platforms.some((x) => x.platform === p.platform)) throw new AppError(`${app.name} has no ${p.platform === 'IOS' ? 'iOS' : 'Android'} platform`, 400, 'platform_missing');
    if (p.provider === 'APPLE_ADS' && p.platform !== 'IOS') throw new AppError('Apple Ads only promotes iOS apps', 400, 'invalid_platform');
    const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
    let currency = org.currency;
    if (p.connectedAccountId) {
      const acc = await tx.connectedAccount.findFirst({ where: { id: p.connectedAccountId, organizationId: orgId, deletedAt: null } });
      if (!acc) throw notFound('Ad account');
      if (acc.providerKey !== PROVIDER_KEY[p.provider]) throw new AppError('That ad account belongs to a different channel', 400, 'account_mismatch');
      if (acc.currency && acc.currency !== org.currency) throw new AppError(`The ad account bills in ${acc.currency} but your budgets are in ${org.currency}. Spending limits can only be enforced in one currency — use an ad account in ${org.currency} or change the organization currency.`, 400, 'currency_mismatch');
      currency = acc.currency ?? org.currency;
    }
    return { app, currency };
  }

  async create(orgId: string, userId: string, dto: CreateCampaignDto) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const { currency } = await this.validate(tx, orgId, dto);
      const daily = toMinor(dto.dailyBudget);
      if (daily <= 0n) throw new AppError('Daily budget must be greater than zero', 400, 'invalid_budget');
      const start = new Date(`${dto.startDate}T00:00:00Z`); const end = dto.endDate ? new Date(`${dto.endDate}T00:00:00Z`) : null;
      if (end && end < start) throw new AppError('End date is before start date', 400, 'invalid_dates');
      const c = await tx.campaign.create({
        data: {
          organizationId: orgId, applicationId: dto.applicationId, connectedAccountId: dto.connectedAccountId, strategyId: dto.strategyId, name: dto.name, provider: dto.provider, platform: dto.platform,
          objective: dto.objective ?? 'installs', countries: [...new Set(dto.countries)], languages: [...new Set(dto.languages ?? ['en'])], dailyBudgetMinor: daily, monthlyBudgetMinor: dto.monthlyBudget ? toMinor(dto.monthlyBudget) : null,
          targetCpiMinor: dto.targetCpi ? toMinor(dto.targetCpi) : null, currency, startDate: start, endDate: end, createdById: userId,
        },
        include: this.include,
      });
      await tx.campaignBudget.create({ data: { organizationId: orgId, campaignId: c.id, dailyMinor: daily, monthlyMinor: c.monthlyBudgetMinor, changedBy: `user:${userId}`, reason: 'created' } });
      if (dto.creativeIds?.length) await this.attachCreatives(tx, orgId, c.id, dto.creativeIds);
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'campaign.created', entityType: 'campaign', entityId: c.id, after: dto }, tx);
      return this.view(c);
    });
  }

  private async attachCreatives(tx: Tx, orgId: string, campaignId: string, ids: string[]) {
    const assets = await tx.creativeAsset.findMany({ where: { id: { in: ids }, organizationId: orgId, deletedAt: null } });
    if (assets.length !== ids.length) throw notFound('Creative');
    await tx.campaignCreative.deleteMany({ where: { campaignId, uploadedAt: null } });
    await tx.campaignCreative.createMany({ data: assets.map((a) => ({ organizationId: orgId, campaignId, creativeAssetId: a.id, version: a.currentVersion })), skipDuplicates: true });
  }

  /** Drafts one campaign per plan line of an APPROVED strategy, using the org's connected account for each channel. */
  async fromStrategy(orgId: string, userId: string, strategyId: string) {
    const s = await this.prisma.marketingStrategy.findFirst({ where: { id: strategyId, organizationId: orgId } });
    if (!s) throw notFound('Strategy');
    if (s.status !== 'APPROVED') throw new AppError('Approve the strategy first', 409, 'strategy_not_approved');
    const plan = (s.campaignPlan as { name: string; provider: AdProvider; platform: Platform; objective: string; countries: string[]; daily_budget: number; duration_days: number }[]) ?? [];
    const accounts = await this.prisma.connectedAccount.findMany({ where: { organizationId: orgId, deletedAt: null, status: 'CONNECTED' } });
    const created: string[] = []; const skipped: string[] = [];
    for (const p of plan) {
      const acc = accounts.find((a) => a.providerKey === PROVIDER_KEY[p.provider]);
      const exists = await this.prisma.campaign.count({ where: { organizationId: orgId, strategyId, name: p.name, deletedAt: null } });
      if (exists) { skipped.push(`${p.name}: already drafted`); continue; }
      try {
        const start = new Date(); start.setUTCDate(start.getUTCDate() + 1);
        const end = new Date(start.getTime() + (p.duration_days - 1) * 86_400_000);
        const c = await this.create(orgId, userId, {
          applicationId: s.applicationId, provider: p.provider, platform: p.platform, connectedAccountId: acc?.id, strategyId, name: p.name, objective: (['installs', 'in_app_actions', 'value'].includes(p.objective) ? p.objective : 'installs') as 'installs',
          countries: p.countries, dailyBudget: Math.max(1, p.daily_budget).toFixed(2), startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10),
          targetCpi: s.estimatedCpiMinor ? fromMinor(s.estimatedCpiMinor)! : undefined,
        });
        created.push(c.id);
        if (!acc) skipped.push(`${p.name}: drafted without an ad account — connect ${p.provider.replace('_ADS', '')} to launch`);
      } catch (e) { skipped.push(`${p.name}: ${(e as Error).message}`); }
    }
    return { created, notes: skipped };
  }

  async update(orgId: string, userId: string, id: string, dto: UpdateCampaignDto) {
    await this.prisma.tenant(orgId, userId, async (tx) => {
      const c = await tx.campaign.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
      if (!c) throw notFound('Campaign');
      const structural = dto.name !== undefined || dto.countries || dto.languages || dto.startDate || dto.endDate !== undefined || dto.targetCpi !== undefined || dto.connectedAccountId !== undefined || dto.creativeIds;
      if (structural && !EDITABLE.includes(c.status)) throw new AppError('Live campaigns can only change budget, automation and status here. Duplicate it to change targeting.', 409, 'not_editable');
      if (dto.connectedAccountId !== undefined) await this.validate(tx, orgId, { applicationId: c.applicationId, provider: c.provider, platform: c.platform, connectedAccountId: dto.connectedAccountId });
      await tx.campaign.update({
        where: { id },
        data: {
          name: dto.name, countries: dto.countries, languages: dto.languages, connectedAccountId: dto.connectedAccountId, automationEnabled: dto.automationEnabled,
          startDate: dto.startDate ? new Date(`${dto.startDate}T00:00:00Z`) : undefined, endDate: dto.endDate === undefined ? undefined : dto.endDate ? new Date(`${dto.endDate}T00:00:00Z`) : null,
          targetCpiMinor: dto.targetCpi === undefined ? undefined : dto.targetCpi ? toMinor(dto.targetCpi) : null, monthlyBudgetMinor: dto.monthlyBudget === undefined ? undefined : dto.monthlyBudget ? toMinor(dto.monthlyBudget) : null,
          ...(c.status === 'FAILED' && structural ? { status: 'DRAFT', statusReason: '' } : {}),
        },
      });
      if (dto.creativeIds) await this.attachCreatives(tx, orgId, id, dto.creativeIds);
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'campaign.updated', entityType: 'campaign', entityId: id, after: dto }, tx);
      return c;
    });
    if (dto.dailyBudget) await this.setBudget(orgId, `user:${userId}`, id, toMinor(dto.dailyBudget), 'Edited by user');
    return this.get(orgId, userId, id);
  }

  async transition(orgId: string, userId: string, id: string, to: CampaignStatus, reason = '') {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const c = await tx.campaign.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
      if (!c) throw notFound('Campaign');
      if (!canTransition(c.status, to)) throw new AppError(`A ${c.status.toLowerCase().replace('_', ' ')} campaign can’t move to ${to.toLowerCase().replace('_', ' ')}`, 409, 'invalid_transition');
      if (to === 'READY' || to === 'PENDING_APPROVAL') {
        if (!c.connectedAccountId) throw new AppError('Choose a connected ad account first', 409, 'account_required');
        if (c.provider !== 'APPLE_ADS') {
          const approved = await tx.campaignCreative.count({ where: { campaignId: id, creativeAssetId: { in: (await tx.creativeAsset.findMany({ where: { organizationId: orgId, approvalStatus: 'APPROVED' }, select: { id: true } })).map((x) => x.id) } } });
          if (!approved) throw new AppError('Attach at least one approved creative', 409, 'creative_required');
        }
      }
      await tx.campaign.update({ where: { id }, data: { status: to, statusReason: reason } });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: `campaign.${to.toLowerCase()}`, entityType: 'campaign', entityId: id, before: { status: c.status }, after: { status: to, reason } }, tx);
      return { id, status: to };
    });
  }

  /**
   * Queues a platform action. Spend-affecting actions are checked against policy now (fast feedback) and again by the
   * executor under the organization budget lock (authoritative), because state can change in between.
   */
  async queueAction(orgId: string, actor: string, id: string, op: CampaignOp, request: Record<string, unknown> = {}, idempotencyKey?: string) {
    const c = await this.prisma.campaign.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
    if (!c) throw notFound('Campaign');
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    if (org.status !== 'ACTIVE') throw new AppError('Organization is suspended', 403, 'org_suspended');
    if (op === 'launch' && !['READY', 'FAILED'].includes(c.status)) throw new AppError('Only ready (approved) campaigns can be launched', 409, 'invalid_transition');
    if (op === 'pause' && c.status !== 'ACTIVE') throw new AppError('Only active campaigns can be paused', 409, 'invalid_transition');
    if (op === 'resume' && c.status !== 'PAUSED') throw new AppError('Only paused campaigns can be resumed', 409, 'invalid_transition');
    if (op !== 'pause' && actor.startsWith('agent:') && (!org.automationEnabled || !c.automationEnabled)) throw new AppError('Automation is switched off for this campaign or organization', 409, 'automation_off');
    if (['launch', 'resume', 'budget_change'].includes(op)) {
      const v = checkChange(await this.budgets.policy(orgId), await this.budgets.state(orgId, c.id), {
        actor: actor.startsWith('agent:') ? 'agent' : 'user', provider: c.provider, currentDailyMinor: c.status === 'ACTIVE' ? c.dailyBudgetMinor : null,
        newDailyMinor: op === 'budget_change' ? BigInt(String(request.dailyMinor)) : c.dailyBudgetMinor, activating: op === 'launch' || op === 'resume',
      });
      if (!v.allowed) throw new AppError(v.reason, 409, `policy_${v.code}`, { requiresApproval: v.requiresApproval });
    }
    const key = idempotencyKey ?? `${op}:${id}:${randomUUID()}`;
    const action = await this.prisma.campaignAction.upsert({ where: { idempotencyKey: key }, create: { organizationId: orgId, campaignId: id, action: op, actor, idempotencyKey: key, request: request as Prisma.InputJsonValue }, update: {} });
    if (action.status === 'pending') await queue(QUEUES.campaigns).add(op, { organizationId: orgId, actionId: action.id }, { jobId: action.id, attempts: 4, backoff: { type: 'exponential', delay: 20_000 } });
    await this.audit.record({ organizationId: orgId, actorUserId: actor.startsWith('user:') ? actor.slice(5) : null, actor, action: `campaign.${op}_requested`, entityType: 'campaign', entityId: id, after: request });
    return { actionId: action.id, status: action.status };
  }

  /** Budget change: draft campaigns update in place; live ones go through the executor. */
  async setBudget(orgId: string, actor: string, id: string, dailyMinor: bigint, reason: string, idempotencyKey?: string) {
    const c = await this.prisma.campaign.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
    if (!c) throw notFound('Campaign');
    if (EDITABLE.includes(c.status)) {
      const p = await this.budgets.policy(orgId);
      if (p.maxCampaignBudgetMinor !== null && dailyMinor > p.maxCampaignBudgetMinor) throw new AppError('Daily budget exceeds the per-campaign limit in your automation policy', 409, 'policy_campaign_cap');
      await this.prisma.$transaction([
        this.prisma.campaign.update({ where: { id }, data: { dailyBudgetMinor: dailyMinor } }),
        this.prisma.campaignBudget.create({ data: { organizationId: orgId, campaignId: id, dailyMinor, monthlyMinor: c.monthlyBudgetMinor, changedBy: actor, reason } }),
      ]);
      return { applied: true };
    }
    return this.queueAction(orgId, actor, id, 'budget_change', { dailyMinor: dailyMinor.toString(), reason }, idempotencyKey);
  }

  async archive(orgId: string, userId: string, id: string) {
    await this.transition(orgId, userId, id, 'ARCHIVED');
    await this.prisma.campaign.update({ where: { id }, data: { automationEnabled: false } });
  }
}
