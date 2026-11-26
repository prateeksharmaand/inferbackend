import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Orchestrator } from '../ai/orchestrator.service';
import { AppsService } from '../apps/apps.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StoreService } from '../store/store.service';
import { WorkflowEngine } from './workflow-engine.service';

/** Workflow A — new application onboarding. */
@Injectable()
export class OnboardingWorkflow implements OnModuleInit {
  constructor(private engine: WorkflowEngine, private prisma: PrismaService, private apps: AppsService, private store: StoreService, private orch: Orchestrator, private notify: NotificationsService) {}

  onModuleInit() {
    this.engine.register({
      key: 'app_onboarding',
      steps: [
        { key: 'validate_identifiers', critical: true, run: async (c) => {
          const app = await this.prisma.application.findFirst({ where: { id: c.subjectId!, organizationId: c.organizationId, deletedAt: null }, include: { platforms: true } });
          if (!app) throw new Error('Application no longer exists');
          if (app.status === 'paused') return { status: 'SKIPPED', note: 'App is paused' };
          const results = [];
          for (const p of app.platforms) {
            const ok = p.platform === 'ANDROID' ? await this.store.androidPackageExists(p.storeId) : !!(await this.store.lookupIos({ appleAppId: p.appleAppId ?? undefined, bundleId: p.appleAppId ? undefined : p.storeId }).catch(() => null));
            if (ok) await this.prisma.applicationPlatform.update({ where: { id: p.id }, data: { validatedAt: new Date() } });
            results.push({ platform: p.platform, storeId: p.storeId, found: ok });
          }
          return { status: 'SUCCEEDED', output: results };
        } },
        { key: 'fetch_store_metadata', run: async (c) => ({ status: 'SUCCEEDED', output: await this.apps.refreshMetadata(c.organizationId, null, c.subjectId!) }) },
        { key: 'market_research', run: async (c) => {
          const r = await this.orch.runNow(c.organizationId, 'market_research', { applicationId: c.subjectId! }, { trigger: 'workflow', workflowExecutionId: c.executionId });
          return { status: 'SUCCEEDED', output: { status: r.status } };
        } },
        { key: 'aso_audit', run: async (c) => {
          const listings = await this.prisma.applicationStoreListing.findMany({ where: { applicationId: c.subjectId! }, distinct: ['platform'], select: { platform: true } });
          if (!listings.length) return { status: 'SKIPPED', note: 'No store listing imported yet (Android needs Play Console access)' };
          const out = [];
          for (const l of listings) out.push((await this.orch.runNow(c.organizationId, 'aso', { applicationId: c.subjectId!, platform: l.platform }, { trigger: 'workflow', workflowExecutionId: c.executionId })).status);
          return { status: 'SUCCEEDED', output: out };
        } },
        { key: 'growth_strategy', run: async (c) => {
          const r = await this.orch.runNow(c.organizationId, 'campaign_strategy', { applicationId: c.subjectId! }, { trigger: 'workflow', workflowExecutionId: c.executionId });
          return { status: 'SUCCEEDED', output: { status: r.status } };
        } },
        { key: 'notify', run: async (c) => {
          const app = await this.prisma.application.findUniqueOrThrow({ where: { id: c.subjectId! } });
          const r = await this.notify.notifyOrg(c.organizationId, { kind: 'ai_ready', title: `${app.name}: research and growth plan ready`, body: 'Market research, the ASO audit and a proposed growth strategy are ready for review. Nothing is spent until you approve.', link: `/insights?app=${app.id}`, dedupeKey: `onboarding:${c.executionId}`, permission: 'apps.read' });
          return { status: 'SUCCEEDED', output: r };
        } },
      ],
      onFinish: async (c, ok) => { await this.prisma.application.updateMany({ where: { id: c.subjectId! }, data: { onboardingStatus: ok ? 'done' : 'failed' } }); },
    });
  }
}
