import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, RequirePermission } from '../../common/decorators';
import { AppError } from '../../common/errors';
import { WorkflowStarter } from '../workflows/workflow-starter.service';
import { CampaignsService } from './campaigns.service';
import { CampaignQuery, CreateCampaignDto, ReasonDto, UpdateCampaignDto } from './dto';

@ApiTags('Campaigns') @ApiBearerAuth() @ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('campaigns')
export class CampaignsController {
  constructor(private c: CampaignsService, private starter: WorkflowStarter) {}

  @RequirePermission('campaigns.read') @Get() list(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query() q: CampaignQuery) { return this.c.list(o.id, u.id, q); }
  @RequirePermission('campaigns.write') @Post() @ApiOperation({ summary: 'Create a DRAFT campaign (nothing is created on the ad platform until launch)' })
  create(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: CreateCampaignDto) { return this.c.create(o.id, u.id, dto); }
  @RequirePermission('campaigns.write') @Post('from-strategy/:strategyId') @HttpCode(202) @ApiOperation({ summary: 'Workflow B: draft campaigns + creatives from an approved strategy' })
  async fromStrategy(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('strategyId', ParseUUIDPipe) sid: string) {
    const r = await this.starter.start({ organizationId: o.id, key: 'campaign_creation', idempotencyKey: `campaign_creation:${sid}`, subjectType: 'strategy', subjectId: sid, input: { strategyId: sid, requestedBy: u.id } });
    return { executionId: r.execution.id, alreadyStarted: !r.created };
  }
  @RequirePermission('campaigns.read') @Get(':id') get(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.c.get(o.id, u.id, id); }
  @RequirePermission('campaigns.write') @Patch(':id') update(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCampaignDto) { return this.c.update(o.id, u.id, id, dto); }
  @RequirePermission('campaigns.write') @Post(':id/submit') @HttpCode(200) submit(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.c.transition(o.id, u.id, id, 'PENDING_APPROVAL'); }
  @RequirePermission('campaigns.launch') @Post(':id/approve') @HttpCode(200) approve(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.c.transition(o.id, u.id, id, 'READY'); }
  @RequirePermission('campaigns.write') @Post(':id/return-to-draft') @HttpCode(200) toDraft(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.c.transition(o.id, u.id, id, 'DRAFT', dto.reason); }
  @RequirePermission('campaigns.launch') @Post(':id/launch') @HttpCode(202) @ApiOperation({ summary: 'Create on the ad platform (if needed) and activate — spend policy checked twice' })
  launch(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.c.queueAction(o.id, `user:${u.id}`, id, 'launch'); }
  @RequirePermission('campaigns.launch') @Post(':id/pause') @HttpCode(202) pause(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.c.queueAction(o.id, `user:${u.id}`, id, 'pause', { reason: dto.reason ?? 'Paused by user' }); }
  @RequirePermission('campaigns.launch') @Post(':id/resume') @HttpCode(202) resume(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.c.queueAction(o.id, `user:${u.id}`, id, 'resume'); }
  @RequirePermission('campaigns.read') @Post(':id/refresh') @HttpCode(202) refresh(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.c.queueAction(o.id, `user:${u.id}`, id, 'sync_status'); }
  @RequirePermission('campaigns.launch') @Post(':id/complete') @HttpCode(200) complete(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.c.get(o.id, u.id, id).then((c) => { if (c.status === 'ACTIVE') throw new AppError('Pause the campaign before completing it', 409, 'pause_first'); return this.c.transition(o.id, u.id, id, 'COMPLETED'); });
  }
  @RequirePermission('campaigns.write') @Post(':id/archive') @HttpCode(204) archive(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.c.archive(o.id, u.id, id); }
}
