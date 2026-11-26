import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseEnumPipe, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AnalyticsProviderKind } from '@prisma/client';
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, Public, RequirePermission } from '../../common/decorators';
import { notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { QUEUES, queue } from '../../queues/queues';
import { AttributionService } from './attribution.service';

class SourceDto {
  @ApiProperty({ example: { appId: 'id123456789' } }) @IsObject() config: Record<string, string>;
  @ApiPropertyOptional({ description: 'Provider API token / service-account JSON (stored encrypted)' }) @IsOptional() @IsString() @MaxLength(20000) secret?: string;
  @ApiPropertyOptional({ default: 7 }) @IsOptional() @IsInt() @Min(1) @Max(30) attributionWindowDays?: number;
}

@ApiTags('Attribution') @ApiBearerAuth() @ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller()
export class AttributionController {
  constructor(private a: AttributionService, private prisma: PrismaService) {}

  @RequirePermission('integrations.read') @Get('apps/:appId/attribution') sources(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('appId', ParseUUIDPipe) appId: string) { return this.a.sources(o.id, u.id, appId); }
  @RequirePermission('integrations.manage') @Put('apps/:appId/attribution/:provider') @ApiOperation({ summary: 'Configure Firebase / GA4 / AppsFlyer / Adjust for an app; returns the webhook URL and (once) its signing secret' })
  upsert(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('appId', ParseUUIDPipe) appId: string, @Param('provider', new ParseEnumPipe(AnalyticsProviderKind)) p: AnalyticsProviderKind, @Body() dto: SourceDto) { return this.a.upsertSource(o.id, u.id, appId, p, dto); }
  @RequirePermission('integrations.manage') @Delete('attribution/:id') @HttpCode(204) remove(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.a.removeSource(o.id, u.id, id); }
  @RequirePermission('integrations.manage') @Post('attribution/:id/pull') @HttpCode(202) @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async pull(@CurrentOrg() o: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    const s = await this.prisma.attributionSource.findFirst({ where: { id, organizationId: o.id } });
    if (!s) throw notFound('Source');
    const job = await queue(QUEUES.sync).add('attribution', { organizationId: o.id, sourceId: id }, { jobId: `attr:${id}:${Math.floor(Date.now() / 60_000)}` });
    return { queued: true, jobId: job.id };
  }

  /** Public, signature-verified ingestion endpoint for MMP / SDK / server events. */
  @Public() @SkipThrottle() @Throttle({ default: { limit: 600, ttl: 60_000 } }) @Post('ingest/:sourceId/events') @HttpCode(202)
  @ApiOperation({ summary: 'Ingest install/conversion events. Header X-AppGrowth-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>' })
  ingest(@Param('sourceId', ParseUUIDPipe) id: string, @Headers('x-appgrowth-signature') sig: string | undefined, @Req() req: Request & { rawBody?: Buffer }) { return this.a.verifyAndIngest(id, req.rawBody, sig); }
}
