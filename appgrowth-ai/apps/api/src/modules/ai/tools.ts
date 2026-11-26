import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors';
import { cpiMinor, fromMinor } from '../../common/money';
import { PrismaService, Tx } from '../../common/prisma.service';
import { BudgetsService, monthOf } from '../budgets/budgets.service';

export interface ToolCtx { orgId: string; applicationId?: string; campaignId?: string; platform?: 'ANDROID' | 'IOS'; days?: number }
type ToolFn = (tx: Tx, ctx: ToolCtx) => Promise<unknown>;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => { const t = new Date(); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - n)); };

/**
 * Registered read tools. Agents never get database or network access: the orchestrator calls these on the agent's behalf,
 * only if the tool is listed in the agent's definition, inside the organization's RLS context, with typed inputs.
 * Mutating actions (budget changes, pauses) are not tools the model can call — the model *proposes* them and
 * the BudgetEngine applies them after policy checks.
 */
@Injectable()
export class ToolRegistry {
  constructor(private prisma: PrismaService, private budgets: BudgetsService) {}

  private tools: Record<string, ToolFn> = {
    'app.get_profile': async (tx, c) => {
      if (!c.applicationId) throw new AppError('app.get_profile needs an application', 400, 'tool_input');
      const a = await tx.application.findFirst({ where: { id: c.applicationId, organizationId: c.orgId, deletedAt: null }, include: { platforms: true, countries: true, languages: true, targets: { where: { month: monthOf() } } } });
      if (!a) throw new AppError('Application not found', 404, 'not_found');
      const [org, kit] = await Promise.all([tx.organization.findUniqueOrThrow({ where: { id: c.orgId } }), tx.brandKit.findUnique({ where: { organizationId: c.orgId } })]);
      return {
        name: a.name, category: a.category, description: a.description.slice(0, 6000), target_audience: a.targetAudience,
        platforms: a.platforms.map((p) => ({ platform: p.platform, store_id: p.storeId, store_url: p.storeUrl })),
        countries: a.countries.map((x) => x.country), languages: a.languages.map((x) => x.language),
        monthly_install_target: a.targets[0]?.installs ?? a.monthlyInstallTarget, target_cpi: fromMinor(a.targetCpiMinor), currency: org.currency,
        organization_country: org.country, brand: kit ? { voice: kit.voice, guidelines: kit.guidelines.slice(0, 3000), banned_claims: kit.bannedClaims, colors: kit.colors } : null,
      };
    },
    'store.get_listing': async (tx, c) => {
      const rows = await tx.applicationStoreListing.findMany({ where: { applicationId: c.applicationId, organizationId: c.orgId, ...(c.platform ? { platform: c.platform } : {}) }, orderBy: { fetchedAt: 'desc' }, take: 4 });
      const latest = new Map<string, (typeof rows)[number]>();
      for (const r of rows) if (!latest.has(r.platform)) latest.set(r.platform, r);
      return [...latest.values()].map((l) => ({ platform: l.platform, title: l.title, subtitle: l.subtitle, description: l.description.slice(0, 5000), developer: l.developer, rating: l.rating ? Number(l.rating) : null, rating_count: l.ratingCount, screenshot_count: (l.screenshotUrls as string[]).length, source: l.source, fetched_at: l.fetchedAt }));
    },
    'store.lookup_public': async () => ({ note: 'Competitor listings are looked up by the research step through web search.' }),
    'research.web_search': async () => ({ note: 'Grounded web search is performed by the AI provider and returns sources.' }),
    'analytics.get_summary': async (tx, c) => {
      const from = daysAgo(c.days ?? 30);
      const where = { organizationId: c.orgId, ...(c.applicationId ? { applicationId: c.applicationId } : {}), date: { gte: from } };
      const [sum, daily] = await Promise.all([
        tx.analyticsDaily.aggregate({ where, _sum: { firstInstalls: true, reinstalls: true, organicInstalls: true, paidInstalls: true, unattributedInstalls: true, aggregateAttributedInstalls: true, registrations: true, spendMinor: true } }),
        tx.analyticsDaily.groupBy({ by: ['date'], where, _sum: { firstInstalls: true, paidInstalls: true, spendMinor: true, aggregateAttributedInstalls: true }, orderBy: { date: 'asc' } }),
      ]);
      const paid = (sum._sum.paidInstalls ?? 0) + (sum._sum.aggregateAttributedInstalls ?? 0);
      return {
        window_days: c.days ?? 30, totals: { ...sum._sum, spendMinor: undefined, spend: fromMinor(sum._sum.spendMinor ?? 0n), cpi: fromMinor(cpiMinor(sum._sum.spendMinor ?? 0n, paid)) },
        daily: daily.map((d) => ({ date: iso(d.date), installs: (d._sum.firstInstalls ?? 0) + (d._sum.aggregateAttributedInstalls ?? 0), paid: d._sum.paidInstalls ?? 0, spend: fromMinor(d._sum.spendMinor ?? 0n) })),
        has_data: daily.length > 0,
      };
    },
    'analytics.get_campaign_daily': async (tx, c) => {
      const campaigns = await tx.campaign.findMany({ where: { organizationId: c.orgId, deletedAt: null, status: { in: ['ACTIVE', 'PAUSED'] }, ...(c.applicationId ? { applicationId: c.applicationId } : {}), ...(c.campaignId ? { id: c.campaignId } : {}) }, select: { id: true, name: true, provider: true, platform: true, status: true, dailyBudgetMinor: true, targetCpiMinor: true, createdAt: true } });
      const metrics = await tx.campaignMetric.groupBy({ by: ['campaignId', 'date'], where: { campaignId: { in: campaigns.map((x) => x.id) }, date: { gte: daysAgo(c.days ?? 14) } }, _sum: { impressions: true, clicks: true, installs: true, spendMinor: true }, orderBy: { date: 'asc' } });
      return campaigns.map((x) => {
        const rows = metrics.filter((m) => m.campaignId === x.id);
        const spend = rows.reduce((s, r) => s + (r._sum.spendMinor ?? 0n), 0n); const inst = rows.reduce((s, r) => s + (r._sum.installs ?? 0), 0);
        return {
          campaign_id: x.id, name: x.name, provider: x.provider, platform: x.platform, status: x.status, daily_budget: fromMinor(x.dailyBudgetMinor), target_cpi: fromMinor(x.targetCpiMinor),
          days_live: Math.floor((Date.now() - x.createdAt.getTime()) / 86_400_000), totals: { spend: fromMinor(spend), installs: inst, cpi: fromMinor(cpiMinor(spend, inst)) },
          daily: rows.map((r) => ({ date: iso(r.date), impressions: Number(r._sum.impressions ?? 0), clicks: Number(r._sum.clicks ?? 0), installs: r._sum.installs ?? 0, spend: fromMinor(r._sum.spendMinor ?? 0n) })),
        };
      });
    },
    'analytics.get_retention': async (tx, c) => (await tx.retentionMetric.findMany({ where: { organizationId: c.orgId, ...(c.applicationId ? { applicationId: c.applicationId } : {}), cohortDate: { gte: daysAgo(c.days ?? 60) } }, orderBy: { cohortDate: 'asc' }, take: 300 }))
      .map((r) => ({ cohort: iso(r.cohortDate), source: r.source, campaign_id: r.campaignId, size: r.cohortSize, d1: r.d1 ? Number(r.d1) : null, d7: r.d7 ? Number(r.d7) : null, d30: r.d30 ? Number(r.d30) : null })),
    'budget.get_status': async (tx, c) => {
      const [st, policy, budget, org] = await Promise.all([this.budgets.state(c.orgId, undefined, tx), this.budgets.policy(c.orgId, tx), tx.organizationBudget.findUnique({ where: { organizationId_month: { organizationId: c.orgId, month: monthOf() } }, include: { allocations: true } }), tx.organization.findUniqueOrThrow({ where: { id: c.orgId } })]);
      const cap = [policy.maxMonthlySpendMinor, st.monthlyLimitMinor].filter((x): x is bigint => x !== null).sort((a, b) => (a < b ? -1 : 1))[0] ?? null;
      const spendable = cap === null ? null : (cap * BigInt(100 - policy.reservePct)) / 100n;
      return {
        currency: org.currency, month: iso(monthOf()).slice(0, 7), monthly_limit: fromMinor(st.monthlyLimitMinor), daily_limit: fromMinor(st.dailyLimitMinor),
        spent_this_month: fromMinor(st.spentThisMonthMinor), spent_today: fromMinor(st.spentTodayMinor), remaining_after_reserve: spendable === null ? null : fromMinor(spendable - st.spentThisMonthMinor),
        days_remaining: st.daysRemainingInclToday, active_daily_budgets_total: fromMinor(st.activeDailyBudgetsMinor), active_campaigns: st.activeCampaigns,
        allocations: budget?.allocations.map((a) => ({ provider: a.provider, platform: a.platform, country: a.country, application_id: a.applicationId, limit: fromMinor(a.limitMinor) })) ?? [],
        policy: { autonomy: policy.autonomyLevel, max_budget_increase_pct: policy.maxBudgetIncreasePct, max_campaign_daily_budget: fromMinor(policy.maxCampaignBudgetMinor), max_concurrent_campaigns: policy.maxConcurrentCampaigns, reserve_pct: policy.reservePct, allowed_channels: policy.allowedProviders },
      };
    },
    'campaign.list': async (tx, c) => {
      const [campaigns, accounts] = await Promise.all([
        tx.campaign.findMany({ where: { organizationId: c.orgId, deletedAt: null, ...(c.applicationId ? { applicationId: c.applicationId } : {}) }, select: { id: true, name: true, provider: true, platform: true, status: true, countries: true, dailyBudgetMinor: true, targetCpiMinor: true, objective: true }, take: 100 }),
        tx.connectedAccount.findMany({ where: { organizationId: c.orgId, deletedAt: null, providerKey: { in: ['google_ads', 'apple_ads', 'meta_ads', 'tiktok_ads'] } }, select: { providerKey: true, status: true, currency: true } }),
      ]);
      return { campaigns: campaigns.map((x) => ({ ...x, dailyBudgetMinor: undefined, targetCpiMinor: undefined, daily_budget: fromMinor(x.dailyBudgetMinor), target_cpi: fromMinor(x.targetCpiMinor) })), connected_ad_accounts: accounts };
    },
    'campaign.propose_change': async () => ({ note: 'Proposals are recorded by the orchestrator from the agent output.' }),
    'report.save': async () => ({ note: 'Reports are saved by the reporting engine.' }),
    'creative.save_variant': async () => ({ note: 'Creatives are saved by the creative engine from the agent output.' }),
  };

  /** Runs a read tool for an agent. Refuses tools the agent's definition doesn't list (least privilege). */
  async call(agent: { key: string; tools: string[] }, toolKey: string, ctx: ToolCtx) {
    if (!agent.tools.includes(toolKey)) throw new AppError(`Agent ${agent.key} is not permitted to use ${toolKey}`, 403, 'tool_forbidden');
    const fn = this.tools[toolKey];
    if (!fn) throw new AppError(`Unknown tool ${toolKey}`, 400, 'tool_unknown');
    return this.prisma.tenant(ctx.orgId, null, (tx) => fn(tx, ctx));
  }

  has(key: string) { return key in this.tools; }
}
