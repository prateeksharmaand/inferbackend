import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, RequirePermission } from '../../common/decorators';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQuery } from './dto';

@ApiTags('Analytics') @ApiBearerAuth() @ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('analytics')
export class AnalyticsController {
  constructor(private a: AnalyticsService) {}
  @RequirePermission('analytics.read') @Get('overview') @ApiOperation({ summary: 'Dashboard totals, daily series, target achievement, budget and recommendations' })
  overview(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query() q: AnalyticsQuery) { return this.a.overview(o.id, u.id, q); }
  @RequirePermission('analytics.read') @Get('installs') installs(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query() q: AnalyticsQuery) { return this.a.installs(o.id, u.id, q); }
  @RequirePermission('analytics.read') @Get('campaigns') campaigns(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query() q: AnalyticsQuery) { return this.a.campaigns(o.id, u.id, q); }
  @RequirePermission('analytics.read') @Get('countries') countries(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query() q: AnalyticsQuery) { return this.a.countries(o.id, u.id, q); }
  @RequirePermission('analytics.read') @Get('retention') retention(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query() q: AnalyticsQuery) { return this.a.retention(o.id, u.id, q); }
  @RequirePermission('analytics.read') @Get('cpi') cpi(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query() q: AnalyticsQuery) { return this.a.cpi(o.id, u.id, q); }
}
