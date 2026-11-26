import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, PlatformAdmin } from '../../common/decorators';
import { PageQuery } from '../../common/pagination';
import { AdminService } from './admin.service';
import { StorageService } from '../storage/storage.service';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class ReadinessDto { @ApiProperty({ enum: ['not_configured', 'configured', 'implemented_unverified', 'verified'] }) @IsIn(['not_configured', 'configured', 'implemented_unverified', 'verified']) readiness: string; @ApiProperty() @IsString() @MaxLength(500) note: string; }
import { AssignPlanDto, AuditQuery, FlagDto, OrgListQuery, PlanUpdateDto, SuspendDto } from './dto';

@ApiTags('Administration') @ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService, private storage: StorageService) {}

  @PlatformAdmin({ allowSupport: true }) @Get('dashboard') @ApiOperation({ summary: 'Platform metrics for the current month' })
  dashboard() { return this.admin.dashboard(); }

  @PlatformAdmin({ allowSupport: true }) @Get('organizations')
  organizations(@Query() q: OrgListQuery) { return this.admin.organizations(q); }

  @PlatformAdmin({ allowSupport: true }) @Get('organizations/:id')
  organization(@Param('id', ParseUUIDPipe) id: string) { return this.admin.organization(id); }

  @PlatformAdmin() @Post('organizations/:id/suspend') @HttpCode(200) @ApiOperation({ summary: 'Suspend: read-only for members and automation stopped' })
  suspend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SuspendDto, @CurrentUser() u: AuthUser) { return this.admin.setStatus(id, 'SUSPENDED', u.id, dto.reason); }

  @PlatformAdmin() @Post('organizations/:id/reactivate') @HttpCode(200)
  reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.admin.setStatus(id, 'ACTIVE', u.id); }

  @PlatformAdmin() @Put('organizations/:id/plan')
  assignPlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignPlanDto, @CurrentUser() u: AuthUser) { return this.admin.assignPlan(id, dto.planKey, u.id); }

  @PlatformAdmin({ allowSupport: true }) @Get('users')
  users(@Query() q: PageQuery) { return this.admin.users(q); }

  @PlatformAdmin() @Post('users/:id/disable') @HttpCode(200)
  disableUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.admin.setUserStatus(id, 'DISABLED', u.id); }

  @PlatformAdmin() @Post('users/:id/enable') @HttpCode(200)
  enableUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.admin.setUserStatus(id, 'ACTIVE', u.id); }

  @PlatformAdmin({ allowSupport: true }) @Get('system/health')
  health() { return this.admin.systemHealth(); }

  @PlatformAdmin({ allowSupport: true }) @Get('system/jobs')
  jobs() { return this.admin.queueStats(); }

  @PlatformAdmin({ allowSupport: true }) @Get('system/jobs/:queue/failed')
  failed(@Param('queue') name: string) { return this.admin.failedJobs(name); }

  @PlatformAdmin() @Post('system/jobs/:queue/:id/retry') @HttpCode(204)
  retry(@Param('queue') name: string, @Param('id') id: string, @CurrentUser() u: AuthUser) { return this.admin.retryJob(name, id, u.id); }

  @PlatformAdmin({ allowSupport: true }) @Get('audit-logs')
  audit(@Query() q: AuditQuery) { return this.admin.auditLogs(q); }

  @PlatformAdmin({ allowSupport: true }) @Get('plans')
  plans() { return this.admin.plans(); }

  @PlatformAdmin() @Patch('plans/:key')
  updatePlan(@Param('key') key: string, @Body() dto: PlanUpdateDto, @CurrentUser() u: AuthUser) { return this.admin.updatePlan(key, dto, u.id); }

  @PlatformAdmin({ allowSupport: true }) @Get('feature-flags')
  flags() { return this.admin.flags(); }

  @PlatformAdmin() @Put('feature-flags/:key')
  setFlag(@Param('key') key: string, @Body() dto: FlagDto, @CurrentUser() u: AuthUser) { return this.admin.setFlag(key, dto.enabled, u.id); }

  @PlatformAdmin({ allowSupport: true }) @Get('campaigns') campaigns(@Query() q: PageQuery, @Query('status') status?: string, @Query('provider') provider?: string) { return this.admin.campaigns({ ...q, status, provider }); }
  @PlatformAdmin({ allowSupport: true }) @Get('integrations') integrations() { return this.admin.integrationsHealth(); }
  @PlatformAdmin() @Put('integrations/:key/readiness') readiness(@Param('key') key: string, @Body() dto: ReadinessDto, @CurrentUser() u: AuthUser) { return this.admin.setProviderReadiness(key, dto.readiness, dto.note, u.id); }
  @PlatformAdmin({ allowSupport: true }) @Get('usage') usage() { return this.admin.usage(this.storage); }
  @PlatformAdmin({ allowSupport: true }) @Get('system/errors') errors() { return this.admin.errorLogs(); }
}
