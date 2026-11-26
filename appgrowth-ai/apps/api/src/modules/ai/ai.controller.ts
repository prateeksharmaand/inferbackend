import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, PlatformAdmin, RequirePermission } from '../../common/decorators';
import { AppError } from '../../common/errors';
import { AiService } from './ai.service';
import { AgentRunDto, AgentUpdateDto, AppTargetDto, DecideDto, ExecQuery, ModelDto, ProviderUpdateDto, StrategyRequestDto } from './dto';
import { AgentKey, LLM_AGENTS, Orchestrator } from './orchestrator.service';

@ApiTags('AI agents') @ApiBearerAuth() @ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('ai')
export class AiController {
  constructor(private orch: Orchestrator, private ai: AiService) {}

  @RequirePermission('ai.run') @Post('research') @HttpCode(202) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Queue market research for an app (Market Research agent, web-grounded where the provider supports it)' })
  research(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: AppTargetDto) {
    return this.orch.enqueue(o.id, 'market_research', { applicationId: dto.applicationId, instructions: dto.instructions }, { trigger: 'manual', requestedById: u.id });
  }

  @RequirePermission('ai.run') @Post('strategy') @HttpCode(202) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Queue a growth strategy (channel mix, CPI, budget, forecast) — saved as a plan awaiting approval' })
  strategy(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: StrategyRequestDto) {
    return this.orch.enqueue(o.id, 'campaign_strategy', { applicationId: dto.applicationId, instructions: dto.instructions, params: dto.month ? { month: dto.month } : undefined }, { trigger: 'manual', requestedById: u.id });
  }

  @RequirePermission('ai.run') @Post('campaign/recommend') @HttpCode(202) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Queue the Budget Optimization agent: per-campaign recommendations, applied only within policy' })
  recommend(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: AgentRunDto) {
    return this.orch.enqueue(o.id, 'budget_optimization', { applicationId: dto.applicationId, campaignId: dto.campaignId, instructions: dto.instructions }, { trigger: 'manual', requestedById: u.id });
  }

  @RequirePermission('ai.run') @Post('agents/:key/run') @HttpCode(202) @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Queue any LLM agent: aso (needs applicationId + platform), analytics, growth, retention, reporting, …' })
  run(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('key') key: string, @Body() dto: AgentRunDto) {
    if (!(LLM_AGENTS as readonly string[]).includes(key)) throw new AppError('Unknown agent', 404, 'not_found');
    if (key === 'creative') throw new AppError('Use POST /creatives/generate for the Creative agent', 400, 'use_creatives');
    if (key === 'aso' && (!dto.applicationId || !dto.platform)) throw new AppError('The ASO agent needs applicationId and platform', 400, 'missing_input');
    return this.orch.enqueue(o.id, key as AgentKey, { applicationId: dto.applicationId, campaignId: dto.campaignId, platform: dto.platform, instructions: dto.instructions }, { trigger: 'manual', requestedById: u.id });
  }

  @RequirePermission('apps.read') @Get('agents') agents(@CurrentOrg() o: OrgContext) { return this.ai.agents(o.id); }
  @RequirePermission('apps.read') @Get('executions') executions(@CurrentOrg() o: OrgContext, @Query() q: ExecQuery) { return this.ai.executions(o.id, q); }
  @RequirePermission('apps.read') @Get('executions/:id') execution(@CurrentOrg() o: OrgContext, @Param('id', ParseUUIDPipe) id: string) { return this.ai.execution(o.id, id); }
  @RequirePermission('ai.run') @Post('executions/:id/cancel') @HttpCode(204) cancel(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.orch.cancel(o.id, id, u.id); }
  @RequirePermission('ai.run') @Post('executions/:id/review') @HttpCode(204) review(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.ai.review(o.id, id, u.id); }

  @RequirePermission('apps.read') @Get('insights/:applicationId') insights(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('applicationId', ParseUUIDPipe) id: string) { return this.ai.insights(o.id, u.id, id); }
  @RequirePermission('campaigns.launch') @Post('strategies/:id/approve') @HttpCode(200) approve(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto) { return this.ai.decideStrategy(o.id, u.id, id, true, dto.comment); }
  @RequirePermission('campaigns.launch') @Post('strategies/:id/reject') @HttpCode(200) reject(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto) { return this.ai.decideStrategy(o.id, u.id, id, false, dto.comment); }
}

@ApiTags('Administration') @ApiBearerAuth()
@Controller('admin/ai')
export class AdminAiController {
  constructor(private ai: AiService) {}
  @PlatformAdmin({ allowSupport: true }) @Get('providers') providers() { return this.ai.providers(); }
  @PlatformAdmin() @Patch('providers/:key') provider(@Param('key') key: string, @Body() dto: ProviderUpdateDto, @CurrentUser() u: AuthUser) { return this.ai.updateProvider(key, dto, u.id); }
  @PlatformAdmin() @Put('providers/:key/models') model(@Param('key') key: string, @Body() dto: ModelDto, @CurrentUser() u: AuthUser) { return this.ai.upsertModel(key, dto, u.id); }
  @PlatformAdmin() @Post('providers/:key/check') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } }) check(@Param('key') key: string) { return this.ai.checkProvider(key); }
  @PlatformAdmin() @Patch('agents/:key') agent(@Param('key') key: string, @Body() dto: AgentUpdateDto, @CurrentUser() u: AuthUser) { return this.ai.updateAgent(key, dto, u.id); }
  @PlatformAdmin({ allowSupport: true }) @Get('agents') agents() { return this.ai.agentDefinitions(); }
  @PlatformAdmin({ allowSupport: true }) @Get('executions') executions(@Query() q: ExecQuery) { return this.ai.executions(null, q); }
  @PlatformAdmin({ allowSupport: true }) @Get('executions/:id') execution(@Param('id', ParseUUIDPipe) id: string) { return this.ai.execution(null, id); }
  @PlatformAdmin({ allowSupport: true }) @Get('usage') usage(@Query('days') days?: string) { return this.ai.usage(Math.min(365, Math.max(1, Number(days) || 30))); }
}
