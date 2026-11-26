import { INestApplicationContext } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { AttributionService } from './modules/attribution/attribution.service';
import { CampaignExecutor, RetryableError } from './modules/campaigns/executor.service';
import { SyncService } from './modules/campaigns/sync.service';
import { ReportsService } from './modules/reports/reports.service';

export type Handler = (job: Job) => Promise<unknown>;

/** Queue processors (workflows and agents are wired in worker.ts). */
export function registerProcessors(app: INestApplicationContext): Record<string, Handler> {
  const executor = app.get(CampaignExecutor); const sync = app.get(SyncService); const attribution = app.get(AttributionService); const reports = app.get(ReportsService);
  return {
    campaigns: async (job) => {
      try { return await executor.run(job.data.actionId); }
      catch (e) { if (e instanceof RetryableError) throw e; throw new UnrecoverableError((e as Error).message); } // non-transient errors don't retry
    },
    sync: async (job) => (job.name === 'attribution' ? attribution.pull(job.data.sourceId) : sync.syncAccount(job.data.connectedAccountId)),
    reports: async (job) => { await reports.build(job.data.reportId); return 'ready'; },
  };
}
