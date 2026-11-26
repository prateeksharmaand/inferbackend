import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentOrg, CurrentUser, NoOrg, OrgContext, RequirePermission } from '../../common/decorators';
import { AppError } from '../../common/errors';
import { PageQuery } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { AutomationSwitchDto, BrandKitDto, ChangeRoleDto, CreateOrgDto, InviteDto, PolicyDto, UpdateOrgDto } from './dto';
import { OrganizationsService } from './organizations.service';

const same = (param: string, org: OrgContext) => {
  if (param !== org.id) throw new AppError('The organization in the URL does not match X-Organization-Id', 400, 'org_mismatch');
};

@ApiTags('Organizations') @ApiBearerAuth() @ApiHeader({ name: 'X-Organization-Id', required: false })
@Controller('organizations')
export class OrganizationsController {
  constructor(private orgs: OrganizationsService, private prisma: PrismaService) {}

  @NoOrg() @Get() @ApiOperation({ summary: 'Organizations the current user belongs to' })
  async list(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.organizationMember.findMany({
      where: { userId: u.id, organization: { deletedAt: null } },
      include: { organization: { select: { id: true, name: true, slug: true, status: true, createdAt: true } }, role: { select: { key: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({ ...m.organization, role: m.role }));
  }

  @NoOrg() @Post() @ApiOperation({ summary: 'Create another organization (you become its owner)' })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateOrgDto) { return this.orgs.create(dto, u.id); }

  @RequirePermission('apps.read') @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentOrg() org: OrgContext, @CurrentUser() u: AuthUser) { same(id, org); return this.orgs.get(id, u.id); }

  @RequirePermission('org.manage') @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @CurrentOrg() org: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: UpdateOrgDto) { same(id, org); return this.orgs.update(id, u.id, dto); }

  @RequirePermission('org.manage') @Put(':id/brand-kit')
  brandKit(@Param('id', ParseUUIDPipe) id: string, @CurrentOrg() org: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: BrandKitDto) { same(id, org); return this.orgs.updateBrandKit(id, u.id, dto); }

  @RequirePermission('apps.read') @Get(':id/members')
  members(@Param('id', ParseUUIDPipe) id: string, @CurrentOrg() org: OrgContext, @CurrentUser() u: AuthUser) { same(id, org); return this.orgs.members(id, u.id); }

  @RequirePermission('members.manage') @Post(':id/invitations')
  invite(@Param('id', ParseUUIDPipe) id: string, @CurrentOrg() org: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: InviteDto) { same(id, org); return this.orgs.invite(id, u.id, dto); }

  @RequirePermission('members.manage') @Delete(':id/invitations/:inviteId') @HttpCode(204)
  revokeInvite(@Param('id', ParseUUIDPipe) id: string, @Param('inviteId', ParseUUIDPipe) inviteId: string, @CurrentOrg() org: OrgContext, @CurrentUser() u: AuthUser) { same(id, org); return this.orgs.revokeInvite(id, u.id, inviteId); }

  @RequirePermission('members.manage') @Patch(':id/members/:memberId')
  changeRole(@Param('id', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string, @CurrentOrg() org: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: ChangeRoleDto) {
    same(id, org); return this.orgs.changeRole(id, u.id, memberId, dto.role, org.role);
  }

  @RequirePermission('members.manage') @Delete(':id/members/:memberId') @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string, @CurrentOrg() org: OrgContext, @CurrentUser() u: AuthUser) {
    same(id, org); return this.orgs.removeMember(id, u.id, memberId, org.role);
  }

  @RequirePermission('budgets.read') @Get(':id/automation-policy')
  policy(@Param('id', ParseUUIDPipe) id: string, @CurrentOrg() org: OrgContext, @CurrentUser() u: AuthUser) { same(id, org); return this.orgs.getPolicy(id, u.id); }

  @RequirePermission('automation.manage') @Patch(':id/automation-policy')
  updatePolicy(@Param('id', ParseUUIDPipe) id: string, @CurrentOrg() org: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: PolicyDto) { same(id, org); return this.orgs.updatePolicy(id, u.id, dto); }

  @RequirePermission('automation.manage') @Post(':id/automation')
  @ApiOperation({ summary: 'Organization-wide automation switch; enabled=false is the emergency stop' })
  automation(@Param('id', ParseUUIDPipe) id: string, @CurrentOrg() org: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: AutomationSwitchDto) { same(id, org); return this.orgs.setAutomation(id, u.id, dto.enabled, dto.reason); }

  @RequirePermission('org.manage') @Get(':id/audit-logs')
  audit(@Param('id', ParseUUIDPipe) id: string, @CurrentOrg() org: OrgContext, @Query() q: PageQuery) { same(id, org); return this.orgs.auditLog(id, q.page, q.pageSize); }
}
