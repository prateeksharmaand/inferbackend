import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, RequirePermission } from '../../common/decorators';
import { CreativeQuery, DecisionDto, EditDto, GenerateDto, MediaDto } from './dto';
import { CreativesService } from './creatives.service';

@ApiTags('Creative studio') @ApiBearerAuth() @ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller()
export class CreativesController {
  constructor(private c: CreativesService) {}

  @RequirePermission('creatives.write') @Post('creatives/generate') @HttpCode(202) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Generate creative variants with the Creative agent (policy-checked; saved as pending drafts)' })
  generate(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: GenerateDto) { return this.c.generate(o.id, u.id, dto); }

  @RequirePermission('creatives.write') @Post('ai/creative/generate') @HttpCode(202) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Alias of POST /creatives/generate' })
  generateAlias(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: GenerateDto) { return this.c.generate(o.id, u.id, dto); }

  @RequirePermission('creatives.read') @Get('creatives') list(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query() q: CreativeQuery) { return this.c.list(o.id, u.id, q); }
  @RequirePermission('creatives.read') @Get('creatives/projects') @ApiQuery({ name: 'applicationId', required: false })
  projects(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query('applicationId', new ParseUUIDPipe({ optional: true })) appId?: string) { return this.c.projects(o.id, u.id, appId); }
  @RequirePermission('creatives.read') @Get('creatives/:id') get(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.c.get(o.id, u.id, id); }
  @RequirePermission('creatives.write') @Patch('creatives/:id') @ApiOperation({ summary: 'Edit text/prompt — creates a new version and resets approval' })
  edit(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditDto) { return this.c.edit(o.id, u.id, id, dto); }
  @RequirePermission('creatives.approve') @Post('creatives/:id/approve') @HttpCode(200) approve(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) { return this.c.decide(o.id, u.id, id, true, dto); }
  @RequirePermission('creatives.approve') @Post('creatives/:id/reject') @HttpCode(200) reject(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) { return this.c.decide(o.id, u.id, id, false, dto); }
  @RequirePermission('creatives.write') @Post('creatives/:id/image') @HttpCode(202) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  image(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MediaDto) { return this.c.requestMedia(o.id, u.id, id, 'image', dto); }
  @RequirePermission('creatives.write') @Post('creatives/:id/video') @HttpCode(202) @Throttle({ default: { limit: 3, ttl: 60_000 } })
  video(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MediaDto) { return this.c.requestMedia(o.id, u.id, id, 'video', dto); }
  @RequirePermission('creatives.write') @Delete('creatives/:id') @HttpCode(204) remove(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.c.remove(o.id, u.id, id); }
}
