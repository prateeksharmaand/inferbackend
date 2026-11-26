import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { AuthUser, CurrentUser, NoOrg } from '../../common/decorators';
import { ORG_HEADER } from '../../common/guards/auth.guard';
import { Headers } from '@nestjs/common';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { NOTIFICATION_KINDS } from './notifications.service';

class PrefDto {
  @ApiProperty({ enum: Object.keys(NOTIFICATION_KINDS) }) @IsIn(Object.keys(NOTIFICATION_KINDS)) kind: string;
  @ApiProperty() @IsBoolean() inApp: boolean;
  @ApiProperty() @IsBoolean() email: boolean;
  @ApiPropertyOptional() @IsOptional() @IsObject() config?: Record<string, unknown>;
}
class PrefsDto { @ApiProperty({ type: [PrefDto] }) @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => PrefDto) preferences: PrefDto[]; }

/** A user's own notifications (RLS policy: user may only see their own rows). */
@ApiTags('Notifications') @ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @NoOrg() @Get() async list(@CurrentUser() u: AuthUser, @Query('unread') unread?: string) {
    const where = { userId: u.id, ...(unread === 'true' ? { readAt: null } : {}) };
    const [items, unreadCount] = await Promise.all([this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }), this.prisma.notification.count({ where: { userId: u.id, readAt: null } })]);
    return { items, unreadCount };
  }
  @NoOrg() @Post(':id/read') @HttpCode(204) async read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { await this.prisma.notification.updateMany({ where: { id, userId: u.id }, data: { readAt: new Date() } }); }
  @NoOrg() @Post('read-all') @HttpCode(204) async readAll(@CurrentUser() u: AuthUser) { await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } }); }

  @NoOrg() @Get('preferences') async prefs(@CurrentUser() u: AuthUser, @Headers(ORG_HEADER) orgId: string) {
    await this.member(u.id, orgId);
    const rows = await this.prisma.notificationPreference.findMany({ where: { organizationId: orgId, userId: u.id } });
    const by = new Map(rows.map((r) => [r.kind, r]));
    return Object.entries(NOTIFICATION_KINDS).map(([kind, label]) => ({ kind, label, inApp: by.get(kind)?.inApp ?? true, email: by.get(kind)?.email ?? ['report_ready', 'budget_threshold', 'campaign_failed', 'integration_expiring', 'unusual_spend', 'target_risk', 'tracking_failure', 'approval_needed', 'automation_stopped'].includes(kind), config: by.get(kind)?.config ?? {} }));
  }
  @NoOrg() @Put('preferences') @HttpCode(204) async setPrefs(@CurrentUser() u: AuthUser, @Headers(ORG_HEADER) orgId: string, @Body() dto: PrefsDto) {
    await this.member(u.id, orgId);
    await this.prisma.$transaction(dto.preferences.map((p) => this.prisma.notificationPreference.upsert({
      where: { organizationId_userId_kind: { organizationId: orgId, userId: u.id, kind: p.kind } },
      create: { organizationId: orgId, userId: u.id, kind: p.kind, inApp: p.inApp, email: p.email, config: (p.config ?? {}) as object }, update: { inApp: p.inApp, email: p.email, config: (p.config ?? {}) as object },
    })));
  }
  private async member(userId: string, orgId: string) {
    if (!orgId || !(await this.prisma.organizationMember.count({ where: { userId, organizationId: orgId } }))) throw new AppError('Select an organization you belong to', 403, 'forbidden');
  }
}
