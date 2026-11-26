import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, RequirePermission } from '../../common/decorators';
import { notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { BudgetEngine } from './budget-engine.service';

@ApiTags('Automation') @ApiBearerAuth() @ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('automation')
export class AutomationController {
  constructor(private engine: BudgetEngine, private prisma: PrismaService) {}

  @RequirePermission('campaigns.read') @Get('decisions') @ApiQuery({ name: 'outcome', required: false, enum: ['executed', 'proposed', 'blocked', 'failed', 'rejected'] })
  decisions(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query('outcome') outcome?: string) { return this.engine.list(o.id, u.id, outcome); }
  @RequirePermission('campaigns.launch') @Post('decisions/:id/approve') @HttpCode(200) approve(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.engine.decide(o.id, u.id, id, true); }
  @RequirePermission('campaigns.launch') @Post('decisions/:id/reject') @HttpCode(200) reject(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.engine.decide(o.id, u.id, id, false); }

  @RequirePermission('apps.read') @Get('workflows') @ApiQuery({ name: 'workflowKey', required: false })
  async runs(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query('workflowKey') key?: string) {
    const [defs, runs] = await Promise.all([
      this.prisma.automationWorkflow.findMany({ orderBy: { key: 'asc' } }),
      this.prisma.tenant(o.id, u.id, (tx) => tx.workflowExecution.findMany({ where: { organizationId: o.id, ...(key ? { workflowKey: key } : {}) }, orderBy: { createdAt: 'desc' }, take: 50 })),
    ]);
    return { workflows: defs.map((d) => ({ key: d.key, name: d.name, description: d.description, schedule: d.schedule, enabled: d.enabled })), runs };
  }
  @RequirePermission('apps.read') @Get('workflows/:id') async run(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.prisma.tenant(o.id, u.id, (tx) => tx.workflowExecution.findFirst({ where: { id, organizationId: o.id } }));
    if (!r) throw notFound('Workflow run');
    return r;
  }
}
