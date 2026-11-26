import { Injectable } from '@nestjs/common';
import { AdProvider } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { AppError, notFound } from '../../common/errors';
import { fromMinor, pctOf, toMinor } from '../../common/money';
import { PrismaService, Tx } from '../../common/prisma.service';
import { BudgetState, daysRemaining, forecastMonth, Policy, spendableThisMonth } from '../../common/spend-policy';
import type { CreateBudgetDto, UpdateBudgetDto } from './dto';

export const monthOf = (s?: string) => {
  const now = new Date();
  if (!s) return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [y, m] = s.split('-').map(Number);
  if (m < 1 || m > 12) throw new AppError('Invalid month', 400, 'invalid_month');
  return new Date(Date.UTC(y, m - 1, 1));
};
const nextMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
const todayUtc = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())); };

@Injectable()
export class BudgetsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private view(b: { id: string; month: Date; monthlyLimitMinor: bigint; dailyLimitMinor: bigint | null; currency: string; alertThresholds: number[]; alertsSent: number[]; allocations?: { id: string; applicationId: string | null; provider: AdProvider | null; platform: string | null; country: string | null; limitMinor: bigint }[] }) {
    return {
      id: b.id, month: b.month.toISOString().slice(0, 7), monthlyLimit: fromMinor(b.monthlyLimitMinor), dailyLimit: fromMinor(b.dailyLimitMinor), currency: b.currency,
      alertThresholds: b.alertThresholds, alertsSent: b.alertsSent,
      allocations: (b.allocations ?? []).map((a) => ({ id: a.id, applicationId: a.applicationId, provider: a.provider, platform: a.platform, country: a.country, limit: fromMinor(a.limitMinor) })),
    };
  }

  list(orgId: string, userId: string) {
    return this.prisma.tenant(orgId, userId, async (tx) => (await tx.organizationBudget.findMany({ where: { organizationId: orgId }, orderBy: { month: 'desc' }, take: 24, include: { allocations: true } })).map((b) => this.view(b)));
  }

  private validateAllocations(monthly: bigint, allocs: { limit: string; applicationId?: string; provider?: string; platform?: string; country?: string }[]) {
    // Allocations of the same dimension must not exceed the monthly limit in total.
    const dims = new Map<string, bigint>();
    for (const a of allocs) {
      const dim = [a.applicationId ? 'app' : '', a.provider ? 'provider' : '', a.platform ? 'platform' : '', a.country ? 'country' : ''].filter(Boolean).join('+') || 'none';
      if (dim === 'none') throw new AppError('Each allocation needs an app, channel, platform or country', 400, 'invalid_allocation');
      const v = toMinor(a.limit);
      if (v > monthly) throw new AppError('An allocation cannot exceed the monthly limit', 400, 'invalid_allocation');
      dims.set(dim, (dims.get(dim) ?? 0n) + v);
    }
    for (const [dim, total] of dims) if (total > monthly) throw new AppError(`Allocations by ${dim} add up to more than the monthly limit`, 400, 'invalid_allocation');
  }

  async create(orgId: string, userId: string, dto: CreateBudgetDto) {
    const month = monthOf(dto.month);
    if (month < monthOf()) throw new AppError('Budgets can only be set for the current or a future month', 400, 'past_month');
    const monthly = toMinor(dto.monthlyLimit);
    const daily = dto.dailyLimit ? toMinor(dto.dailyLimit) : null;
    if (monthly <= 0n) throw new AppError('Monthly limit must be greater than zero', 400, 'invalid_amount');
    if (daily !== null && daily > monthly) throw new AppError('Daily limit cannot exceed the monthly limit', 400, 'invalid_amount');
    this.validateAllocations(monthly, dto.allocations ?? []);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const b = await tx.organizationBudget.create({
        data: { organizationId: orgId, month, monthlyLimitMinor: monthly, dailyLimitMinor: daily, currency: org.currency, alertThresholds: [...new Set(dto.alertThresholds ?? [50, 75, 90])].sort((a, b) => a - b), createdById: userId },
      });
      await this.replaceAllocations(tx, orgId, b.id, dto.allocations ?? []);
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'budget.created', entityType: 'budget', entityId: b.id, after: dto }, tx);
      return this.view(await tx.organizationBudget.findUniqueOrThrow({ where: { id: b.id }, include: { allocations: true } }));
    });
  }

  async update(orgId: string, userId: string, id: string, dto: UpdateBudgetDto) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const before = await tx.organizationBudget.findFirst({ where: { id, organizationId: orgId }, include: { allocations: true } });
      if (!before) throw notFound('Budget');
      if (before.month < monthOf()) throw new AppError('Past months are closed', 400, 'past_month');
      const monthly = dto.monthlyLimit ? toMinor(dto.monthlyLimit) : before.monthlyLimitMinor;
      const daily = dto.dailyLimit === undefined ? before.dailyLimitMinor : dto.dailyLimit === null ? null : toMinor(dto.dailyLimit);
      if (daily !== null && daily > monthly) throw new AppError('Daily limit cannot exceed the monthly limit', 400, 'invalid_amount');
      if (dto.allocations) this.validateAllocations(monthly, dto.allocations);
      // Lowering a limit below what is already spent is allowed (it stops further spend) but flagged.
      const thresholds = dto.alertThresholds ? [...new Set(dto.alertThresholds)].sort((a, b) => a - b) : undefined;
      await tx.organizationBudget.update({ where: { id }, data: { monthlyLimitMinor: monthly, dailyLimitMinor: daily, alertThresholds: thresholds, ...(dto.monthlyLimit ? { alertsSent: [] } : {}) } });
      if (dto.allocations) await this.replaceAllocations(tx, orgId, id, dto.allocations);
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'budget.updated', entityType: 'budget', entityId: id, before: this.view(before), after: dto }, tx);
      return this.view(await tx.organizationBudget.findUniqueOrThrow({ where: { id }, include: { allocations: true } }));
    });
  }

  private async replaceAllocations(tx: Tx, orgId: string, budgetId: string, allocs: NonNullable<CreateBudgetDto['allocations']>) {
    await tx.advertisingBudgetAllocation.deleteMany({ where: { budgetId } });
    if (allocs.length) await tx.advertisingBudgetAllocation.createMany({ data: allocs.map((a) => ({ organizationId: orgId, budgetId, applicationId: a.applicationId, provider: a.provider, platform: a.platform, country: a.country, limitMinor: toMinor(a.limit) })) });
  }

  async policy(orgId: string, tx?: Tx): Promise<Policy> {
    const p = await (tx ?? this.prisma).automationPolicy.findUniqueOrThrow({ where: { organizationId: orgId } });
    return { autonomyLevel: p.autonomyLevel, maxDailySpendMinor: p.maxDailySpendMinor, maxMonthlySpendMinor: p.maxMonthlySpendMinor, maxCampaignBudgetMinor: p.maxCampaignBudgetMinor, maxBudgetIncreasePct: p.maxBudgetIncreasePct, maxConcurrentCampaigns: p.maxConcurrentCampaigns, reservePct: p.reservePct, allowedProviders: p.allowedProviders };
  }

  /** Current budget state for spend-policy checks. `excludeCampaignId` = the campaign being changed. */
  async state(orgId: string, excludeCampaignId?: string, tx?: Tx): Promise<BudgetState> {
    const db = tx ?? this.prisma;
    const month = monthOf(); const today = todayUtc();
    const [budget, spentMonth, spentToday, active] = await Promise.all([
      db.organizationBudget.findUnique({ where: { organizationId_month: { organizationId: orgId, month } } }),
      db.advertisingSpend.aggregate({ where: { organizationId: orgId, date: { gte: month, lt: nextMonth(month) } }, _sum: { amountMinor: true } }),
      db.advertisingSpend.aggregate({ where: { organizationId: orgId, date: today }, _sum: { amountMinor: true } }),
      db.campaign.findMany({ where: { organizationId: orgId, status: 'ACTIVE', deletedAt: null, ...(excludeCampaignId ? { id: { not: excludeCampaignId } } : {}) }, select: { dailyBudgetMinor: true } }),
    ]);
    return {
      monthlyLimitMinor: budget?.monthlyLimitMinor ?? null, dailyLimitMinor: budget?.dailyLimitMinor ?? null,
      spentThisMonthMinor: spentMonth._sum.amountMinor ?? 0n, spentTodayMinor: spentToday._sum.amountMinor ?? 0n,
      daysRemainingInclToday: daysRemaining(), activeDailyBudgetsMinor: active.reduce((s, c) => s + c.dailyBudgetMinor, 0n), activeCampaigns: active.length,
    };
  }

  async spend(orgId: string, userId: string, monthStr?: string) {
    const month = monthOf(monthStr);
    const end = nextMonth(month);
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const [org, budget, daily, byCampaign, byProvider, policy] = await Promise.all([
        tx.organization.findUniqueOrThrow({ where: { id: orgId } }),
        tx.organizationBudget.findUnique({ where: { organizationId_month: { organizationId: orgId, month } }, include: { allocations: true } }),
        tx.advertisingSpend.groupBy({ by: ['date'], where: { organizationId: orgId, date: { gte: month, lt: end } }, _sum: { amountMinor: true }, orderBy: { date: 'asc' } }),
        tx.advertisingSpend.groupBy({ by: ['campaignId'], where: { organizationId: orgId, date: { gte: month, lt: end } }, _sum: { amountMinor: true } }),
        tx.advertisingSpend.groupBy({ by: ['provider'], where: { organizationId: orgId, date: { gte: month, lt: end } }, _sum: { amountMinor: true } }),
        this.policy(orgId, tx),
      ]);
      const spent = daily.reduce((s, d) => s + (d._sum.amountMinor ?? 0n), 0n);
      const st: BudgetState = { monthlyLimitMinor: budget?.monthlyLimitMinor ?? null, dailyLimitMinor: budget?.dailyLimitMinor ?? null, spentThisMonthMinor: spent, spentTodayMinor: 0n, daysRemainingInclToday: daysRemaining(), activeDailyBudgetsMinor: 0n, activeCampaigns: 0 };
      const spendable = spendableThisMonth(policy, st);
      const campaigns = await tx.campaign.findMany({ where: { id: { in: byCampaign.map((c) => c.campaignId).filter((x): x is string => !!x) } }, select: { id: true, name: true, provider: true } });
      const cname = new Map(campaigns.map((c) => [c.id, c]));
      // discrepancy: platform-reported campaign metrics vs account spend
      const metricSpend = await tx.campaignMetric.aggregate({ where: { organizationId: orgId, date: { gte: month, lt: end } }, _sum: { spendMinor: true } });
      const diff = (metricSpend._sum.spendMinor ?? 0n) - spent;
      const absDiff = diff < 0n ? -diff : diff;
      return {
        month: month.toISOString().slice(0, 7), currency: budget?.currency ?? org.currency, budget: budget ? this.view(budget) : null,
        spent: fromMinor(spent), remaining: budget ? fromMinor(budget.monthlyLimitMinor - spent) : null, spendableAfterReserve: spendable === null ? null : fromMinor(spendable - spent),
        reservePct: policy.reservePct, usedPct: budget ? pctOf(spent, budget.monthlyLimitMinor) : null,
        daily: daily.map((d) => ({ date: d.date.toISOString().slice(0, 10), spend: fromMinor(d._sum.amountMinor ?? 0n) })),
        byCampaign: byCampaign.map((c) => ({ campaignId: c.campaignId, name: c.campaignId ? cname.get(c.campaignId)?.name ?? 'Deleted campaign' : 'Account-level', provider: c.campaignId ? cname.get(c.campaignId)?.provider : null, spend: fromMinor(c._sum.amountMinor ?? 0n) })),
        byProvider: byProvider.map((p) => ({ provider: p.provider, spend: fromMinor(p._sum.amountMinor ?? 0n) })),
        discrepancy: { campaignMetricsSpend: fromMinor(metricSpend._sum.spendMinor ?? 0n), accountSpend: fromMinor(spent), difference: fromMinor(diff), flagged: spent > 0n && absDiff * 100n > spent * 5n },
      };
    });
  }

  async forecast(orgId: string, userId: string, applicationId?: string) {
    const month = monthOf(); const now = new Date();
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const daysElapsed = now.getUTCDate();
    const weekAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const appWhere = applicationId ? { applicationId } : {};
      const [apps, toDate, recent, st, policy] = await Promise.all([
        tx.application.findMany({ where: { organizationId: orgId, deletedAt: null, ...(applicationId ? { id: applicationId } : {}) }, include: { targets: { where: { month } } } }),
        tx.analyticsDaily.aggregate({ where: { organizationId: orgId, ...appWhere, date: { gte: month } }, _sum: { firstInstalls: true, aggregateAttributedInstalls: true, spendMinor: true } }),
        tx.analyticsDaily.aggregate({ where: { organizationId: orgId, ...appWhere, date: { gte: weekAgo } }, _sum: { firstInstalls: true, aggregateAttributedInstalls: true, spendMinor: true } }),
        this.state(orgId, undefined, tx), this.policy(orgId, tx),
      ]);
      if (applicationId && !apps.length) throw notFound('Application');
      const target = apps.reduce((s, a) => s + (a.targets[0]?.installs ?? a.monthlyInstallTarget), 0);
      const spendable = spendableThisMonth(policy, st);
      const f = forecastMonth({
        daysElapsed, daysInMonth, installsToDate: (toDate._sum.firstInstalls ?? 0) + (toDate._sum.aggregateAttributedInstalls ?? 0), spendToDateMinor: toDate._sum.spendMinor ?? 0n,
        recentInstalls: (recent._sum.firstInstalls ?? 0) + (recent._sum.aggregateAttributedInstalls ?? 0), recentSpendMinor: recent._sum.spendMinor ?? 0n, recentDays: Math.min(7, daysElapsed),
        remainingBudgetMinor: spendable === null ? null : spendable - st.spentThisMonthMinor, target,
      });
      return {
        month: month.toISOString().slice(0, 7), target, ...f,
        projectedSpend: fromMinor(f.projectedSpendMinor), recentCpi: fromMinor(f.recentCpiMinor), requiredBudget: fromMinor(f.requiredBudgetMinor),
        projectedSpendMinor: undefined, recentCpiMinor: undefined, requiredBudgetMinor: undefined,
        disclaimer: 'Forecasts are estimates from your recent cost per install and remaining budget. Installs are not guaranteed: auction prices, creative performance and store conversion change.',
      };
    });
  }
}
