import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/errors';
import { AuthGuard } from './common/guards/auth.guard';
import { MetricsInterceptor } from './common/metrics';
import { HealthController } from './health.controller';
import { AdminController } from './modules/admin/admin.controller';
import { AdminAiController, AiController } from './modules/ai/ai.controller';
import { AnalyticsController } from './modules/analytics/analytics.controller';
import { AppsController } from './modules/apps/apps.controller';
import { AuthController } from './modules/auth/auth.controller';
import { CreativesController } from './modules/creatives/creatives.controller';
import { BudgetsController } from './modules/budgets/budgets.controller';
import { OrganizationsController } from './modules/organizations/organizations.controller';
import { FilesController } from './modules/storage/files.controller';
import { ServicesModule } from './services.module';
import { ApiLogInterceptor } from './common/api-log';
import { AttributionController } from './modules/attribution/attribution.controller';
import { AutomationController } from './modules/automation/automation.controller';
import { BillingController } from './modules/billing/billing.controller';
import { CampaignsController } from './modules/campaigns/campaigns.controller';
import { IntegrationsController } from './modules/integrations/integrations.controller';
import { NotificationsController } from './modules/notifications/notifications.controller';
import { ReportsController } from './modules/reports/reports.controller';
import { SupportController } from './modules/support/support.controller';

/** HTTP API process. */
@Module({
  imports: [
    ServicesModule,
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MIN ?? 300) }],
      // Only the automated test setup sets this; production refuses to start with it (bootstrap.ts).
      skipIf: () => process.env.THROTTLE_DISABLED === 'true',
    }),
  ],
  controllers: [HealthController, AuthController, OrganizationsController, AdminController, AppsController, FilesController, BudgetsController, AnalyticsController, AiController, AdminAiController, CreativesController,
    IntegrationsController, CampaignsController, AutomationController, AttributionController, ReportsController, NotificationsController, SupportController, BillingController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ApiLogInterceptor },
  ],
})
export class AppModule {}
