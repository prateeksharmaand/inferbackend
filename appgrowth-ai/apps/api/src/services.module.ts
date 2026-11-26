import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CommonModule } from './common/common.module';
import { AiClient } from './modules/ai/ai-client';
import { AiConfigService } from './modules/ai/ai-config.service';
import { AiService } from './modules/ai/ai.service';
import { Orchestrator } from './modules/ai/orchestrator.service';
import { Persisters } from './modules/ai/persisters.service';
import { ToolRegistry } from './modules/ai/tools';
import { AdminService } from './modules/admin/admin.service';
import { AnalyticsService } from './modules/analytics/analytics.service';
import { AppsService } from './modules/apps/apps.service';
import { AuthService } from './modules/auth/auth.service';
import { BudgetsService } from './modules/budgets/budgets.service';
import { CreativesService } from './modules/creatives/creatives.service';
import { AnalyticsEngine } from './modules/attribution/analytics-engine.service';
import { AttributionService } from './modules/attribution/attribution.service';
import { BudgetEngine } from './modules/automation/budget-engine.service';
import { CampaignsService } from './modules/campaigns/campaigns.service';
import { CampaignExecutor } from './modules/campaigns/executor.service';
import { SyncService } from './modules/campaigns/sync.service';
import { IntegrationsService } from './modules/integrations/integrations.service';
import { ReportsService } from './modules/reports/reports.service';
import { NotificationsService } from './modules/notifications/notifications.service';
import { OrganizationsService } from './modules/organizations/organizations.service';
import { StorageService } from './modules/storage/storage.service';
import { StoreService } from './modules/store/store.service';
import { WorkflowEngine } from './modules/workflows/workflow-engine.service';
import { WorkflowStarter } from './modules/workflows/workflow-starter.service';

/** Business services shared by the API, worker and scheduler processes. */
const SERVICES = [
  AuthService, OrganizationsService, AdminService, AppsService, StorageService, StoreService, WorkflowStarter, BudgetsService, AnalyticsService,
  AiClient, AiConfigService, AiService, Orchestrator, Persisters, ToolRegistry, NotificationsService, WorkflowEngine, CreativesService,
  IntegrationsService, CampaignsService, CampaignExecutor, SyncService, BudgetEngine, AttributionService, AnalyticsEngine, ReportsService,
];
@Module({ imports: [CommonModule, JwtModule.register({})], providers: SERVICES, exports: [...SERVICES, JwtModule] })
export class ServicesModule {}
