import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { AppError, notFound } from '../../common/errors';
import { fromMinor } from '../../common/money';
import { paged, skipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { QUEUES, queue } from '../../queues/queues';
import { AiClient } from '../ai/ai-client';
import { AiConfigService } from '../ai/ai-config.service';
import { Orchestrator } from '../ai/orchestrator.service';
import { monthOf } from '../budgets/budgets.service';
import { StorageService } from '../storage/storage.service';
import type { CreativeQuery, DecisionDto, EditDto, GenerateDto, MediaDto } from './dto';

type Content = { headline?: string; body?: string; call_to_action?: string; image_prompt?: string; video_script?: string; storageKey?: string; mimeType?: string; [k: string]: unknown };
const SAFETY_RE = /\b(guarantee|#\s?1|cure|100\s?%|risk[- ]free)\b/i;

@Injectable()
export class CreativesService {
  constructor(private prisma: PrismaService, private audit: AuditService, private orch: Orchestrator, private storage: StorageService, private ai: AiClient, private aiConfig: AiConfigService) {}

  async generate(orgId: string, userId: string, dto: GenerateDto) {
    const app = await this.prisma.application.findFirst({ where: { id: dto.applicationId, organizationId: orgId, deletedAt: null } });
    if (!app) throw notFound('Application');
    if (dto.campaignId && !(await this.prisma.campaign.count({ where: { id: dto.campaignId, organizationId: orgId } }))) throw notFound('Campaign');
    if (dto.channel === 'APPLE_ADS') throw new AppError('Apple Ads uses your App Store listing as the ad — improve it with the ASO audit instead', 400, 'unsupported_channel');
    await this.assertGenerationQuota(orgId, 1);
    const project = dto.projectId
      ? await this.prisma.creativeProject.findFirst({ where: { id: dto.projectId, organizationId: orgId } })
      : await this.prisma.tenant(orgId, userId, (tx) => tx.creativeProject.create({ data: { organizationId: orgId, applicationId: app.id, campaignId: dto.campaignId, name: dto.projectName || `${app.name} · ${dto.channel.replace('_ADS', '').toLowerCase()} · ${new Date().toISOString().slice(0, 10)}`, brief: dto.brief ?? '', createdById: userId } }));
    if (!project) throw notFound('Project');
    const exec = await this.orch.enqueue(orgId, 'creative', {
      applicationId: app.id, campaignId: dto.campaignId,
      params: { projectId: project.id, campaignId: dto.campaignId, channel: dto.channel, types: dto.types, variants_per_type: dto.variantsPerType ?? 3, brief: dto.brief ?? '', language: dto.language ?? 'en' },
    }, { trigger: 'manual', requestedById: userId });
    await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'creative.generation_requested', entityType: 'creative_project', entityId: project.id, after: { channel: dto.channel, types: dto.types } });
    return { projectId: project.id, executionId: exec.id };
  }

  private async assertGenerationQuota(orgId: string, n: number) {
    const sub = await this.prisma.subscription.findFirst({ where: { organizationId: orgId, status: { in: ['ACTIVE', 'TRIALING'] } }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
    if (!sub) throw new AppError('No active subscription', 402, 'subscription_inactive');
    const since = monthOf();
    const [media, textRuns] = await Promise.all([
      this.prisma.aiUsage.aggregate({ where: { organizationId: orgId, date: { gte: since } }, _sum: { generations: true } }),
      this.prisma.aiAgentExecution.count({ where: { organizationId: orgId, agentKey: 'creative', createdAt: { gte: since } } }),
    ]);
    const used = (media._sum.generations ?? 0) + textRuns;
    if (used + n > sub.plan.aiGenerationsMonth) throw new AppError(`You’ve used ${used} of ${sub.plan.aiGenerationsMonth} AI generations this month on the ${sub.plan.name} plan.`, 402, 'generation_quota_exceeded');
  }

  async list(orgId: string, userId: string, q: CreativeQuery) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const where: Prisma.CreativeAssetWhereInput = { organizationId: orgId, deletedAt: null, applicationId: q.applicationId, campaignId: q.campaignId, type: q.type, approvalStatus: q.approvalStatus, ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}) };
      const [rows, total] = await Promise.all([
        tx.creativeAsset.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q), include: { versions: { orderBy: { version: 'desc' }, take: 1 }, project: { select: { id: true, name: true } }, performance: true } }),
        tx.creativeAsset.count({ where }),
      ]);
      return paged(rows.map((a) => this.view(a)), total, q);
    });
  }

  private view(a: Prisma.CreativeAssetGetPayload<{ include: { versions: true; project: { select: { id: true; name: true } }; performance: true } }>) {
    const v = a.versions[0]; const c = (v?.content ?? {}) as Content;
    const perf = a.performance.reduce((s, p) => ({ impressions: s.impressions + Number(p.impressions), clicks: s.clicks + Number(p.clicks), installs: s.installs + p.installs, spend: s.spend + p.spendMinor }), { impressions: 0, clicks: 0, installs: 0, spend: 0n });
    return {
      id: a.id, type: a.type, title: a.title, approvalStatus: a.approvalStatus, policyFlags: a.policyFlags as string[], currentVersion: a.currentVersion, applicationId: a.applicationId, campaignId: a.campaignId,
      project: a.project, createdAt: a.createdAt, updatedAt: a.updatedAt,
      content: { ...c, storageKey: undefined, mediaUrl: c.storageKey ? this.storage.signedUrl(c.storageKey) : null },
      provider: v?.provider, model: v?.model, costMicros: v?.costMicros ?? 0n,
      performance: { ...perf, spend: fromMinor(perf.spend), ctr: perf.impressions ? Math.round((perf.clicks / perf.impressions) * 10000) / 100 : null, cpi: perf.installs ? fromMinor(perf.spend / BigInt(perf.installs)) : null },
    };
  }

  async get(orgId: string, userId: string, id: string) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const a = await tx.creativeAsset.findFirst({ where: { id, organizationId: orgId, deletedAt: null }, include: { versions: { orderBy: { version: 'desc' } }, project: { select: { id: true, name: true } }, performance: { orderBy: { date: 'desc' }, take: 60 }, approvals: { orderBy: { decidedAt: 'desc' } } } });
      if (!a) throw notFound('Creative');
      return {
        ...this.view({ ...a, versions: a.versions.slice(0, 1) }),
        versions: a.versions.map((v) => { const c = v.content as Content; return { version: v.version, provider: v.provider, model: v.model, costMicros: v.costMicros, createdAt: v.createdAt, content: { ...c, storageKey: undefined, mediaUrl: c.storageKey ? this.storage.signedUrl(c.storageKey) : null } }; }),
        approvals: a.approvals, dailyPerformance: a.performance.map((p) => ({ date: p.date, impressions: Number(p.impressions), clicks: Number(p.clicks), installs: p.installs, spend: fromMinor(p.spendMinor) })),
      };
    });
  }

  /** Human edit → new version; approval resets to pending and flags are recomputed with the same rules. */
  async edit(orgId: string, userId: string, id: string, dto: EditDto) {
    const kit = await this.prisma.brandKit.findUnique({ where: { organizationId: orgId } });
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const a = await tx.creativeAsset.findFirst({ where: { id, organizationId: orgId, deletedAt: null }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
      if (!a) throw notFound('Creative');
      const prev = (a.versions[0]?.content ?? {}) as Content;
      const { title, ...content } = dto;
      const next = { ...prev, ...content };
      const text = [next.headline, next.body, next.call_to_action, next.video_script].filter(Boolean).join(' ').toLowerCase();
      const flags = [...(kit?.bannedClaims ?? []).filter((b) => b.trim() && text.includes(b.trim().toLowerCase())).map((b) => `Uses a banned claim: “${b}”`), ...(SAFETY_RE.test(text) ? ['Contains a restricted claim (guarantee / #1 / cure / 100% / risk-free)'] : [])];
      const version = a.currentVersion + 1;
      await tx.creativeVersion.create({ data: { organizationId: orgId, assetId: id, version, content: next as Prisma.InputJsonValue, provider: 'manual', model: 'human', createdById: userId } });
      await tx.creativeAsset.update({ where: { id }, data: { currentVersion: version, approvalStatus: 'PENDING', title: title ?? a.title, policyFlags: flags } });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'creative.edited', entityType: 'creative', entityId: id, after: { version } }, tx);
      return { version, policyFlags: flags };
    });
  }

  async decide(orgId: string, userId: string, id: string, approve: boolean, dto: DecisionDto) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const a = await tx.creativeAsset.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
      if (!a) throw notFound('Creative');
      const flags = a.policyFlags as string[];
      if (approve && flags.length && !dto.acknowledgeFlags) throw new AppError(`This creative has ${flags.length} policy flag(s). Edit it, or confirm you reviewed them.`, 409, 'flags_unacknowledged', flags);
      await tx.creativeApproval.create({ data: { organizationId: orgId, assetId: id, version: a.currentVersion, status: approve ? 'APPROVED' : 'REJECTED', comment: dto.comment ?? '', decidedById: userId } });
      await tx.creativeAsset.update({ where: { id }, data: { approvalStatus: approve ? 'APPROVED' : 'REJECTED' } });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: approve ? 'creative.approved' : 'creative.rejected', entityType: 'creative', entityId: id, after: { version: a.currentVersion, flagsAcknowledged: flags.length ? !!dto.acknowledgeFlags : undefined, comment: dto.comment } }, tx);
      return { id, approvalStatus: approve ? 'APPROVED' : 'REJECTED' };
    });
  }

  async remove(orgId: string, userId: string, id: string) {
    await this.prisma.tenant(orgId, userId, async (tx) => {
      const inUse = await tx.campaignCreative.count({ where: { creativeAssetId: id, campaign: { status: { in: ['ACTIVE', 'PAUSED'] } } } });
      if (inUse) throw new AppError('This creative is used by a live campaign', 409, 'in_use');
      const r = await tx.creativeAsset.updateMany({ where: { id, organizationId: orgId, deletedAt: null }, data: { deletedAt: new Date() } });
      if (!r.count) throw notFound('Creative');
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'creative.deleted', entityType: 'creative', entityId: id }, tx);
    });
  }

  /** Queues image/video generation from the variant's prompt (or an edited one). */
  async requestMedia(orgId: string, userId: string, id: string, kind: 'image' | 'video', dto: MediaDto) {
    if (kind === 'video') {
      const flag = await this.prisma.featureFlag.findUnique({ where: { key: 'creative.video_generation' } });
      if (!flag?.enabled && !flag?.orgAllowList.includes(orgId)) throw new AppError('Video generation is not enabled on this platform yet', 409, 'feature_disabled');
    }
    const a = await this.prisma.creativeAsset.findFirst({ where: { id, organizationId: orgId, deletedAt: null }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
    if (!a) throw notFound('Creative');
    const c = (a.versions[0]?.content ?? {}) as Content;
    const prompt = (dto.prompt ?? (kind === 'video' ? c.video_script : c.image_prompt) ?? '').trim();
    if (prompt.length < 10) throw new AppError(`Add a ${kind === 'video' ? 'video script' : 'image prompt'} first`, 400, 'prompt_required');
    await this.assertGenerationQuota(orgId, kind === 'video' ? 4 : 1);
    await this.aiConfig.select({ purpose: kind }); // fail fast when no provider is configured
    const job = await queue(QUEUES.agents).add('media', { organizationId: orgId, assetId: id, kind, prompt, size: dto.size ?? '1024x1024', requestedById: userId }, { attempts: 2 });
    return { jobId: job.id, queued: true };
  }

  /** Worker side of requestMedia. */
  async generateMedia(data: { organizationId: string; assetId: string; kind: 'image' | 'video'; prompt: string; size: string; requestedById: string }) {
    const sel = await this.aiConfig.select({ purpose: data.kind });
    const app = await this.prisma.creativeAsset.findUniqueOrThrow({ where: { id: data.assetId }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
    const r = await this.ai.media(sel, data.kind === 'image' ? { kind: 'image', prompt: data.prompt, size: data.size } : { kind: 'video', prompt: data.prompt, aspect_ratio: data.size === '1200x628' ? '16:9' : '9:16', seconds: 8 });
    const item = r.items[0];
    const key = await this.storage.putGenerated(data.organizationId, `creatives/${data.assetId}`, Buffer.from(item.base64, 'base64'), item.mime, item.mime === 'video/mp4' ? 'mp4' : item.mime === 'image/jpeg' ? 'jpg' : 'png');
    await this.orch.recordUsage(data.organizationId, r.provider, r.model, r.usage.input_tokens, r.usage.output_tokens, BigInt(r.cost_micros), r.units);
    await this.prisma.tenant(data.organizationId, null, async (tx) => {
      const prev = (app.versions[0]?.content ?? {}) as Content;
      const version = app.currentVersion + 1;
      await tx.creativeVersion.create({ data: { organizationId: data.organizationId, assetId: data.assetId, version, content: { ...prev, storageKey: key, mimeType: item.mime, media_prompt: data.prompt } as Prisma.InputJsonValue, provider: r.provider, model: r.model, costMicros: BigInt(r.cost_micros), createdById: data.requestedById } });
      await tx.creativeAsset.update({ where: { id: data.assetId }, data: { currentVersion: version, approvalStatus: 'PENDING' } });
    });
    return { storageKey: key };
  }

  projects(orgId: string, userId: string, applicationId?: string) {
    return this.prisma.tenant(orgId, userId, (tx) => tx.creativeProject.findMany({ where: { organizationId: orgId, ...(applicationId ? { applicationId } : {}) }, orderBy: { createdAt: 'desc' }, take: 50, include: { _count: { select: { assets: { where: { deletedAt: null } } } } } }));
  }
}
