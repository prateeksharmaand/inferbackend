import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiPropertyOptional, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import type { Response } from 'express';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, RequirePermission } from '../../common/decorators';
import { PageQuery } from '../../common/pagination';
import { ReportKind, ReportsService } from './reports.service';

const KINDS = ['daily', 'weekly', 'monthly', 'budget', 'campaign', 'installs', 'recommendations'];
class GenerateReportDto {
  @ApiProperty({ enum: KINDS }) @IsIn(KINDS) kind: ReportKind;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() applicationId?: string;
}
class ReportQuery extends PageQuery { @ApiPropertyOptional({ enum: KINDS }) @IsOptional() @IsIn(KINDS) kind?: string; }

@ApiTags('Reports') @ApiBearerAuth() @ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('reports')
export class ReportsController {
  constructor(private r: ReportsService) {}
  @RequirePermission('reports.read') @Get() list(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query() q: ReportQuery) { return this.r.list(o.id, u.id, q); }
  @RequirePermission('reports.write') @Post('generate') @HttpCode(202) @Throttle({ default: { limit: 10, ttl: 60_000 } }) generate(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: GenerateReportDto) { return this.r.request(o.id, u.id, dto.kind, dto); }
  @RequirePermission('reports.read') @Get(':id') get(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.r.get(o.id, u.id, id); }
  @RequirePermission('reports.read') @Get(':id/download') async download(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('format') format: string, @Res() res: Response) {
    const url = await this.r.downloadUrl(o.id, u.id, id, format === 'csv' ? 'csv' : 'pdf');
    res.json({ url });
  }
}
