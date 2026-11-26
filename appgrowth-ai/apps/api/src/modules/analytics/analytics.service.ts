import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { cpiMinor, fromMinor, pctOf } from '../../common/money';
import { PrismaService, Tx } from '../../common/prisma.service';
import type { AnalyticsQuery } from './dto';

const DAY = 86_400_000;
export function range(q: AnalyticsQuery) {
  const now = new Date();
  const to = q.to ? new Date(`${q.to}T00:00:00Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = q.from ? new Date(`${q.from}T00:00:00Z`) : new Date(to.getTime() - 29 * DAY);
  if (from > to) throw new AppError('“from” must be before “to”', 400, 'invalid_range');
  if ((to.getTime() - from.getTime()) / DAY > 400) throw new AppError('Date range is limited to 400 days', 400, 'invalid_range');
  return { from, to, days: Math.round((to.getTime() - from.getTime()) / DAY) + 1 };
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Read side of analytics. All numbers come from rollups the analytics engine computes from de-duplicated events and
 * platform-reported metrics (see AttributionService). Installs are only ever counted once.
 */
@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  private campaignFilter(q: AnalyticsQuery, orgId: string): Prisma.CampaignWhereInput {
    return { organizationId: orgId, ...(q.applicationId ? { applicationId: q.applicationId } : {}), ...(q.platform ? { platform: q.platform } : {}), ...(q.channel ? { provider: q.channel } : {}), ...(q.campaignId ? { id: q.campaignId } : {}) };
  }

  /** Campaign-level filters (country, campaign, channel) can't apply to app-level installs; report that explicitly. */
  private scope(q: AnalyticsQuery) { return q.country || q.campaignId || q.channel ? 'paid' : 'all'; }

  async overview(orgId: string, userId: string, q: AnalyticsQuery) {
    const { from, to, days } = range(q);
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
      const appWhere = { organizationId: orgId, ...(q.applicationId ? { applicationId: q.applicationId } : {}), ...(q.platform ? { platform: q.platform } : {}), date: { gte: from, lte: to } };
      const scope = this.scope(q);
      const [app, series, camp, apps, activeCampaigns, retention, recs] = await Promise.all([
        tx.analyticsDaily.aggregate({ where: appWhere, _sum: { firstInstalls: true, reinstalls: true, organicInstalls: true, paidInstalls: true, unattributedInstalls: true, aggregateAttributedInstalls: true, registrations: true, spendMinor: true } }),
        tx.analyticsDaily.groupBy({ by: ['date'], where: appWhere, _sum: { firstInstalls: true, paidInstalls: true, organicInstalls: true, aggregateAttributedInstalls: true, spendMinor: true, registrations: true }, orderBy: { date: 'asc' } }),
        this.campaignTotals(tx, orgId, q, from, to),
        tx.application.findMany({ where: { organizationId: orgId, deletedAt: null, ...(q.applicationId ? { id: q.applicationId } : {}) }, select: { id: true, monthlyInstallTarget: true, targets: { where: { month: new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1)) } } } }),
        tx.campaign.count({ where: { ...this.campaignFilter(q, orgId), status: 'ACTIVE', deletedAt: null } }),
        tx.retentionMetric.aggregate({ where: { organizationId: orgId, ...(q.applicationId ? { applicationId: q.applicationId } : {}), source: 'all', campaignId: null, cohortDate: { gte: new Date(to.getTime() - 60 * DAY) } }, _avg: { d1: true, d7: true, d30: true }, _sum: { cohortSize: true } }),
        tx.optimizationDecision.findMany({ where: { organizationId: orgId, outcome: 'proposed' }, orderBy: { createdAt: 'desc' }, take: 5 }),
      ]);
      const monthStart = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
      const mtd = await tx.analyticsDaily.aggregate({ where: { ...appWhere, date: { gte: monthStart, lte: to } }, _sum: { firstInstalls: true, aggregateAttributedInstalls: true } });
      const target = apps.reduce((s, a) => s + (a.targets[0]?.installs ?? a.monthlyInstallTarget), 0);
      const mtdInstalls = (mtd._sum.firstInstalls ?? 0) + (mtd._sum.aggregateAttributedInstalls ?? 0);
      const s = app._sum;
      const totalInstalls = scope === 'paid' ? camp.installs : (s.firstInstalls ?? 0) + (s.aggregateAttributedInstalls ?? 0);
      const paid = scope === 'paid' ? camp.installs : (s.paidInstalls ?? 0) + (s.aggregateAttributedInstalls ?? 0);
      const spend = scope === 'paid' ? camp.spendMinor : (s.spendMinor ?? 0n);
      const budget = await tx.organizationBudget.findUnique({ where: { organizationId_month: { organizationId: orgId, month: monthStart } } });
      const spentMonth = await tx.advertisingSpend.aggregate({ where: { organizationId: orgId, date: { gte: monthStart, lte: to } }, _sum: { amountMinor: true } });
      const seriesMap = new Map(series.map((r) => [iso(r.date), r._sum]));
      return {
        range: { from: iso(from), to: iso(to), days }, currency: org.currency, scope,
        scopeNote: scope === 'paid' ? 'Country, campaign or channel filters apply to paid, platform-reported results only.' : null,
        totals: {
          installs: totalInstalls, paidInstalls: paid, organicInstalls: scope === 'paid' ? null : s.organicInstalls ?? 0, unattributedInstalls: scope === 'paid' ? null : s.unattributedInstalls ?? 0,
          aggregateAttributedInstalls: s.aggregateAttributedInstalls ?? 0, reinstalls: scope === 'paid' ? null : s.reinstalls ?? 0,
          registrations: scope === 'paid' ? camp.registrations : s.registrations ?? 0,
          spend: fromMinor(spend), cpi: fromMinor(cpiMinor(spend, paid)), costPerRegistration: fromMinor(cpiMinor(spend, scope === 'paid' ? camp.registrations : s.registrations ?? 0)),
          impressions: camp.impressions.toString(), clicks: camp.clicks.toString(),
          clickToInstallRate: camp.clicks > 0n ? pctOf(BigInt(camp.installs) * 100n, camp.clicks * 100n) : null,
          installToRegistrationRate: totalInstalls ? Math.round(((s.registrations ?? 0) / totalInstalls) * 10000) / 100 : null,
          dailyAverageInstalls: Math.round(totalInstalls / days),
        },
        target: { month: iso(monthStart).slice(0, 7), installs: target, achieved: mtdInstalls, achievementPct: target ? Math.round((mtdInstalls / target) * 1000) / 10 : null },
        budget: budget ? { monthlyLimit: fromMinor(budget.monthlyLimitMinor), spent: fromMinor(spentMonth._sum.amountMinor ?? 0n), remaining: fromMinor(budget.monthlyLimitMinor - (spentMonth._sum.amountMinor ?? 0n)), usedPct: pctOf(spentMonth._sum.amountMinor ?? 0n, budget.monthlyLimitMinor) } : null,
        activeCampaigns,
        retention: { d1: retention._avg.d1 ? Number(retention._avg.d1) : null, d7: retention._avg.d7 ? Number(retention._avg.d7) : null, d30: retention._avg.d30 ? Number(retention._avg.d30) : null, cohortUsers: retention._sum.cohortSize ?? 0 },
        series: Array.from({ length: days }, (_, i) => {
          const d = iso(new Date(from.getTime() + i * DAY)); const r = seriesMap.get(d);
          return { date: d, installs: (r?.firstInstalls ?? 0) + (r?.aggregateAttributedInstalls ?? 0), paid: (r?.paidInstalls ?? 0) + (r?.aggregateAttributedInstalls ?? 0), organic: r?.organicInstalls ?? 0, registrations: r?.registrations ?? 0, spend: fromMinor(r?.spendMinor ?? 0n) };
        }),
        recommendations: recs.map((r) => ({ id: r.id, kind: r.kind, rationale: r.rationale, campaignId: r.campaignId, createdAt: r.createdAt })),
        hasData: series.length > 0 || camp.impressions > 0n,
      };
    });
  }

  private async campaignTotals(tx: Tx, orgId: string, q: AnalyticsQuery, from: Date, to: Date) {
    const campaigns = await tx.campaign.findMany({ where: this.campaignFilter(q, orgId), select: { id: true } });
    const ids = campaigns.map((c) => c.id);
    if (!ids.length) return { installs: 0, spendMinor: 0n, impressions: 0n, clicks: 0n, registrations: 0 };
    const where = { campaignId: { in: ids }, date: { gte: from, lte: to }, ...(q.country ? { country: q.country } : {}) };
    const m = await tx.campaignMetric.aggregate({ where, _sum: { installs: true, spendMinor: true, impressions: true, clicks: true } });
    const r = q.country ? null : await tx.analyticsCampaignDaily.aggregate({ where: { campaignId: { in: ids }, date: { gte: from, lte: to } }, _sum: { registrations: true } });
    return { installs: m._sum.installs ?? 0, spendMinor: m._sum.spendMinor ?? 0n, impressions: m._sum.impressions ?? 0n, clicks: m._sum.clicks ?? 0n, registrations: r?._sum.registrations ?? 0 };
  }

  async installs(orgId: string, userId: string, q: AnalyticsQuery) {
    const { from, to } = range(q);
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const rows = await tx.analyticsDaily.groupBy({
        by: ['date', 'platform'], orderBy: { date: 'asc' },
        where: { organizationId: orgId, ...(q.applicationId ? { applicationId: q.applicationId } : {}), ...(q.platform ? { platform: q.platform } : {}), date: { gte: from, lte: to } },
        _sum: { firstInstalls: true, reinstalls: true, organicInstalls: true, paidInstalls: true, unattributedInstalls: true, aggregateAttributedInstalls: true, registrations: true, activeUsers: true },
      });
      return {
        range: { from: iso(from), to: iso(to) },
        methodology: 'First installs are de-duplicated per device per app. Reinstalls are counted separately and never as new users. iOS SKAdNetwork / AdAttributionKit postbacks are aggregate and reported in their own column; they cannot be matched to individual users.',
        rows: rows.map((r) => ({ date: iso(r.date), platform: r.platform, ...r._sum })),
      };
    });
  }

  async campaigns(orgId: string, userId: string, q: AnalyticsQuery) {
    const { from, to } = range(q);
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const campaigns = await tx.campaign.findMany({ where: { ...this.campaignFilter(q, orgId), deletedAt: null }, select: { id: true, name: true, provider: true, platform: true, status: true, currency: true, targetCpiMinor: true, dailyBudgetMinor: true, applicationId: true } });
      const metrics = await tx.campaignMetric.groupBy({ by: ['campaignId'], where: { campaignId: { in: campaigns.map((c) => c.id) }, date: { gte: from, lte: to }, ...(q.country ? { country: q.country } : {}) }, _sum: { impressions: true, clicks: true, installs: true, spendMinor: true } });
      const regs = await tx.analyticsCampaignDaily.groupBy({ by: ['campaignId'], where: { campaignId: { in: campaigns.map((c) => c.id) }, date: { gte: from, lte: to } }, _sum: { registrations: true, attributedInstalls: true } });
      const mm = new Map(metrics.map((m) => [m.campaignId, m._sum])); const rr = new Map(regs.map((r) => [r.campaignId, r._sum]));
      return campaigns.map((c) => {
        const m = mm.get(c.id); const r = rr.get(c.id);
        const spend = m?.spendMinor ?? 0n; const inst = m?.installs ?? 0; const clicks = m?.clicks ?? 0n; const imps = m?.impressions ?? 0n;
        const cpi = cpiMinor(spend, inst);
        return {
          id: c.id, name: c.name, provider: c.provider, platform: c.platform, status: c.status, currency: c.currency, applicationId: c.applicationId,
          impressions: imps.toString(), clicks: clicks.toString(), installs: inst, attributedInstalls: r?.attributedInstalls ?? 0, registrations: r?.registrations ?? 0,
          spend: fromMinor(spend), cpi: fromMinor(cpi), targetCpi: fromMinor(c.targetCpiMinor), dailyBudget: fromMinor(c.dailyBudgetMinor),
          ctr: imps > 0n ? pctOf(clicks, imps) : null, cvr: clicks > 0n ? pctOf(BigInt(inst), clicks) : null,
          cpiVsTarget: cpi && c.targetCpiMinor ? Math.round(Number((cpi * 1000n) / c.targetCpiMinor)) / 1000 : null,
        };
      }).sort((a, b) => Number(b.spend ?? 0) - Number(a.spend ?? 0));
    });
  }

  async countries(orgId: string, userId: string, q: AnalyticsQuery) {
    const { from, to } = range(q);
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const rows = await tx.countryMetric.groupBy({ by: ['country'], where: { organizationId: orgId, ...(q.applicationId ? { applicationId: q.applicationId } : {}), ...(q.country ? { country: q.country } : {}), date: { gte: from, lte: to } }, _sum: { installs: true, paidInstalls: true, spendMinor: true, registrations: true }, orderBy: { _sum: { installs: 'desc' } } });
      return rows.map((r) => ({ country: r.country, installs: r._sum.installs ?? 0, paidInstalls: r._sum.paidInstalls ?? 0, registrations: r._sum.registrations ?? 0, spend: fromMinor(r._sum.spendMinor ?? 0n), cpi: fromMinor(cpiMinor(r._sum.spendMinor ?? 0n, r._sum.paidInstalls ?? 0)) }));
    });
  }

  async retention(orgId: string, userId: string, q: AnalyticsQuery) {
    const { from, to } = range(q);
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const rows = await tx.retentionMetric.findMany({ where: { organizationId: orgId, ...(q.applicationId ? { applicationId: q.applicationId } : {}), ...(q.campaignId ? { campaignId: q.campaignId } : {}), cohortDate: { gte: from, lte: to } }, orderBy: { cohortDate: 'asc' } });
      return rows.map((r) => ({ cohortDate: iso(r.cohortDate), source: r.source, campaignId: r.campaignId, cohortSize: r.cohortSize, d1: r.d1 ? Number(r.d1) : null, d7: r.d7 ? Number(r.d7) : null, d30: r.d30 ? Number(r.d30) : null }));
    });
  }

  async cpi(orgId: string, userId: string, q: AnalyticsQuery) {
    const { from, to } = range(q);
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const campaigns = await tx.campaign.findMany({ where: this.campaignFilter(q, orgId), select: { id: true, provider: true } });
      const prov = new Map(campaigns.map((c) => [c.id, c.provider]));
      const rows = await tx.campaignMetric.groupBy({ by: ['date', 'campaignId'], where: { campaignId: { in: campaigns.map((c) => c.id) }, date: { gte: from, lte: to }, ...(q.country ? { country: q.country } : {}) }, _sum: { installs: true, spendMinor: true }, orderBy: { date: 'asc' } });
      const by = new Map<string, Map<string, { spend: bigint; installs: number }>>();
      for (const r of rows) {
        const d = iso(r.date); const p = prov.get(r.campaignId)!;
        const m = by.get(d) ?? new Map(); const cur = m.get(p) ?? { spend: 0n, installs: 0 };
        cur.spend += r._sum.spendMinor ?? 0n; cur.installs += r._sum.installs ?? 0; m.set(p, cur); by.set(d, m);
      }
      return [...by.entries()].map(([date, m]) => ({ date, byChannel: Object.fromEntries([...m.entries()].map(([p, v]) => [p, { spend: fromMinor(v.spend), installs: v.installs, cpi: fromMinor(cpiMinor(v.spend, v.installs)) }])) }));
    });
  }
}
