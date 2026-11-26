import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { cpiMinor, fromMinor } from '../../common/money';
import { PrismaService } from '../../common/prisma.service';
import { forecastMonth, spendableThisMonth } from '../../common/spend-policy';
import { Orchestrator } from '../ai/orchestrator.service';
import { AnalyticsEngine } from '../attribution/analytics-engine.service';
import { AttributionService } from '../attribution/attribution.service';
import { BudgetsService, monthOf } from '../budgets/budgets.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { SyncService } from '../campaigns/sync.service';
import { CreativesService } from '../creatives/creatives.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReportsService } from '../reports/reports.service';
import { StepCtx, WorkflowEngine } from './workflow-engine.service';

const DAY = 86_400_000;
const daysAgo = (n: number) => { const t = new Date(); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - n)); };
interface Anomaly { campaignId: string; name: string; kind: 'cpi_breach' | 'spend_no_installs' | 'inactive' | 'overspend' | 'tracking_failure'; detail: string; pause: boolean }

/** Workflows B–G (A is onboarding.workflow.ts). */
@Injectable()
export class AutomationWorkflows implements OnModuleInit {
  private log = new Logger('Workflows');
  constructor(
    private engine: WorkflowEngine, private prisma: PrismaService, private sync: SyncService, private attribution: AttributionService, private analytics: AnalyticsEngine,
    private budgets: BudgetsService, private campaigns: CampaignsService, private orch: Orchestrator, private notify: NotificationsService, private reports: ReportsService,
    private integrations: IntegrationsService, private creatives: CreativesService,
  ) {}

  onModuleInit() {
    // ── B: campaign creation from an approved strategy (stops at human approval; launch is explicit) ──
    this.engine.register({ key: 'campaign_creation', steps: [
      { key: 'load_strategy', critical: true, run: async (c) => {
        const s = await this.prisma.marketingStrategy.findFirst({ where: { id: String(c.input.strategyId), organizationId: c.organizationId } });
        if (!s || s.status !== 'APPROVED') throw new Error('Strategy is not approved');
        return { status: 'SUCCEEDED', output: { strategyId: s.id, applicationId: s.applicationId } };
      } },
      { key: 'verify_account', run: async (c) => {
        const accounts = await this.prisma.connectedAccount.findMany({ where: { organizationId: c.organizationId, deletedAt: null, status: 'CONNECTED' }, select: { providerKey: true, name: true } });
        return { status: 'SUCCEEDED', output: accounts };
      } },
      { key: 'verify_budget', run: async (c) => {
        const st = await this.budgets.state(c.organizationId);
        if (st.monthlyLimitMinor === null) return { status: 'SUCCEEDED', note: 'No monthly budget set — campaigns can be drafted but not launched by automation', output: { monthlyLimit: null } };
        return { status: 'SUCCEEDED', output: { monthlyLimit: fromMinor(st.monthlyLimitMinor), spent: fromMinor(st.spentThisMonthMinor) } };
      } },
      { key: 'build_structure', critical: true, run: async (c) => ({ status: 'SUCCEEDED', output: await this.campaigns.fromStrategy(c.organizationId, String(c.input.requestedBy), String(c.input.strategyId)) }) },
      { key: 'generate_creatives', run: async (c) => {
        const created = (c.outputs.build_structure as { created: string[] }).created;
        const camps = await this.prisma.campaign.findMany({ where: { id: { in: created }, provider: { not: 'APPLE_ADS' } } });
        for (const camp of camps) await this.creatives.generate(c.organizationId, String(c.input.requestedBy), { applicationId: camp.applicationId, campaignId: camp.id, channel: camp.provider, types: camp.provider === 'GOOGLE_ADS' ? ['HEADLINE', 'DESCRIPTION'] : ['AD_COPY', 'VIDEO_SCRIPT'], variantsPerType: 3 });
        return camps.length ? { status: 'SUCCEEDED', output: { campaigns: camps.length } } : { status: 'SKIPPED', note: 'Apple Ads uses the App Store listing' };
      } },
      { key: 'policy_checks', run: async () => ({ status: 'SUCCEEDED', note: 'Generated creatives are policy-checked and require approval before launch' }) },
      { key: 'create_campaigns', run: async (c) => {
        await this.notify.notifyOrg(c.organizationId, { kind: 'approval_needed', title: 'Campaign drafts are ready for review', body: 'Review the drafted campaigns and their creatives, approve them, then launch. Nothing spends until you do.', link: '/campaigns?status=DRAFT', dedupeKey: `creation:${c.executionId}`, permission: 'campaigns.launch' });
        return { status: 'SUCCEEDED', note: 'Platform creation happens at launch, after approval' };
      } },
      { key: 'verify_status', run: async () => ({ status: 'SKIPPED', note: 'Runs at launch' }) },
    ] });

    // ── C: campaign monitoring ──
    this.engine.register({ key: 'campaign_monitoring', steps: [
      { key: 'sync_metrics', run: async (c) => {
        const accounts = await this.prisma.connectedAccount.findMany({ where: { organizationId: c.organizationId, deletedAt: null, status: 'CONNECTED', campaigns: { some: { externalCampaignId: { not: null } } } } });
        const out: Record<string, unknown> = {};
        for (const a of accounts) { try { out[a.name] = await this.sync.syncAccount(a.id); } catch (e) { out[a.name] = { error: (e as Error).message.slice(0, 200) }; } }
        return accounts.length ? { status: 'SUCCEEDED', output: out } : { status: 'SKIPPED', note: 'No connected ad accounts with campaigns' };
      } },
      { key: 'sync_spend', run: async (c) => {
        const sources = await this.prisma.attributionSource.findMany({ where: { organizationId: c.organizationId, secretEnc: { not: null } } });
        const out: Record<string, unknown> = {};
        for (const s of sources) { try { out[s.provider] = await this.attribution.pull(s.id); } catch (e) { out[s.provider] = { error: (e as Error).message.slice(0, 200) }; } }
        return { status: sources.length ? 'SUCCEEDED' : 'SKIPPED', output: out, note: 'Attribution pulls (spend comes with metrics)' };
      } },
      { key: 'compute_kpis', run: async (c) => ({ status: 'SUCCEEDED', output: await this.analytics.rollupOrg(c.organizationId, 7) }) },
      { key: 'detect_anomalies', run: async (c) => ({ status: 'SUCCEEDED', output: await this.detect(c.organizationId) }) },
      { key: 'apply_actions', run: async (c) => ({ status: 'SUCCEEDED', output: await this.act(c, (c.outputs.detect_anomalies as Anomaly[]) ?? []) }) },
      { key: 'alerts', run: async (c) => ({ status: 'SUCCEEDED', output: await this.alerts(c.organizationId, (c.outputs.detect_anomalies as Anomaly[]) ?? []) }) },
    ] });

    // ── D: budget optimisation (agent proposes; BudgetEngine applies within policy) ──
    this.engine.register({ key: 'budget_optimization', steps: [
      { key: 'load_campaigns', run: async (c) => {
        const n = await this.prisma.campaign.count({ where: { organizationId: c.organizationId, status: { in: ['ACTIVE', 'PAUSED'] }, deletedAt: null } });
        return { status: n ? 'SUCCEEDED' : 'SKIPPED', output: { campaigns: n } };
      } },
      { key: 'compute_spend', run: async (c) => { const st = await this.budgets.state(c.organizationId); return { status: 'SUCCEEDED', output: { spent: fromMinor(st.spentThisMonthMinor), limit: fromMinor(st.monthlyLimitMinor) } }; } },
      { key: 'evaluate', run: async (c) => {
        if (!(c.outputs.load_campaigns as { campaigns: number } | undefined)?.campaigns) return { status: 'SKIPPED', note: 'No live campaigns' };
        const r = await this.orch.runNow(c.organizationId, 'budget_optimization', {}, { trigger: 'schedule', workflowExecutionId: c.executionId });
        return { status: 'SUCCEEDED', output: (r.output as { _saved?: unknown })?._saved ?? r.status };
      } },
      { key: 'reallocate', run: async () => ({ status: 'SUCCEEDED', note: 'Applied by the budget engine under policy' }) },
      { key: 'record', run: async () => ({ status: 'SUCCEEDED', note: 'Decisions recorded in optimization_decisions' }) },
    ] });

    // ── E: daily reporting ──
    this.engine.register({ key: 'daily_reporting', steps: [
      { key: 'compute', run: async (c) => {
        const hasData = await this.prisma.analyticsDaily.count({ where: { organizationId: c.organizationId, date: { gte: daysAgo(2) } } }) + await this.prisma.campaign.count({ where: { organizationId: c.organizationId, status: 'ACTIVE' } });
        if (!hasData) return { status: 'SKIPPED', note: 'No activity to report' };
        const r = await this.reports.request(c.organizationId, null, 'daily');
        return { status: 'SUCCEEDED', output: { reportId: r.id } };
      } },
      { key: 'narrate', run: async (c) => { const id = (c.outputs.compute as { reportId?: string })?.reportId; if (!id) return { status: 'SKIPPED' }; await this.reports.build(id); return { status: 'SUCCEEDED' }; } },
      { key: 'render', run: async () => ({ status: 'SUCCEEDED', note: 'PDF and CSV rendered with the narrative' }) },
      { key: 'deliver', run: async (c) => { const id = (c.outputs.compute as { reportId?: string })?.reportId; if (!id) return { status: 'SKIPPED' }; await this.reports.deliver(id); return { status: 'SUCCEEDED' }; } },
    ] });

    // ── F: monthly growth planning ──
    this.engine.register({ key: 'monthly_planning', steps: [
      { key: 'review', run: async (c) => {
        await this.analytics.rollupOrg(c.organizationId, 40);
        const r = await this.reports.request(c.organizationId, null, 'monthly');
        await this.reports.build(r.id); await this.reports.deliver(r.id);
        return { status: 'SUCCEEDED', output: { reportId: r.id } };
      } },
      { key: 'forecast', run: async (c) => { const r = await this.orch.runNow(c.organizationId, 'analytics', {}, { trigger: 'schedule', workflowExecutionId: c.executionId }); return { status: 'SUCCEEDED', output: r.status }; } },
      { key: 'plan', run: async (c) => {
        const apps = await this.prisma.application.findMany({ where: { organizationId: c.organizationId, deletedAt: null, status: 'active' } });
        const month = new Date().toISOString().slice(0, 7);
        for (const a of apps) await this.orch.runNow(c.organizationId, 'campaign_strategy', { applicationId: a.id, params: { month } }, { trigger: 'schedule', workflowExecutionId: c.executionId });
        return { status: apps.length ? 'SUCCEEDED' : 'SKIPPED', output: { apps: apps.length, month } };
      } },
      { key: 'notify', run: async (c) => ({ status: 'SUCCEEDED', output: await this.notify.notifyOrg(c.organizationId, { kind: 'approval_needed', title: 'This month’s growth plans are ready', body: 'Last month’s report and a proposed plan for each app are ready for approval.', link: '/insights', dedupeKey: `monthly:${new Date().toISOString().slice(0, 7)}`, permission: 'campaigns.launch' }) }) },
    ] });

    // ── G: integration health ──
    this.engine.register({ key: 'integration_health', steps: [
      { key: 'check_tokens', run: async (c) => {
        const soon = await this.prisma.connectedAccount.findMany({ where: { organizationId: c.organizationId, deletedAt: null, status: 'CONNECTED', tokenExpiresAt: { lt: new Date(Date.now() + 7 * DAY) }, providerKey: { in: ['meta_ads'] } } });
        for (const a of soon) await this.notify.notifyOrg(c.organizationId, { kind: 'integration_expiring', severity: 'warning', title: `Meta account “${a.name}” access expires soon`, body: `Reconnect before ${a.tokenExpiresAt?.toISOString().slice(0, 10)} to keep syncing and automation running.`, link: '/integrations', dedupeKey: `expiring:${a.id}:${a.tokenExpiresAt?.toISOString().slice(0, 10)}`, permission: 'integrations.manage' });
        return { status: 'SUCCEEDED', output: { expiringSoon: soon.length } };
      } },
      { key: 'probe_apis', run: async (c) => {
        const accounts = await this.prisma.connectedAccount.findMany({ where: { organizationId: c.organizationId, deletedAt: null, status: 'CONNECTED', providerKey: { in: ['google_ads', 'meta_ads', 'tiktok_ads', 'apple_ads'] } } });
        const out: Record<string, string> = {};
        for (const a of accounts) { try { await this.integrations.refreshPermissions(a.id); out[a.name] = 'ok'; } catch (e) { await this.integrations.handleProviderError(a.id, e, 'health_probe'); out[a.name] = (e as Error).message.slice(0, 120); } }
        return { status: accounts.length ? 'SUCCEEDED' : 'SKIPPED', output: out };
      } },
      { key: 'disable_unsafe', run: async (c) => {
        // Campaigns whose account can no longer be managed must not be touched by automation.
        const r = await this.prisma.campaign.updateMany({ where: { organizationId: c.organizationId, automationEnabled: true, account: { status: { not: 'CONNECTED' } } }, data: { automationEnabled: false, statusReason: 'Automation paused: ad account needs reconnecting' } });
        return { status: 'SUCCEEDED', output: { campaignsDisabled: r.count } };
      } },
      { key: 'notify', run: async (c) => {
        const bad = await this.prisma.attributionSource.findMany({ where: { organizationId: c.organizationId, status: 'ERROR' } });
        for (const s of bad) await this.notify.notifyOrg(c.organizationId, { kind: 'tracking_failure', severity: 'warning', title: `${s.provider} attribution sync is failing`, body: s.statusDetail || 'Check the credentials in the app’s attribution settings.', link: '/integrations', dedupeKey: `attr:${s.id}:${new Date().toISOString().slice(0, 10)}`, permission: 'integrations.read' });
        return { status: 'SUCCEEDED', output: { failingSources: bad.length } };
      } },
    ] });
  }

  /** Rule-based anomaly detection over the last 3 days (no LLM involved). */
  async detect(orgId: string): Promise<Anomaly[]> {
    const [policy, active, attributionSources] = await Promise.all([this.budgets.policy(orgId), this.prisma.campaign.findMany({ where: { organizationId: orgId, status: 'ACTIVE', deletedAt: null } }), this.prisma.attributionSource.count({ where: { organizationId: orgId, status: 'CONNECTED' } })]);
    const mult = Number((await this.prisma.automationPolicy.findUnique({ where: { organizationId: orgId } }))?.autoPauseOnCpiMultiple ?? 2);
    const out: Anomaly[] = [];
    for (const c of active) {
      const m = await this.prisma.campaignMetric.groupBy({ by: ['date'], where: { campaignId: c.id, date: { gte: daysAgo(3) } }, _sum: { impressions: true, installs: true, spendMinor: true }, orderBy: { date: 'asc' } });
      const spend = m.reduce((s, x) => s + (x._sum.spendMinor ?? 0n), 0n); const installs = m.reduce((s, x) => s + (x._sum.installs ?? 0), 0);
      const live = Date.now() - c.updatedAt.getTime() > 2 * DAY; // give new launches 2 days to deliver
      if (live && m.length >= 2 && m.every((x) => (x._sum.impressions ?? 0n) === 0n)) out.push({ campaignId: c.id, name: c.name, kind: 'inactive', detail: 'No impressions for 2+ days', pause: false });
      if (c.targetCpiMinor && installs >= 10) {
        const cpi = cpiMinor(spend, installs)!;
        if (cpi * 100n > c.targetCpiMinor * BigInt(Math.round(mult * 100))) out.push({ campaignId: c.id, name: c.name, kind: 'cpi_breach', detail: `3-day CPI ${fromMinor(cpi)} is over ${mult}× the target ${fromMinor(c.targetCpiMinor)}`, pause: true });
      }
      const wasteLimit = c.targetCpiMinor ? c.targetCpiMinor * 3n : c.dailyBudgetMinor;
      if (live && installs === 0 && spend > wasteLimit) out.push({ campaignId: c.id, name: c.name, kind: 'spend_no_installs', detail: `Spent ${fromMinor(spend)} with no installs in 3 days`, pause: true });
      const today = m.find((x) => x.date.getTime() === daysAgo(0).getTime());
      if (today && (today._sum.spendMinor ?? 0n) * 10n > c.dailyBudgetMinor * 15n) out.push({ campaignId: c.id, name: c.name, kind: 'overspend', detail: `Today’s spend ${fromMinor(today._sum.spendMinor ?? 0n)} exceeds 1.5× the daily budget`, pause: false });
      if (attributionSources && installs >= 20) {
        const attributed = await this.prisma.installEvent.count({ where: { campaignId: c.id, installedAt: { gte: daysAgo(3) } } });
        if (attributed === 0 && c.platform === 'ANDROID') out.push({ campaignId: c.id, name: c.name, kind: 'tracking_failure', detail: `${installs} platform-reported installs but none attributed — check the MMP/campaign mapping`, pause: false });
      }
    }
    void policy;
    return out;
  }

  /** Executes only safety actions the policy permits; everything else becomes a proposal. */
  private async act(c: StepCtx, anomalies: Anomaly[]) {
    const orgId = c.organizationId;
    const [org, policy, st] = await Promise.all([this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } }), this.budgets.policy(orgId), this.budgets.state(orgId)]);
    const results: string[] = [];
    if (!org.automationEnabled) return ['Automation stopped — no actions taken'];
    // Hard stop: monthly budget (after reserve) exhausted → pause everything. This is the customer's limit, not optimisation.
    const spendable = spendableThisMonth(policy, st);
    if (spendable !== null && st.spentThisMonthMinor >= spendable) {
      for (const camp of await this.prisma.campaign.findMany({ where: { organizationId: orgId, status: 'ACTIVE', automationEnabled: true } })) {
        await this.prisma.optimizationDecision.create({ data: { organizationId: orgId, campaignId: camp.id, agentKey: 'monitoring', kind: 'pause', before: { status: 'ACTIVE' }, after: { status: 'PAUSED' }, rationale: 'Monthly budget (after reserve) is used up', outcome: 'executed' } });
        try { await this.campaigns.queueAction(orgId, 'agent:monitoring', camp.id, 'pause', { reason: 'Monthly budget used up' }, `budget-exhausted:${camp.id}:${monthOf().toISOString().slice(0, 7)}`); results.push(`paused ${camp.name} (budget exhausted)`); } catch (e) { results.push(`${camp.name}: ${(e as Error).message}`); }
      }
      return results;
    }
    const canPause = policy.autonomyLevel !== 'RECOMMENDATION';
    for (const a of anomalies.filter((x) => x.pause)) {
      const camp = await this.prisma.campaign.findUniqueOrThrow({ where: { id: a.campaignId } });
      const execute = canPause && camp.automationEnabled;
      await this.prisma.optimizationDecision.create({ data: { organizationId: orgId, campaignId: a.campaignId, agentKey: 'monitoring', executionId: null, kind: 'pause', before: { status: 'ACTIVE' }, after: { status: 'PAUSED' }, rationale: a.detail, outcome: execute ? 'executed' : 'proposed' } });
      if (execute) {
        try { await this.campaigns.queueAction(orgId, 'agent:monitoring', a.campaignId, 'pause', { reason: a.detail }, `monitor:${a.kind}:${a.campaignId}:${daysAgo(0).toISOString().slice(0, 10)}`); results.push(`paused ${a.name}: ${a.detail}`); }
        catch (e) { results.push(`${a.name}: ${(e as Error).message}`); }
      } else results.push(`proposed pausing ${a.name}`);
    }
    return results;
  }

  private async alerts(orgId: string, anomalies: Anomaly[]) {
    const sent: string[] = [];
    for (const a of anomalies) {
      const kind = a.kind === 'cpi_breach' ? 'cpi_above_target' : a.kind === 'inactive' ? 'campaign_inactive' : a.kind === 'overspend' || a.kind === 'spend_no_installs' ? 'unusual_spend' : 'tracking_failure';
      await this.notify.notifyOrg(orgId, { kind, severity: a.pause ? 'critical' : 'warning', title: `${a.name}: ${a.kind.replace(/_/g, ' ')}`, body: a.detail, link: `/campaigns/${a.campaignId}`, dedupeKey: `anomaly:${a.kind}:${a.campaignId}:${daysAgo(0).toISOString().slice(0, 10)}`, permission: 'campaigns.read' });
      sent.push(a.kind);
    }
    // Budget thresholds (each threshold once per month)
    const budget = await this.prisma.organizationBudget.findUnique({ where: { organizationId_month: { organizationId: orgId, month: monthOf() } } });
    if (budget) {
      const st = await this.budgets.state(orgId);
      const pct = Number((st.spentThisMonthMinor * 100n) / budget.monthlyLimitMinor);
      for (const t of budget.alertThresholds.filter((t) => pct >= t && !budget.alertsSent.includes(t))) {
        await this.notify.notifyOrg(orgId, { kind: 'budget_threshold', severity: t >= 90 ? 'critical' : 'warning', title: `${t}% of this month’s ad budget used`, body: `${fromMinor(st.spentThisMonthMinor)} of ${fromMinor(budget.monthlyLimitMinor)} ${budget.currency} spent.`, link: '/budgets', dedupeKey: `budget:${budget.id}:${t}`, permission: 'budgets.read' });
        await this.prisma.organizationBudget.update({ where: { id: budget.id }, data: { alertsSent: { push: t } } });
        sent.push(`budget_${t}`);
      }
    }
    // Install target risk (from day 10)
    const now = new Date();
    if (now.getUTCDate() >= 10) {
      for (const app of await this.prisma.application.findMany({ where: { organizationId: orgId, deletedAt: null, status: 'active' }, include: { targets: { where: { month: monthOf() } } } })) {
        const target = app.targets[0]?.installs ?? app.monthlyInstallTarget;
        const [mtd, recent] = await Promise.all([
          this.prisma.analyticsDaily.aggregate({ where: { applicationId: app.id, date: { gte: monthOf() } }, _sum: { firstInstalls: true, aggregateAttributedInstalls: true, spendMinor: true } }),
          this.prisma.analyticsDaily.aggregate({ where: { applicationId: app.id, date: { gte: daysAgo(7) } }, _sum: { firstInstalls: true, aggregateAttributedInstalls: true, spendMinor: true } }),
        ]);
        const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
        const f = forecastMonth({ daysElapsed: now.getUTCDate(), daysInMonth, installsToDate: (mtd._sum.firstInstalls ?? 0) + (mtd._sum.aggregateAttributedInstalls ?? 0), spendToDateMinor: mtd._sum.spendMinor ?? 0n, recentInstalls: (recent._sum.firstInstalls ?? 0) + (recent._sum.aggregateAttributedInstalls ?? 0), recentSpendMinor: recent._sum.spendMinor ?? 0n, recentDays: 7, remainingBudgetMinor: null, target });
        if (target > 0 && f.expected < target * 0.8) {
          await this.notify.notifyOrg(orgId, { kind: 'target_risk', severity: 'warning', title: `${app.name} is tracking below its install target`, body: `Forecast ${f.expected.toLocaleString('en-IN')} vs target ${target.toLocaleString('en-IN')} this month (${f.confidence} confidence).`, link: '/budgets', dedupeKey: `target:${app.id}:${monthOf().toISOString().slice(0, 7)}:${Math.floor(now.getUTCDate() / 7)}`, permission: 'apps.read' });
          sent.push(`target_risk:${app.name}`);
        }
      }
    }
    return sent;
  }
}
