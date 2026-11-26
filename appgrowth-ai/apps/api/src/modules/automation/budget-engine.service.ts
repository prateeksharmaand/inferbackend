import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { AppError, notFound } from '../../common/errors';
import { fromMinor } from '../../common/money';
import { PrismaService } from '../../common/prisma.service';
import { checkChange } from '../../common/spend-policy';
import { AgentResponse } from '../ai/ai-client';
import { majorToMinorSafe, Orchestrator } from '../ai/orchestrator.service';
import { BudgetsService } from '../budgets/budgets.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { NotificationsService } from '../notifications/notifications.service';

interface Decision { campaign_id: string; kind: 'increase' | 'decrease' | 'pause' | 'resume' | 'hold'; new_daily_budget: number | null; rationale: string; confidence: number }
const COST_REDUCING = new Set(['decrease', 'pause']);

/**
 * Budget Optimization engine. Turns agent proposals into recorded OptimizationDecisions and executes only what the
 * organization's autonomy level and hard spending limits allow:
 *  - RECOMMENDATION: everything is proposed for a person to approve.
 *  - APPROVED_AUTOMATION: cost-reducing changes (decrease, pause) execute; increases/resumes wait for approval.
 *  - AUTONOMOUS: anything within the hard limits executes.
 * Every decision (executed, proposed, blocked, failed) is stored with before/after and rationale.
 */
@Injectable()
export class BudgetEngine implements OnModuleInit {
  private log = new Logger('BudgetEngine');
  constructor(private prisma: PrismaService, private orch: Orchestrator, private budgets: BudgetsService, private campaigns: CampaignsService, private audit: AuditService, private notify: NotificationsService) {}

  onModuleInit() { this.orch.registerPersister('budget_optimization', (orgId, execId, _i, r) => this.apply(orgId, execId, r)); }

  async apply(orgId: string, executionId: string, r: AgentResponse) {
    const decisions = (Array.isArray(r.output.decisions) ? r.output.decisions : []) as Decision[];
    const [org, policy, def] = await Promise.all([this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } }), this.budgets.policy(orgId), this.prisma.aiAgentDefinition.findUnique({ where: { key: 'budget_optimization' } })]);
    const counts = { executed: 0, proposed: 0, blocked: 0, failed: 0, ignored: 0 };
    for (const d of decisions) {
      const c = await this.prisma.campaign.findFirst({ where: { id: d.campaign_id, organizationId: orgId, deletedAt: null, status: { in: ['ACTIVE', 'PAUSED'] } } });
      if (!c || d.kind === 'hold') { counts.ignored++; continue; }
      const newDaily = d.kind === 'increase' || d.kind === 'decrease' ? majorToMinorSafe(d.new_daily_budget) : null;
      if ((d.kind === 'increase' || d.kind === 'decrease') && (!newDaily || (d.kind === 'increase' ? newDaily <= c.dailyBudgetMinor : newDaily >= c.dailyBudgetMinor))) { counts.ignored++; continue; }
      if ((d.kind === 'pause' && c.status !== 'ACTIVE') || (d.kind === 'resume' && c.status !== 'PAUSED')) { counts.ignored++; continue; }
      const before = { status: c.status, dailyBudget: fromMinor(c.dailyBudgetMinor) };
      const after = d.kind === 'pause' ? { status: 'PAUSED' } : d.kind === 'resume' ? { status: 'ACTIVE' } : { dailyBudget: fromMinor(newDaily) };
      let outcome: 'executed' | 'proposed' | 'blocked' | 'failed'; let blockedReason: string | null = null;
      const automationOn = org.automationEnabled && c.automationEnabled && !def?.manualReview;
      const autoAllowed = automationOn && (policy.autonomyLevel === 'AUTONOMOUS' || (policy.autonomyLevel === 'APPROVED_AUTOMATION' && COST_REDUCING.has(d.kind)));
      if (d.kind !== 'pause') {
        const v = checkChange(policy, await this.budgets.state(orgId, c.id), { actor: 'agent', provider: c.provider, currentDailyMinor: c.status === 'ACTIVE' ? c.dailyBudgetMinor : null, newDailyMinor: newDaily ?? c.dailyBudgetMinor, activating: d.kind === 'resume' });
        if (!v.allowed && !v.requiresApproval) { outcome = 'blocked'; blockedReason = v.reason; }
        else if (!v.allowed) { outcome = 'proposed'; blockedReason = v.reason; }
        else outcome = autoAllowed ? 'executed' : 'proposed';
      } else outcome = autoAllowed ? 'executed' : 'proposed';
      const dec = await this.prisma.optimizationDecision.create({ data: { organizationId: orgId, campaignId: c.id, agentKey: 'budget_optimization', executionId, kind: d.kind, before, after, rationale: String(d.rationale ?? '').slice(0, 2000), outcome, blockedReason } });
      if (outcome === 'executed') {
        try { await this.execute(orgId, dec.id, 'agent:budget_optimization'); }
        catch (e) { outcome = 'failed'; await this.prisma.optimizationDecision.update({ where: { id: dec.id }, data: { outcome: 'failed', blockedReason: (e as Error).message.slice(0, 500) } }); }
      }
      counts[outcome]++;
    }
    if (counts.proposed) await this.notify.notifyOrg(orgId, { kind: 'approval_needed', title: `${counts.proposed} budget change${counts.proposed > 1 ? 's' : ''} need your approval`, body: 'The Budget Optimization agent proposed changes that your autonomy level or limits require a person to approve.', link: '/automation', dedupeKey: `opt:${executionId}`, permission: 'campaigns.launch' });
    return counts;
  }

  /** Executes a decision through the campaign executor (policy re-checked there). */
  private async execute(orgId: string, decisionId: string, actor: string) {
    const d = await this.prisma.optimizationDecision.findUniqueOrThrow({ where: { id: decisionId } });
    const after = d.after as { dailyBudget?: string; status?: string };
    const key = `opt:${d.id}`;
    if (d.kind === 'pause') return this.campaigns.queueAction(orgId, actor, d.campaignId!, 'pause', { reason: `Optimization: ${d.rationale.slice(0, 200)}` }, key);
    if (d.kind === 'resume') return this.campaigns.queueAction(orgId, actor, d.campaignId!, 'resume', {}, key);
    const minor = majorToMinorSafe(Number(after.dailyBudget));
    if (!minor) throw new AppError('Invalid budget in decision', 400, 'invalid_decision');
    return this.campaigns.setBudget(orgId, actor, d.campaignId!, minor, `Optimization: ${d.rationale.slice(0, 200)}`, key);
  }

  async decide(orgId: string, userId: string, id: string, approve: boolean) {
    const d = await this.prisma.optimizationDecision.findFirst({ where: { id, organizationId: orgId } });
    if (!d) throw notFound('Decision');
    if (d.outcome !== 'proposed') throw new AppError(`This decision was already ${d.outcome}`, 409, 'already_decided');
    if (approve) {
      await this.execute(orgId, id, `user:${userId}`); // throws with the policy reason if limits still block it
      await this.prisma.optimizationDecision.update({ where: { id }, data: { outcome: 'executed', approvedById: userId } });
    } else {
      await this.prisma.optimizationDecision.update({ where: { id }, data: { outcome: 'rejected', approvedById: userId } });
    }
    await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: approve ? 'optimization.approved' : 'optimization.rejected', entityType: 'optimization_decision', entityId: id });
    return { id, outcome: approve ? 'executed' : 'rejected' };
  }

  list(orgId: string, userId: string, outcome?: string) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const rows = await tx.optimizationDecision.findMany({ where: { organizationId: orgId, ...(outcome ? { outcome } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
      const names = new Map((await tx.campaign.findMany({ where: { id: { in: rows.map((r) => r.campaignId).filter((x): x is string => !!x) } }, select: { id: true, name: true, provider: true } })).map((c) => [c.id, c]));
      return rows.map((r) => ({ ...r, campaign: r.campaignId ? names.get(r.campaignId) ?? null : null })) as (Prisma.OptimizationDecisionGetPayload<object> & { campaign: unknown })[];
    });
  }
}
