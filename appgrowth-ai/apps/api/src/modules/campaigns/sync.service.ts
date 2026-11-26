import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { ProviderApiError } from '../integrations/providers/types';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Pulls daily metrics and spend for every campaign of an ad account. Rows are upserted by (campaign, date, country) and
 * (account, campaign, date), so re-syncing a day replaces its numbers (platforms restate recent days) instead of adding.
 */
@Injectable()
export class SyncService {
  private log = new Logger('Sync');
  constructor(private prisma: PrismaService, private integrations: IntegrationsService) {}

  async syncAccount(accountId: string, days = 7) {
    const started = Date.now();
    const acc = await this.prisma.connectedAccount.findUnique({ where: { id: accountId } });
    if (!acc || acc.deletedAt || acc.status !== 'CONNECTED') return { skipped: true };
    const campaigns = await this.prisma.campaign.findMany({ where: { connectedAccountId: accountId, externalCampaignId: { not: null }, deletedAt: null, status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED'] } } });
    if (!campaigns.length) { await this.prisma.connectedAccount.update({ where: { id: accountId }, data: { lastSyncedAt: new Date() } }); return { campaigns: 0 }; }
    const to = new Date(); const from = new Date(to.getTime() - (days - 1) * 86_400_000);
    try {
      const creds = await this.integrations.credentials(accountId);
      const rows = await creds.provider.metrics(creds, campaigns.map((c) => c.externalCampaignId!), iso(from), iso(to));
      const byExt = new Map(campaigns.map((c) => [c.externalCampaignId!, c]));
      const spend = new Map<string, bigint>();
      await this.prisma.$transaction(async (tx) => {
        // Replace the window: platforms restate recent days, and a country breakdown may replace an earlier ZZ row.
        await tx.campaignMetric.deleteMany({ where: { campaignId: { in: campaigns.map((c) => c.id) }, date: { gte: new Date(`${iso(from)}T00:00:00Z`), lte: new Date(`${iso(to)}T00:00:00Z`) } } });
        for (const r of rows) {
          const c = byExt.get(r.externalCampaignId); if (!c) continue;
          const date = new Date(`${r.date}T00:00:00Z`);
          await tx.campaignMetric.upsert({
            where: { campaignId_date_country: { campaignId: c.id, date, country: r.country } },
            create: { organizationId: c.organizationId, campaignId: c.id, date, country: r.country, impressions: r.impressions, clicks: r.clicks, installs: r.installs, spendMinor: r.spendMinor, currency: c.currency },
            update: { impressions: { increment: r.impressions }, clicks: { increment: r.clicks }, installs: { increment: r.installs }, spendMinor: { increment: r.spendMinor }, syncedAt: new Date() },
          });
          const k = `${c.id}|${r.date}`; spend.set(k, (spend.get(k) ?? 0n) + r.spendMinor);
        }
        for (const [k, amount] of spend) {
          const [campaignId, d] = k.split('|'); const c = campaigns.find((x) => x.id === campaignId)!;
          await tx.advertisingSpend.upsert({
            where: { connectedAccountId_campaignId_date: { connectedAccountId: accountId, campaignId, date: new Date(`${d}T00:00:00Z`) } },
            create: { organizationId: c.organizationId, connectedAccountId: accountId, campaignId, provider: c.provider, date: new Date(`${d}T00:00:00Z`), amountMinor: amount, currency: c.currency },
            update: { amountMinor: amount, syncedAt: new Date() },
          });
        }
      }, { timeout: 60_000 });
      for (const c of campaigns) {
        try { await this.prisma.campaign.update({ where: { id: c.id }, data: { externalStatus: await creds.provider.getStatus(creds, c.externalCampaignId!), lastSyncedAt: new Date() } }); }
        catch (e) { if (e instanceof ProviderApiError && e.status === 404) await this.prisma.campaign.update({ where: { id: c.id }, data: { statusReason: 'Not found on the ad platform (deleted there?)' } }); else throw e; }
      }
      await this.prisma.connectedAccount.update({ where: { id: accountId }, data: { lastSyncedAt: new Date() } });
      await this.prisma.integrationSyncLog.create({ data: { organizationId: acc.organizationId, connectedAccountId: accountId, providerKey: acc.providerKey, operation: 'metrics_sync', status: 'ok', durationMs: Date.now() - started, message: `${rows.length} rows` } });
      return { campaigns: campaigns.length, rows: rows.length };
    } catch (e) {
      await this.integrations.handleProviderError(accountId, e, 'metrics_sync');
      throw e;
    }
  }
}
