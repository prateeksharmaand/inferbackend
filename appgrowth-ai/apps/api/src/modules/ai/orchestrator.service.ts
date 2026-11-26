import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { AppError, notFound } from '../../common/errors';
import { toMinor } from '../../common/money';
import { PrismaService } from '../../common/prisma.service';
import { QUEUES, queue } from '../../queues/queues';
import { monthOf } from '../budgets/budgets.service';
import { AiClient, AgentResponse } from './ai-client';
import { AiConfigService } from './ai-config.service';
import { ToolCtx, ToolRegistry } from './tools';

export const LLM_AGENTS = ['market_research', 'aso', 'creative', 'campaign_strategy', 'budget_optimization', 'analytics', 'growth', 'retention', 'reporting'] as const;
export type AgentKey = (typeof LLM_AGENTS)[number];
const CONTEXT_KEY: Record<string, string> = {
  'app.get_profile': 'app', 'store.get_listing': 'store_listings', 'analytics.get_summary': 'performance', 'analytics.get_campaign_daily': 'campaigns_daily',
  'analytics.get_retention': 'retention', 'budget.get_status': 'budget', 'campaign.list': 'campaigns',
};
export interface RunInput { applicationId?: string; campaignId?: string; platform?: 'ANDROID' | 'IOS'; params?: Record<string, unknown>; instructions?: string }
export type Persister = (orgId: string, executionId: string, input: RunInput, res: AgentResponse) => Promise<Record<string, unknown> | void>;

const asJson = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))) as Prisma.InputJsonValue;

/**
 * Central AI orchestrator. Maintains organization / application / campaign / budget context, execution history, tool
 * permissions and decision logs for every agent run. LLMs only ever receive data gathered by registered tools and
 * return structured proposals; persistence and any change to spend happen here and in the BudgetEngine.
 */
@Injectable()
export class Orchestrator {
  private log = new Logger('Orchestrator');
  private persisters = new Map<string, Persister>();
  constructor(private prisma: PrismaService, private ai: AiClient, private config: AiConfigService, private tools: ToolRegistry, private audit: AuditService) {}

  registerPersister(agent: string, fn: Persister) { this.persisters.set(agent, fn); }

  /** Queues an agent run for the worker. Returns the execution id the client can poll. */
  async enqueue(orgId: string, agentKey: AgentKey, input: RunInput, meta: { trigger: 'manual' | 'schedule' | 'workflow'; requestedById?: string; workflowExecutionId?: string }) {
    const def = await this.prisma.aiAgentDefinition.findUnique({ where: { key: agentKey } });
    if (!def) throw notFound('Agent');
    if (!def.enabled) throw new AppError(`${def.name} is disabled by the platform administrator`, 409, 'agent_disabled');
    await this.assertQuota(orgId);
    const exec = await this.prisma.aiAgentExecution.create({
      data: { organizationId: orgId, agentKey, applicationId: input.applicationId, campaignId: input.campaignId, workflowExecutionId: meta.workflowExecutionId, trigger: meta.trigger, input: asJson(input), requestedById: meta.requestedById },
    });
    await queue(QUEUES.agents).add(agentKey, { executionId: exec.id, organizationId: orgId }, { jobId: exec.id, attempts: def.maxRetries + 1 });
    return exec;
  }

  /** Runs inline (used by workflow steps that are already inside a background job). */
  async runNow(orgId: string, agentKey: AgentKey, input: RunInput, meta: { trigger: 'workflow' | 'schedule' | 'manual'; workflowExecutionId?: string; requestedById?: string }) {
    const exec = await this.prisma.aiAgentExecution.create({ data: { organizationId: orgId, agentKey, applicationId: input.applicationId, campaignId: input.campaignId, workflowExecutionId: meta.workflowExecutionId, trigger: meta.trigger, input: asJson(input), requestedById: meta.requestedById } });
    return this.execute(exec.id);
  }

  async cancel(orgId: string, executionId: string, userId: string) {
    const r = await this.prisma.aiAgentExecution.updateMany({ where: { id: executionId, organizationId: orgId, status: { in: ['QUEUED', 'RUNNING'] } }, data: { status: 'CANCELLED', finishedAt: new Date(), error: 'Cancelled by user' } });
    if (!r.count) throw new AppError('Only queued or running executions can be cancelled', 409, 'not_cancellable');
    await queue(QUEUES.agents).remove(executionId).catch(() => undefined);
    await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'ai.execution_cancelled', entityType: 'ai_execution', entityId: executionId });
  }

  private async assertQuota(orgId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { organizationId: orgId, status: { in: ['ACTIVE', 'TRIALING'] } }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
    if (!sub) throw new AppError('No active subscription', 402, 'subscription_inactive');
    const used = await this.prisma.aiUsage.aggregate({ where: { organizationId: orgId, date: { gte: monthOf() } }, _sum: { inputTokens: true, outputTokens: true } });
    const total = (used._sum.inputTokens ?? 0n) + (used._sum.outputTokens ?? 0n);
    if (total >= sub.plan.aiTokensMonth) throw new AppError(`This month’s AI allowance on the ${sub.plan.name} plan is used up. It resets on the 1st, or upgrade your plan.`, 402, 'ai_quota_exceeded');
  }

  private async logLine(orgId: string, executionId: string, message: string, level = 'info', data?: unknown) {
    await this.prisma.aiExecutionLog.create({ data: { organizationId: orgId, executionId, level, message, data: data === undefined ? undefined : asJson(data) } });
  }

  /** Executes a queued run. Idempotent per execution: finished runs are returned unchanged. */
  async execute(executionId: string): Promise<{ status: string; output: unknown }> {
    const exec = await this.prisma.aiAgentExecution.findUniqueOrThrow({ where: { id: executionId } });
    if (['SUCCEEDED', 'AWAITING_REVIEW', 'CANCELLED'].includes(exec.status)) return { status: exec.status, output: exec.output };
    const def = await this.prisma.aiAgentDefinition.findUniqueOrThrow({ where: { key: exec.agentKey } });
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: exec.organizationId } });
    if (org.status !== 'ACTIVE') {
      await this.prisma.aiAgentExecution.update({ where: { id: exec.id }, data: { status: 'CANCELLED', error: 'Organization is suspended', finishedAt: new Date() } });
      return { status: 'CANCELLED', output: null };
    }
    const input = exec.input as unknown as RunInput;
    await this.prisma.aiAgentExecution.update({ where: { id: exec.id }, data: { status: 'RUNNING', startedAt: exec.startedAt ?? new Date(), attempts: { increment: 1 } } });
    try {
      await this.assertQuota(exec.organizationId);
      const sel = await this.config.select({ agentKey: exec.agentKey });
      const ctx: ToolCtx = { orgId: exec.organizationId, applicationId: input.applicationId, campaignId: input.campaignId, platform: input.platform };
      const context: Record<string, unknown> = { organization: { currency: org.currency, country: org.country, timezone: org.timezone, autonomy: org.autonomyLevel }, today: new Date().toISOString().slice(0, 10) };
      for (const tool of def.tools) {
        if (!CONTEXT_KEY[tool] || (tool === 'app.get_profile' && !input.applicationId) || (tool === 'store.get_listing' && !input.applicationId)) continue;
        context[CONTEXT_KEY[tool]] = await this.tools.call(def, tool, ctx);
      }
      // Execution history: the agent's own previous result for the same subject, so runs build on each other.
      const prev = await this.prisma.aiAgentExecution.findFirst({ where: { organizationId: exec.organizationId, agentKey: exec.agentKey, applicationId: input.applicationId ?? null, status: 'SUCCEEDED', id: { not: exec.id } }, orderBy: { finishedAt: 'desc' }, select: { output: true, finishedAt: true } });
      if (prev) context.previous_run = { finished_at: prev.finishedAt, output: prev.output };
      if (exec.agentKey === 'campaign_strategy' && input.applicationId) {
        const mr = await this.prisma.marketResearch.findFirst({ where: { applicationId: input.applicationId }, orderBy: { createdAt: 'desc' } });
        if (mr) context.market_research = { summary: mr.summary, markets: mr.markets, audiences: mr.audiences, opportunities: mr.opportunities };
      }
      if (input.params) context.request = input.params;
      if (input.platform) context.platform = input.platform;
      await this.logLine(exec.organizationId, exec.id, `Context gathered with ${def.tools.filter((t) => CONTEXT_KEY[t]).length} tools; calling ${sel.provider}${sel.model ? `/${sel.model}` : ''}`);

      const current = await this.prisma.aiAgentExecution.findUniqueOrThrow({ where: { id: exec.id }, select: { status: true } });
      if (current.status === 'CANCELLED') return { status: 'CANCELLED', output: null };
      const res = await this.ai.runAgent(exec.agentKey, sel, context, { timeoutSec: def.timeoutSec, instructions: input.instructions });
      await this.recordUsage(exec.organizationId, res.provider, res.model, res.usage.input_tokens, res.usage.output_tokens, BigInt(res.cost_micros), 0);
      for (const w of res.warnings) await this.logLine(exec.organizationId, exec.id, w, 'warn');

      const after = await this.prisma.aiAgentExecution.findUniqueOrThrow({ where: { id: exec.id }, select: { status: true } });
      if (after.status === 'CANCELLED') { await this.logLine(exec.organizationId, exec.id, 'Cancelled while the model was running; result discarded'); return { status: 'CANCELLED', output: null }; }
      const persister = this.persisters.get(exec.agentKey);
      const saved = persister ? await persister(exec.organizationId, exec.id, input, res) : undefined;
      const output = { ...res.output, _sources: res.sources, _grounded: res.grounded, _warnings: res.warnings, ...(saved ? { _saved: saved } : {}) };
      const status = def.manualReview ? 'AWAITING_REVIEW' : 'SUCCEEDED';
      await this.prisma.aiAgentExecution.update({ where: { id: exec.id }, data: { status, output: asJson(output), provider: res.provider, model: res.model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, costMicros: BigInt(res.cost_micros), finishedAt: new Date(), error: null } });
      await this.logLine(exec.organizationId, exec.id, `Finished in ${res.duration_ms} ms (${res.usage.input_tokens}+${res.usage.output_tokens} tokens)`);
      return { status, output };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const body = e instanceof AppError ? (e.getResponse() as { details?: { retryable?: boolean } }) : undefined;
      const retryable = !!body?.details?.retryable;
      const fresh = await this.prisma.aiAgentExecution.findUniqueOrThrow({ where: { id: exec.id } });
      const final = !retryable || fresh.attempts > def.maxRetries;
      await this.prisma.aiAgentExecution.update({ where: { id: exec.id }, data: { status: final ? 'FAILED' : 'QUEUED', error: msg.slice(0, 2000), ...(final ? { finishedAt: new Date() } : {}) } });
      await this.logLine(exec.organizationId, exec.id, `Attempt ${fresh.attempts} failed: ${msg}`, 'error');
      await this.prisma.errorLog.create({ data: { organizationId: exec.organizationId, service: 'worker', message: `agent ${exec.agentKey}: ${msg}`.slice(0, 2000) } }).catch(() => undefined);
      throw e;
    }
  }

  async recordUsage(orgId: string, provider: string, model: string, input: number, output: number, costMicros: bigint, generations: number) {
    const date = new Date(); const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    await this.prisma.aiUsage.upsert({
      where: { organizationId_date_provider_model: { organizationId: orgId, date: day, provider, model } },
      create: { organizationId: orgId, date: day, provider, model, requests: 1, inputTokens: BigInt(input), outputTokens: BigInt(output), costMicros, generations },
      update: { requests: { increment: 1 }, inputTokens: { increment: BigInt(input) }, outputTokens: { increment: BigInt(output) }, costMicros: { increment: costMicros }, generations: { increment: generations } },
    });
    if (costMicros > 0n) await this.prisma.costRecord.create({ data: { organizationId: orgId, category: 'ai', description: `${provider}/${model}`, amountMicros: costMicros, date: day } });
  }
}

export const majorToMinorSafe = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) || v < 0 ? null : toMinor(v.toFixed(2)));
