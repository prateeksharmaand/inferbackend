import { Injectable, OnModuleInit } from '@nestjs/common';
import { CreativeType, Platform, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AgentResponse } from './ai-client';
import { majorToMinorSafe, Orchestrator, RunInput } from './orchestrator.service';

type O = Record<string, unknown>;
const arr = <T = O>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp01 = (v: unknown) => Math.max(0, Math.min(1, num(v)));
const COUNTRY = /^[A-Z]{2}$/;

/**
 * Turns validated agent output into domain records. Everything the model returns is re-validated here (types, ranges,
 * enum membership) because the database is the trust boundary, not the AI service.
 */
@Injectable()
export class Persisters implements OnModuleInit {
  constructor(private prisma: PrismaService, private orch: Orchestrator) {}

  onModuleInit() {
    this.orch.registerPersister('market_research', (o, e, i, r) => this.research(o, e, i, r));
    this.orch.registerPersister('aso', (o, e, i, r) => this.aso(o, e, i, r));
    this.orch.registerPersister('campaign_strategy', (o, e, i, r) => this.strategy(o, e, i, r));
    this.orch.registerPersister('creative', (o, e, i, r) => this.creative(o, e, i, r));
  }

  private async research(orgId: string, executionId: string, input: RunInput, r: AgentResponse) {
    if (!input.applicationId) return;
    const out = r.output;
    const appId = input.applicationId;
    return this.prisma.tenant(orgId, null, async (tx) => {
      const markets = arr(out.markets).filter((m) => COUNTRY.test(str(m.country))).map((m) => ({ country: str(m.country), opportunity: str(m.opportunity), reasoning: str(m.reasoning), confidence: clamp01(m.confidence) }));
      const mr = await tx.marketResearch.create({
        data: {
          organizationId: orgId, applicationId: appId, executionId, summary: str(out.summary, 8000), markets, audiences: arr(out.audiences) as Prisma.InputJsonValue,
          opportunities: { items: arr(out.opportunities), strategies: arr(out.strategies), limitations: arr(out.limitations), grounded: r.grounded } as Prisma.InputJsonValue,
          evidence: arr(out.evidence) as Prisma.InputJsonValue, confidence: clamp01(out.confidence),
        },
      });
      let competitors = 0;
      for (const c of arr(out.competitors).slice(0, 15)) {
        const name = str(c.name, 120).trim();
        if (!name) continue;
        const comp = await tx.competitor.upsert({ where: { applicationId_name: { applicationId: appId, name } }, create: { organizationId: orgId, applicationId: appId, name, website: str(c.website, 300), notes: str(c.notes, 2000), source: 'ai' }, update: { website: str(c.website, 300) || undefined, notes: str(c.notes, 2000) } });
        competitors++;
        const pkg = str(c.android_package, 150); const ios = str(c.ios_app_id, 20);
        if (/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(pkg)) await tx.competitorApp.upsert({ where: { competitorId_platform_storeId: { competitorId: comp.id, platform: 'ANDROID', storeId: pkg } }, create: { organizationId: orgId, competitorId: comp.id, platform: 'ANDROID', storeId: pkg }, update: {} });
        if (/^\d{5,12}$/.test(ios)) await tx.competitorApp.upsert({ where: { competitorId_platform_storeId: { competitorId: comp.id, platform: 'IOS', storeId: ios } }, create: { organizationId: orgId, competitorId: comp.id, platform: 'IOS', storeId: ios }, update: {} });
      }
      const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
      let keywords = 0;
      for (const k of arr(out.keywords).slice(0, 60)) {
        const keyword = str(k.keyword, 100).trim().toLowerCase();
        if (!keyword) continue;
        await tx.keywordResearch.upsert({
          where: { applicationId_country_keyword: { applicationId: appId, country: org.country, keyword } },
          create: { organizationId: orgId, applicationId: appId, country: org.country, keyword, relevance: clamp01(k.relevance), estimatedPopularity: str(k.popularity, 10) || 'unknown', competition: str(k.competition, 10) || 'unknown', source: r.grounded ? 'ai_grounded' : 'ai' },
          update: { relevance: clamp01(k.relevance), estimatedPopularity: str(k.popularity, 10) || 'unknown', competition: str(k.competition, 10) || 'unknown' },
        });
        keywords++;
      }
      await tx.audienceSegment.deleteMany({ where: { applicationId: appId, source: 'ai' } });
      for (const a of arr(out.audiences).slice(0, 10)) {
        await tx.audienceSegment.create({ data: { organizationId: orgId, applicationId: appId, name: str(a.name, 120), description: str(a.description, 2000), countries: arr<string>(a.countries).filter((c) => COUNTRY.test(c)), ageRange: str(a.age_range, 20), interests: arr<string>(a.interests).map((x) => str(x, 60)).slice(0, 20), source: 'ai' } });
      }
      return { marketResearchId: mr.id, competitors, keywords };
    });
  }

  private async aso(orgId: string, executionId: string, input: RunInput, r: AgentResponse) {
    if (!input.applicationId || !input.platform) return;
    const out = r.output;
    return this.prisma.tenant(orgId, null, async (tx) => {
      const listing = await tx.applicationStoreListing.findFirst({ where: { applicationId: input.applicationId, platform: input.platform }, orderBy: { fetchedAt: 'desc' } });
      const audit = await tx.asoAudit.create({
        data: {
          organizationId: orgId, applicationId: input.applicationId!, platform: input.platform as Platform, listingId: listing?.id, executionId,
          score: Math.round(Math.max(0, Math.min(100, num(out.score)))), findings: arr(out.findings) as Prisma.InputJsonValue,
          suggestedTitle: str(out.suggested_title, 60), suggestedSubtitle: str(out.suggested_subtitle, 120),
          suggestedKeywords: arr<string>(out.suggested_keywords).map((k) => str(k, 60)).slice(0, 40), localization: { items: arr(out.localization), screenshot_feedback: str(out.screenshot_feedback, 3000), limitations: arr(out.limitations), had_listing: !!listing } as Prisma.InputJsonValue,
        },
      });
      return { asoAuditId: audit.id, score: audit.score };
    });
  }

  private async strategy(orgId: string, executionId: string, input: RunInput, r: AgentResponse) {
    if (!input.applicationId) return;
    const out = r.output;
    const cpi = (out.estimated_cpi ?? {}) as O; const fc = (out.forecast_installs ?? {}) as O;
    const providers = new Set(['GOOGLE_ADS', 'APPLE_ADS', 'META_ADS', 'TIKTOK_ADS']);
    const plan = arr(out.campaign_plan).filter((c) => providers.has(str(c.provider)) && ['ANDROID', 'IOS'].includes(str(c.platform)) && !(c.provider === 'APPLE_ADS' && c.platform === 'ANDROID'));
    return this.prisma.tenant(orgId, null, async (tx) => {
      // A new plan supersedes older pending ones for the same app.
      await tx.marketingStrategy.updateMany({ where: { applicationId: input.applicationId, status: 'PENDING' }, data: { status: 'REJECTED', decidedAt: new Date() } });
      const s = await tx.marketingStrategy.create({
        data: {
          organizationId: orgId, applicationId: input.applicationId!, executionId, month: (input.params?.month as string) ? new Date(`${input.params!.month}-01T00:00:00Z`) : null,
          title: str(out.title, 200) || 'Growth strategy', summary: str(out.summary, 8000), channels: arr(out.channels).filter((c) => providers.has(str(c.provider))) as Prisma.InputJsonValue,
          countryAllocations: arr(out.country_allocations).filter((c) => COUNTRY.test(str(c.country))) as Prisma.InputJsonValue,
          estimatedCpiMinor: majorToMinorSafe(num(cpi.expected, NaN)), estimatedBudgetMinor: majorToMinorSafe(num(out.estimated_monthly_budget, NaN)),
          forecastInstalls: { low: Math.round(num(fc.low)), expected: Math.round(num(fc.expected)), high: Math.round(num(fc.high)), cpi_low: num(cpi.low), cpi_high: num(cpi.high), method: 'ai_estimate' } as Prisma.InputJsonValue,
          campaignPlan: plan as Prisma.InputJsonValue, assumptions: { assumptions: arr(out.assumptions), risks: arr(out.risks) } as Prisma.InputJsonValue,
        },
      });
      return { strategyId: s.id, campaigns: plan.length };
    });
  }

  private async creative(orgId: string, executionId: string, input: RunInput, r: AgentResponse) {
    const projectId = input.params?.projectId as string | undefined;
    if (!projectId || !input.applicationId) return;
    const types = new Set(Object.values(CreativeType) as string[]);
    const variants = arr(r.output.variants).filter((v) => types.has(str(v.type)));
    const costEach = variants.length ? BigInt(Math.floor(r.cost_micros / variants.length)) : 0n;
    return this.prisma.tenant(orgId, null, async (tx) => {
      const ids: string[] = [];
      for (const v of variants) {
        const flags = arr<string>(v.policy_flags);
        const asset = await tx.creativeAsset.create({
          data: { organizationId: orgId, projectId, applicationId: input.applicationId!, campaignId: (input.params?.campaignId as string) ?? null, type: str(v.type) as CreativeType, title: str(v.title, 120) || str(v.headline, 120), policyFlags: flags },
        });
        await tx.creativeVersion.create({
          data: {
            organizationId: orgId, assetId: asset.id, version: 1, provider: r.provider, model: r.model, costMicros: costEach,
            content: { headline: str(v.headline, 300), body: str(v.body, 3000), call_to_action: str(v.call_to_action, 60), image_prompt: str(v.image_prompt, 2000), video_script: str(v.video_script, 6000), rationale: str(v.rationale, 1000), channel: input.params?.channel ?? null, execution_id: executionId },
          },
        });
        ids.push(asset.id);
      }
      return { creativeAssetIds: ids, flagged: variants.filter((v) => arr(v.policy_flags).length).length };
    });
  }
}
