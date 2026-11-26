import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { canTransition } from '../../common/campaign-state';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { checkChange } from '../../common/spend-policy';
import { BudgetsService } from '../budgets/budgets.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { CampaignSpec, ProviderApiError } from '../integrations/providers/types';
import { NotificationsService } from '../notifications/notifications.service';

export class RetryableError extends Error {}

/**
 * Campaign Execution Engine (worker). Every platform call goes through here:
 *  - per-campaign lock (no two actions on one campaign at once) and org budget lock around spend checks,
 *  - spend policy re-checked at execution time,
 *  - idempotent: the CampaignAction row records completion; platform-side creation is de-duplicated by a name tag,
 *  - fails safe: on error nothing about existing limits changes; auth errors pause the account's automation.
 */
@Injectable()
export class CampaignExecutor {
  private log = new Logger('Executor');
  constructor(private prisma: PrismaService, private redis: RedisService, private integrations: IntegrationsService, private budgets: BudgetsService, private audit: AuditService, private notify: NotificationsService) {}

  async run(actionId: string) {
    const action = await this.prisma.campaignAction.findUniqueOrThrow({ where: { id: actionId } });
    if (action.status !== 'pending') return action.status; // idempotent
    const lock = await this.redis.withLock(`campaign:${action.campaignId}`, 5 * 60_000, () => this.redis.withLock(`org-budget:${action.organizationId}`, 2 * 60_000, () => this.execute(actionId)));
    if (!lock.acquired || !lock.value.acquired) throw new RetryableError('Campaign or budget is locked by another action; retrying');
    return lock.value.value;
  }

  private async done(actionId: string, status: 'succeeded' | 'failed', response: unknown, error?: string) {
    await this.prisma.campaignAction.update({ where: { id: actionId }, data: { status, response: (response ?? {}) as Prisma.InputJsonValue, error: error?.slice(0, 2000), completedAt: new Date() } });
  }

  private async execute(actionId: string) {
    const action = await this.prisma.campaignAction.findUniqueOrThrow({ where: { id: actionId } });
    if (action.status !== 'pending') return action.status;
    const c = await this.prisma.campaign.findUniqueOrThrow({ where: { id: action.campaignId }, include: { application: { include: { platforms: true } } } });
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: c.organizationId } });
    const agent = action.actor.startsWith('agent:');
    const req = action.request as Record<string, string>;
    // Fail-safe gates re-checked at execution time.
    if (org.status !== 'ACTIVE' && action.action !== 'pause') { await this.done(actionId, 'failed', {}, 'Organization suspended'); return 'failed'; }
    if (agent && action.action !== 'pause' && (!org.automationEnabled || !c.automationEnabled)) { await this.done(actionId, 'failed', {}, 'Automation switched off'); return 'failed'; }
    if (['launch', 'resume', 'budget_change'].includes(action.action)) {
      const newDaily = action.action === 'budget_change' ? BigInt(req.dailyMinor) : c.dailyBudgetMinor;
      const v = checkChange(await this.budgets.policy(c.organizationId), await this.budgets.state(c.organizationId, c.id), { actor: agent ? 'agent' : 'user', provider: c.provider, currentDailyMinor: c.status === 'ACTIVE' ? c.dailyBudgetMinor : null, newDailyMinor: newDaily, activating: action.action === 'launch' || action.action === 'resume' });
      if (!v.allowed) { await this.done(actionId, 'failed', { policy: v.code }, `Blocked by spending policy: ${v.reason}`); return 'failed'; }
    }
    if (!c.connectedAccountId) { await this.done(actionId, 'failed', {}, 'No ad account selected'); return 'failed'; }
    let creds;
    try { creds = await this.integrations.credentials(c.connectedAccountId); } catch (e) { await this.done(actionId, 'failed', {}, (e as Error).message); return 'failed'; }
    const p = creds.provider;
    try {
      switch (action.action) {
        case 'launch': {
          if (!canTransition(c.status, 'ACTIVE') && c.status !== 'FAILED') throw new Error(`Cannot launch from ${c.status}`);
          let externalId = c.externalCampaignId;
          if (!externalId) {
            const spec = await this.spec(c.id);
            const r = await p.createCampaign(creds, spec, action.idempotencyKey);
            externalId = r.externalCampaignId;
            await this.prisma.campaign.update({ where: { id: c.id }, data: { externalCampaignId: externalId, externalStatus: r.externalStatus, tracking: { ...(c.tracking as object), children: r.children ?? {} } as Prisma.InputJsonValue } });
            await this.prisma.campaignCreative.updateMany({ where: { campaignId: c.id }, data: { uploadedAt: new Date() } });
          }
          const st = await p.setStatus(creds, externalId, 'ACTIVE');
          await this.prisma.campaign.update({ where: { id: c.id }, data: { status: 'ACTIVE', externalStatus: st, statusReason: '' } });
          await this.done(actionId, 'succeeded', { externalCampaignId: externalId, externalStatus: st });
          break;
        }
        case 'pause': case 'resume': {
          if (!c.externalCampaignId) throw new Error('Campaign does not exist on the ad platform');
          const target = action.action === 'pause' ? 'PAUSED' : 'ACTIVE';
          const st = await p.setStatus(creds, c.externalCampaignId, target);
          await this.prisma.campaign.update({ where: { id: c.id }, data: { status: target, externalStatus: st, statusReason: req.reason ?? '' } });
          await this.done(actionId, 'succeeded', { externalStatus: st });
          break;
        }
        case 'budget_change': {
          const daily = BigInt(req.dailyMinor);
          if (c.externalCampaignId) await p.setDailyBudget(creds, c.externalCampaignId, daily, c.currency);
          await this.prisma.$transaction([
            this.prisma.campaign.update({ where: { id: c.id }, data: { dailyBudgetMinor: daily } }),
            this.prisma.campaignBudget.create({ data: { organizationId: c.organizationId, campaignId: c.id, dailyMinor: daily, monthlyMinor: c.monthlyBudgetMinor, changedBy: action.actor, reason: req.reason ?? '' } }),
          ]);
          await this.done(actionId, 'succeeded', { dailyMinor: daily.toString() });
          break;
        }
        case 'sync_status': {
          if (c.externalCampaignId) await this.prisma.campaign.update({ where: { id: c.id }, data: { externalStatus: await p.getStatus(creds, c.externalCampaignId), lastSyncedAt: new Date() } });
          await this.done(actionId, 'succeeded', {});
          break;
        }
        default: await this.done(actionId, 'failed', {}, `Unknown action ${action.action}`);
      }
      await this.prisma.integrationSyncLog.create({ data: { organizationId: c.organizationId, connectedAccountId: c.connectedAccountId, providerKey: p.key, operation: `campaign.${action.action}`, status: 'ok' } });
      await this.audit.record({ organizationId: c.organizationId, actor: action.actor, actorUserId: action.actor.startsWith('user:') ? action.actor.slice(5) : null, action: `campaign.${action.action}_executed`, entityType: 'campaign', entityId: c.id, after: req });
      return 'succeeded';
    } catch (e) {
      const pe = e instanceof ProviderApiError ? e : null;
      await this.integrations.handleProviderError(c.connectedAccountId, e, `campaign.${action.action}`);
      if (pe && (pe.kind === 'transient' || pe.kind === 'rate_limit')) throw new RetryableError(pe.message); // BullMQ retries with backoff
      await this.done(actionId, 'failed', {}, (e as Error).message);
      if (action.action === 'launch') {
        await this.prisma.campaign.update({ where: { id: c.id }, data: { status: 'FAILED', statusReason: (e as Error).message.slice(0, 500) } });
        await this.notify.notifyOrg(c.organizationId, { kind: 'campaign_failed', severity: 'critical', title: `Campaign “${c.name}” could not launch`, body: (e as Error).message.slice(0, 400), link: `/campaigns/${c.id}`, dedupeKey: `launch-failed:${actionId}`, permission: 'campaigns.read' });
      } else {
        await this.prisma.campaign.update({ where: { id: c.id }, data: { statusReason: `${action.action} failed: ${(e as Error).message}`.slice(0, 500) } });
      }
      return 'failed';
    }
  }

  private async spec(campaignId: string): Promise<CampaignSpec> {
    const c = await this.prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: { application: { include: { platforms: true } }, creatives: true } });
    const pf = c.application.platforms.find((x) => x.platform === c.platform);
    const link = await this.prisma.accountApplication.findFirst({ where: { connectedAccountId: c.connectedAccountId!, applicationId: c.applicationId } });
    const assets = await this.prisma.creativeAsset.findMany({ where: { id: { in: c.creatives.map((x) => x.creativeAssetId) }, approvalStatus: 'APPROVED', deletedAt: null }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
    const content = assets.map((a) => ({ ...((a.versions[0]?.content ?? {}) as Record<string, string>), type: a.type as string })) as (Record<string, string> & { type: string })[];
    return {
      name: c.name, platform: c.platform, objective: c.objective as CampaignSpec['objective'], countries: c.countries, languages: c.languages, dailyBudgetMinor: c.dailyBudgetMinor, currency: c.currency,
      targetCpiMinor: c.targetCpiMinor, startDate: c.startDate < new Date() ? new Date() : c.startDate, endDate: c.endDate,
      app: { androidPackage: c.platform === 'ANDROID' ? pf?.storeId : undefined, appleAppId: pf?.appleAppId ?? undefined, storeUrl: pf?.storeUrl ?? '', name: c.application.name },
      creatives: {
        headlines: content.filter((x) => x.headline).map((x) => x.headline), descriptions: content.filter((x) => x.body && ['DESCRIPTION', 'AD_COPY'].includes(x.type)).map((x) => x.body),
        imageUrls: [], videoUrls: [],
      },
      externalAppId: link?.externalAppId ?? undefined,
    };
  }
}
