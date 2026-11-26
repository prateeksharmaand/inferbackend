import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Prisma, TicketStatus } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, PlatformAdmin, RequirePermission } from '../../common/decorators';
import { AppError, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

class OpenDto { @ApiProperty() @IsString() @Length(4, 200) subject: string; @ApiProperty() @IsString() @Length(4, 5000) body: string; @ApiPropertyOptional({ enum: ['low', 'normal', 'high', 'urgent'] }) @IsOptional() @IsIn(['low', 'normal', 'high', 'urgent']) priority?: string; }
class ReplyDto { @ApiProperty() @IsString() @Length(1, 5000) body: string; }
class AdminTicketDto { @ApiPropertyOptional({ enum: TicketStatus }) @IsOptional() @IsIn(Object.values(TicketStatus)) status?: TicketStatus; @ApiPropertyOptional() @IsOptional() @IsUUID() assignedToId?: string; @ApiPropertyOptional() @IsOptional() @IsIn(['low', 'normal', 'high', 'urgent']) priority?: string; }
type Msg = { authorId: string; authorName: string; body: string; at: string; staff: boolean };

@ApiTags('Support') @ApiBearerAuth() @ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller()
export class SupportController {
  constructor(private prisma: PrismaService, private audit: AuditService, private notify: NotificationsService) {}

  @RequirePermission('apps.read') @Get('support/tickets') list(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser) { return this.prisma.tenant(o.id, u.id, (tx) => tx.supportTicket.findMany({ where: { organizationId: o.id }, orderBy: { updatedAt: 'desc' }, take: 100 })); }
  @RequirePermission('apps.read') @Post('support/tickets') async open(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: OpenDto) {
    const t = await this.prisma.tenant(o.id, u.id, (tx) => tx.supportTicket.create({ data: { organizationId: o.id, openedById: u.id, subject: dto.subject, priority: dto.priority ?? 'normal', messages: [{ authorId: u.id, authorName: u.name, body: dto.body, at: new Date().toISOString(), staff: false }] } }));
    await this.notify.notifyPlatformAdmins(`New support ticket: ${dto.subject}`, `${u.name} (${u.email}) opened a ${dto.priority ?? 'normal'} priority ticket.`, `ticket:${t.id}`);
    return t;
  }
  @RequirePermission('apps.read') @Post('support/tickets/:id/reply') async reply(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplyDto) {
    return this.prisma.tenant(o.id, u.id, async (tx) => {
      const t = await tx.supportTicket.findFirst({ where: { id, organizationId: o.id } });
      if (!t) throw notFound('Ticket');
      if (t.status === 'CLOSED') throw new AppError('This ticket is closed; open a new one', 409, 'closed');
      return tx.supportTicket.update({ where: { id }, data: { status: 'OPEN', messages: [...(t.messages as Msg[]), { authorId: u.id, authorName: u.name, body: dto.body, at: new Date().toISOString(), staff: false }] as unknown as Prisma.InputJsonValue } });
    });
  }

  @PlatformAdmin({ allowSupport: true }) @Get('admin/support/tickets') adminList(@Query('status') status?: TicketStatus) {
    return this.prisma.supportTicket.findMany({ where: status ? { status } : {}, orderBy: [{ updatedAt: 'desc' }], take: 200 });
  }
  @PlatformAdmin({ allowSupport: true }) @Post('admin/support/tickets/:id/reply') async adminReply(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplyDto) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t) throw notFound('Ticket');
    const updated = await this.prisma.supportTicket.update({ where: { id }, data: { status: 'WAITING_CUSTOMER', messages: [...(t.messages as Msg[]), { authorId: u.id, authorName: `${u.name} (Nous support)`, body: dto.body, at: new Date().toISOString(), staff: true }] as unknown as Prisma.InputJsonValue } });
    const opener = await this.prisma.organizationMember.findFirst({ where: { organizationId: t.organizationId, userId: t.openedById } });
    if (opener) await this.prisma.notification.create({ data: { organizationId: t.organizationId, userId: t.openedById, kind: 'support', title: `Support replied: ${t.subject}`, body: dto.body.slice(0, 300), link: '/support' } });
    await this.audit.record({ organizationId: t.organizationId, actorUserId: u.id, actor: `user:${u.id}`, action: 'admin.support_replied', entityType: 'support_ticket', entityId: id });
    return updated;
  }
  @PlatformAdmin({ allowSupport: true }) @Patch('admin/support/tickets/:id') @HttpCode(200) adminUpdate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminTicketDto) { return this.prisma.supportTicket.update({ where: { id }, data: dto }); }
}
