import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, RequirePermission } from '../../common/decorators';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto, MonthQuery, UpdateBudgetDto } from './dto';

@ApiTags('Budgets') @ApiBearerAuth() @ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('budgets')
export class BudgetsController {
  constructor(private budgets: BudgetsService) {}
  @RequirePermission('budgets.read') @Get() list(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser) { return this.budgets.list(o.id, u.id); }
  @RequirePermission('budgets.write') @Post() @ApiOperation({ summary: 'Set the advertising budget for a month (customer-controlled; separate from the subscription)' })
  create(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: CreateBudgetDto) { return this.budgets.create(o.id, u.id, dto); }
  @RequirePermission('budgets.read') @Get('spend') @ApiOperation({ summary: 'Spend vs budget for a month, by day, campaign and channel, with discrepancy check' })
  spend(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query() q: MonthQuery) { return this.budgets.spend(o.id, u.id, q.month); }
  @RequirePermission('budgets.read') @Get('forecast') @ApiQuery({ name: 'applicationId', required: false })
  forecast(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query('applicationId', new ParseUUIDPipe({ optional: true })) appId?: string) { return this.budgets.forecast(o.id, u.id, appId); }
  @RequirePermission('budgets.write') @Patch(':id')
  update(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBudgetDto) { return this.budgets.update(o.id, u.id, id, dto); }
}
