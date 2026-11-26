import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import { AppError, notFound } from '../../common/errors';
import { fromMinor } from '../../common/money';
import { paged, skipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { AiClient } from './ai-client';
import { AiConfigService } from './ai-config.service';
import type { AgentUpdateDto, ExecQuery, ModelDto, ProviderUpdateDto } from './dto';

const CRON = /^(\S+\s+){4}\S+$/;

@Injectable()
export class AiService {
  constructor(private prisma: PrismaService, private audit: AuditService, private crypto: CryptoService, private client: AiClient, private config: AiConfigService) {}

  async agents(orgId: string) {
    const defs = await this.prisma.aiAgentDefinition.findMany({ orderBy: { key: 'asc' } });
    const last = await this.prisma.aiAgentExecution.groupBy({ by: ['agentKey'], where: { organizationId: orgId }, _max: { createdAt: true }, _count: true });
    const lm = new Map(last.map((l) => [l.agentKey, l]));
    return defs.map((d) => ({ key: d.key, name: d.name, description: d.description, enabled: d.enabled, schedule: d.schedule, manualReview: d.manualReview, tools: d.tools, lastRunAt: lm.get(d.key)?._max.createdAt ?? null, runs: lm.get(d.key)?._count ?? 0 }));
  }

  async executions(orgId: string | null, q: ExecQuery) {
    const where: Prisma.AiAgentExecutionWhereInput = { ...(orgId ? { organizationId: orgId } : {}), ...(q.agentKey ? { agentKey: q.agentKey } : {}), ...(q.applicationId ? { applicationId: q.applicationId } : {}), ...(q.status ? { status: q.status as never } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.aiAgentExecution.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q), select: { id: true, organizationId: true, agentKey: true, applicationId: true, campaignId: true, trigger: true, status: true, error: true, provider: true, model: true, inputTokens: true, outputTokens: true, costMicros: true, attempts: true, createdAt: true, startedAt: true, finishedAt: true } }),
      this.prisma.aiAgentExecution.count({ where }),
    ]);
    return paged(items, total, q);
  }

  async execution(orgId: string | null, id: string) {
    const e = await this.prisma.aiAgentExecution.findFirst({ where: { id, ...(orgId ? { organizationId: orgId } : {}) }, include: { logs: { orderBy: { createdAt: 'asc' } } } });
    if (!e) throw notFound('Execution');
    return e;
  }

  async review(orgId: string, id: string, userId: string) {
    const r = await this.prisma.aiAgentExecution.updateMany({ where: { id, organizationId: orgId, status: 'AWAITING_REVIEW' }, data: { status: 'SUCCEEDED', reviewedById: userId } });
    if (!r.count) throw new AppError('This execution is not awaiting review', 409, 'not_reviewable');
    await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'ai.execution_reviewed', entityType: 'ai_execution', entityId: id });
  }

  /** Research, ASO and strategy for an app (Insights page). */
  async insights(orgId: string, userId: string, appId: string) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const app = await tx.application.findFirst({ where: { id: appId, organizationId: orgId, deletedAt: null }, select: { id: true, name: true, currency: true, platforms: { select: { platform: true } } } });
      if (!app) throw notFound('Application');
      const [research, competitors, keywords, audiences, aso, strategies] = await Promise.all([
        tx.marketResearch.findFirst({ where: { applicationId: appId }, orderBy: { createdAt: 'desc' } }),
        tx.competitor.findMany({ where: { applicationId: appId }, include: { apps: true }, orderBy: { createdAt: 'asc' } }),
        tx.keywordResearch.findMany({ where: { applicationId: appId }, orderBy: { relevance: 'desc' }, take: 60 }),
        tx.audienceSegment.findMany({ where: { applicationId: appId }, orderBy: { createdAt: 'asc' } }),
        Promise.all(app.platforms.map((p) => tx.asoAudit.findFirst({ where: { applicationId: appId, platform: p.platform }, orderBy: { createdAt: 'desc' } }))),
        tx.marketingStrategy.findMany({ where: { applicationId: appId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      ]);
      return {
        app, research, competitors, audiences, aso: aso.filter(Boolean),
        keywords: keywords.map((k) => ({ ...k, relevance: Number(k.relevance) })),
        strategies: strategies.map((s) => ({ ...s, estimatedCpi: fromMinor(s.estimatedCpiMinor), estimatedBudget: fromMinor(s.estimatedBudgetMinor), estimatedCpiMinor: undefined, estimatedBudgetMinor: undefined })),
      };
    });
  }

  async decideStrategy(orgId: string, userId: string, id: string, approve: boolean, comment?: string) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const s = await tx.marketingStrategy.findFirst({ where: { id, organizationId: orgId } });
      if (!s) throw notFound('Strategy');
      if (s.status !== 'PENDING') throw new AppError(`This strategy was already ${s.status.toLowerCase()}`, 409, 'already_decided');
      if (approve) await tx.marketingStrategy.updateMany({ where: { applicationId: s.applicationId, status: 'APPROVED' }, data: { status: 'REJECTED' } }); // one approved plan per app
      const u = await tx.marketingStrategy.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: userId, decidedAt: new Date() } });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: approve ? 'strategy.approved' : 'strategy.rejected', entityType: 'strategy', entityId: id, after: { comment } }, tx);
      return { id: u.id, status: u.status };
    });
  }

  // ── Super Admin: providers, models, agents ──
  async providers() {
    const ps = await this.prisma.aiProvider.findMany({ include: { models: { orderBy: { modelId: 'asc' } } }, orderBy: { key: 'asc' } });
    const envKey: Record<string, string> = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', ollama: 'OLLAMA_BASE_URL' };
    return ps.map((p) => ({ ...p, apiKeyEnc: undefined, hasStoredKey: !!p.apiKeyEnc, envVar: envKey[p.key], models: p.models.map((m) => ({ ...m, inputCostPerMTok: Number(m.inputCostPerMTok), outputCostPerMTok: Number(m.outputCostPerMTok), unitCost: Number(m.unitCost) })) }));
  }

  async updateProvider(key: string, dto: ProviderUpdateDto, actorId: string) {
    const p = await this.prisma.aiProvider.findUnique({ where: { key } });
    if (!p) throw notFound('Provider');
    await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.aiProvider.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      await tx.aiProvider.update({ where: { key }, data: { enabled: dto.enabled, isDefault: dto.isDefault, baseUrl: dto.baseUrl, ...(dto.apiKey !== undefined ? { apiKeyEnc: dto.apiKey ? this.crypto.encrypt(dto.apiKey) : null } : {}) } });
    });
    await this.audit.record({ actorUserId: actorId, actor: `user:${actorId}`, action: 'admin.ai_provider_updated', entityType: 'ai_provider', entityId: key, after: { ...dto, apiKey: dto.apiKey === undefined ? undefined : dto.apiKey ? 'set' : 'cleared' }, security: dto.apiKey !== undefined });
    return (await this.providers()).find((x) => x.key === key);
  }

  async upsertModel(key: string, dto: ModelDto, actorId: string) {
    const p = await this.prisma.aiProvider.findUnique({ where: { key } });
    if (!p) throw notFound('Provider');
    const m = await this.prisma.aiModel.upsert({ where: { providerId_modelId: { providerId: p.id, modelId: dto.modelId } }, create: { providerId: p.id, ...dto }, update: dto });
    await this.audit.record({ actorUserId: actorId, actor: `user:${actorId}`, action: 'admin.ai_model_saved', entityType: 'ai_model', entityId: m.id, after: dto });
    return m;
  }

  async checkProvider(key: string) {
    const p = await this.prisma.aiProvider.findUnique({ where: { key }, include: { models: { where: { purpose: 'text', enabled: true } } } });
    if (!p) throw notFound('Provider');
    try {
      const r = await this.client.check({ provider: key, model: p.models[0]?.modelId ?? null, apiKey: p.apiKeyEnc ? this.crypto.decrypt(p.apiKeyEnc) : null, baseUrl: p.key === 'ollama' ? p.baseUrl : null, prices: { input_per_mtok: 0, output_per_mtok: 0, per_unit: 0 } });
      return { ok: r.ok, model: r.model };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async updateAgent(key: string, dto: AgentUpdateDto, actorId: string) {
    if (dto.schedule && !CRON.test(dto.schedule.trim())) throw new AppError('Schedule must be a 5-field cron expression (UTC)', 400, 'invalid_cron');
    const a = await this.prisma.aiAgentDefinition.update({ where: { key }, data: { ...dto, schedule: dto.schedule === undefined ? undefined : dto.schedule.trim() || null } }).catch(() => { throw notFound('Agent'); });
    await this.audit.record({ actorUserId: actorId, actor: `user:${actorId}`, action: 'admin.ai_agent_updated', entityType: 'ai_agent', entityId: key, after: dto });
    return a;
  }

  async usage(days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const [byProvider, byOrg, failures] = await Promise.all([
      this.prisma.aiUsage.groupBy({ by: ['provider', 'model'], where: { date: { gte: since } }, _sum: { requests: true, inputTokens: true, outputTokens: true, costMicros: true, generations: true } }),
      this.prisma.aiUsage.groupBy({ by: ['organizationId'], where: { date: { gte: since } }, _sum: { inputTokens: true, outputTokens: true, costMicros: true }, orderBy: { _sum: { costMicros: 'desc' } }, take: 20 }),
      this.prisma.aiAgentExecution.groupBy({ by: ['agentKey', 'status'], where: { createdAt: { gte: since } }, _count: true }),
    ]);
    const orgs = await this.prisma.organization.findMany({ where: { id: { in: byOrg.map((o) => o.organizationId) } }, select: { id: true, name: true } });
    const name = new Map(orgs.map((o) => [o.id, o.name]));
    return { days, byProvider, byOrganization: byOrg.map((o) => ({ ...o, name: name.get(o.organizationId) })), executions: failures };
  }

  agentDefinitions() { return this.prisma.aiAgentDefinition.findMany({ orderBy: { key: 'asc' } }); }

  selectFor(agentKey: string) { return this.config.select({ agentKey }); }
}
