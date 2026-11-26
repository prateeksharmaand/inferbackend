import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import { AppError, notFound } from '../../common/errors';
import { fromMinor, toMinor } from '../../common/money';
import { PrismaService, Tx } from '../../common/prisma.service';
import { MailService } from '../mail/mail.service';
import type { BrandKitDto, CreateOrgDto, InviteDto, PolicyDto, UpdateOrgDto } from './dto';

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private crypto: CryptoService, private mail: MailService) {}

  /** Creates the org, owner membership, trial subscription, default automation policy and brand kit. Owner-role tx. */
  async createWithOwner(tx: Tx, dto: CreateOrgDto, userId: string) {
    const owner = await tx.role.findUnique({ where: { key: 'owner' } });
    const trial = await tx.subscriptionPlan.findUnique({ where: { key: 'free_trial' } });
    if (!owner || !trial) throw new AppError('Platform is not initialised (run the seed)', 503, 'not_initialised');
    const slug = `${slugify(dto.name)}-${this.crypto.token(4).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)}`;
    const org = await tx.organization.create({
      data: { name: dto.name, slug, currency: dto.currency ?? 'INR', country: dto.country ?? 'IN', timezone: dto.timezone ?? 'Asia/Kolkata' },
    });
    const now = new Date();
    const end = new Date(now.getTime() + trial.trialDays * 86_400_000);
    await tx.organizationMember.create({ data: { organizationId: org.id, userId, roleId: owner.id } });
    const sub = await tx.subscription.create({ data: { organizationId: org.id, planId: trial.id, status: 'TRIALING', currentPeriodStart: now, currentPeriodEnd: end, trialEndsAt: end } });
    await tx.subscriptionTransaction.create({ data: { organizationId: org.id, subscriptionId: sub.id, kind: 'created', toPlanKey: trial.key, actor: `user:${userId}` } });
    await tx.automationPolicy.create({ data: { organizationId: org.id, allowedProviders: ['GOOGLE_ADS', 'APPLE_ADS', 'META_ADS', 'TIKTOK_ADS'] } });
    await tx.brandKit.create({ data: { organizationId: org.id, bannedClaims: [] } });
    return org;
  }

  async create(dto: CreateOrgDto, userId: string) {
    const owned = await this.prisma.organizationMember.count({ where: { userId, role: { key: 'owner' }, organization: { deletedAt: null } } });
    if (owned >= 10) throw new AppError('You can own at most 10 organizations. Contact support for an agency account.', 403, 'limit_reached');
    const org = await this.prisma.$transaction((tx) => this.createWithOwner(tx, dto, userId));
    await this.audit.record({ organizationId: org.id, actorUserId: userId, actor: `user:${userId}`, action: 'organization.created', entityType: 'organization', entityId: org.id, after: dto });
    return org;
  }

  get(orgId: string, userId: string) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: orgId } });
      if (!org) throw notFound('Organization');
      const [members, sub, kit] = await Promise.all([
        tx.organizationMember.count({ where: { organizationId: orgId } }),
        tx.subscription.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' }, include: { plan: true } }),
        tx.brandKit.findUnique({ where: { organizationId: orgId } }),
      ]);
      return { ...org, memberCount: members, subscription: sub, brandKit: kit };
    });
  }

  update(orgId: string, userId: string, dto: UpdateOrgDto) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
      const org = await tx.organization.update({ where: { id: orgId }, data: dto });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'organization.updated', entityType: 'organization', entityId: orgId, before: { name: before.name, currency: before.currency, country: before.country, timezone: before.timezone }, after: dto }, tx);
      return org;
    });
  }

  updateBrandKit(orgId: string, userId: string, dto: BrandKitDto) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const kit = await tx.brandKit.upsert({ where: { organizationId: orgId }, create: { organizationId: orgId, bannedClaims: dto.bannedClaims ?? [], colors: dto.colors ?? [], voice: dto.voice ?? '', guidelines: dto.guidelines ?? '' }, update: dto });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'brand_kit.updated', entityType: 'brand_kit', entityId: orgId, after: dto }, tx);
      return kit;
    });
  }

  // ── members ──
  async members(orgId: string, userId: string) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const rows = await tx.organizationMember.findMany({ where: { organizationId: orgId }, include: { user: { select: { id: true, email: true, name: true, status: true } }, role: { select: { key: true, name: true } } }, orderBy: { createdAt: 'asc' } });
      const invites = await tx.invitation.findMany({ where: { organizationId: orgId, acceptedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, email: true, roleKey: true, expiresAt: true, createdAt: true } });
      return { members: rows.map((m) => ({ id: m.id, user: m.user, role: m.role, joinedAt: m.createdAt })), invitations: invites };
    });
  }

  async invite(orgId: string, userId: string, dto: InviteDto) {
    const email = dto.email.trim().toLowerCase();
    const [org, sub, count] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
      this.prisma.subscription.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' }, include: { plan: true } }),
      this.prisma.organizationMember.count({ where: { organizationId: orgId } }),
    ]);
    if (sub && count >= sub.plan.maxMembers) throw new AppError(`Your ${sub.plan.name} plan allows ${sub.plan.maxMembers} members. Upgrade to add more.`, 403, 'plan_limit');
    const existing = await this.prisma.organizationMember.findFirst({ where: { organizationId: orgId, user: { email } } });
    if (existing) throw new AppError('This person is already a member', 409, 'already_member');
    const token = this.crypto.token(32);
    await this.prisma.tenant(orgId, userId, async (tx) => {
      await tx.invitation.deleteMany({ where: { organizationId: orgId, email, acceptedAt: null } });
      await tx.invitation.create({ data: { organizationId: orgId, email, roleKey: dto.role, tokenHash: this.crypto.sha256(token), invitedById: userId, expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'member.invited', entityType: 'invitation', after: { email, role: dto.role } }, tx);
    });
    const sent = await this.mail.send(email, `You're invited to ${org.name} on AppGrowth AI`, [
      `You've been invited to join ${org.name} on AppGrowth AI as ${dto.role}.`, 'The invitation is valid for 7 days.',
    ], { label: 'Accept invitation', url: `${process.env.PUBLIC_URL}/accept-invite?token=${token}` });
    return { emailSent: sent, ...(sent ? {} : { inviteUrl: `${process.env.PUBLIC_URL}/accept-invite?token=${token}` }) };
  }

  async changeRole(orgId: string, actorId: string, memberId: string, roleKey: string, actorRole: string) {
    if (roleKey === 'owner' && actorRole !== 'owner') throw new AppError('Only an owner can make someone an owner', 403, 'forbidden');
    return this.prisma.tenant(orgId, actorId, async (tx) => {
      const m = await tx.organizationMember.findFirst({ where: { id: memberId, organizationId: orgId }, include: { role: true } });
      if (!m) throw notFound('Member');
      if (m.role.key === 'owner' && actorRole !== 'owner') throw new AppError('Only an owner can change another owner', 403, 'forbidden');
      if (m.role.key === 'owner' && roleKey !== 'owner') await this.assertAnotherOwner(tx, orgId, m.userId);
      const role = await tx.role.findUniqueOrThrow({ where: { key: roleKey } });
      await tx.organizationMember.update({ where: { id: m.id }, data: { roleId: role.id } });
      await this.audit.record({ organizationId: orgId, actorUserId: actorId, actor: `user:${actorId}`, action: 'member.role_changed', entityType: 'member', entityId: m.id, before: { role: m.role.key }, after: { role: roleKey } }, tx);
    });
  }

  async removeMember(orgId: string, actorId: string, memberId: string, actorRole: string) {
    return this.prisma.tenant(orgId, actorId, async (tx) => {
      const m = await tx.organizationMember.findFirst({ where: { id: memberId, organizationId: orgId }, include: { role: true } });
      if (!m) throw notFound('Member');
      if (m.role.key === 'owner') {
        if (actorRole !== 'owner') throw new AppError('Only an owner can remove an owner', 403, 'forbidden');
        await this.assertAnotherOwner(tx, orgId, m.userId);
      }
      await tx.organizationMember.delete({ where: { id: m.id } });
      await this.audit.record({ organizationId: orgId, actorUserId: actorId, actor: `user:${actorId}`, action: 'member.removed', entityType: 'member', entityId: m.id, before: { userId: m.userId, role: m.role.key } }, tx);
    });
  }

  async revokeInvite(orgId: string, actorId: string, inviteId: string) {
    return this.prisma.tenant(orgId, actorId, async (tx) => {
      const r = await tx.invitation.deleteMany({ where: { id: inviteId, organizationId: orgId, acceptedAt: null } });
      if (!r.count) throw notFound('Invitation');
    });
  }

  private async assertAnotherOwner(tx: Tx, orgId: string, exceptUserId: string) {
    const others = await tx.organizationMember.count({ where: { organizationId: orgId, role: { key: 'owner' }, userId: { not: exceptUserId } } });
    if (!others) throw new AppError('An organization needs at least one owner', 409, 'last_owner');
  }

  // ── automation policy / safety switches ──
  private policyView(p: Prisma.AutomationPolicyGetPayload<object>, org: { automationEnabled: boolean; emergencyStopAt: Date | null; currency: string }) {
    return {
      autonomyLevel: p.autonomyLevel, currency: org.currency,
      maxDailySpend: fromMinor(p.maxDailySpendMinor), maxMonthlySpend: fromMinor(p.maxMonthlySpendMinor), maxCampaignBudget: fromMinor(p.maxCampaignBudgetMinor),
      maxBudgetIncreasePct: p.maxBudgetIncreasePct, maxConcurrentCampaigns: p.maxConcurrentCampaigns, reservePct: p.reservePct,
      allowedProviders: p.allowedProviders, autoPauseOnCpiMultiple: Number(p.autoPauseOnCpiMultiple),
      automationEnabled: org.automationEnabled, emergencyStopAt: org.emergencyStopAt, updatedAt: p.updatedAt,
    };
  }

  getPolicy(orgId: string, userId: string) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const [p, org] = await Promise.all([tx.automationPolicy.findUniqueOrThrow({ where: { organizationId: orgId } }), tx.organization.findUniqueOrThrow({ where: { id: orgId } })]);
      return this.policyView(p, org);
    });
  }

  updatePolicy(orgId: string, userId: string, dto: PolicyDto) {
    const m = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : toMinor(v));
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const before = await tx.automationPolicy.findUniqueOrThrow({ where: { organizationId: orgId } });
      const p = await tx.automationPolicy.update({
        where: { organizationId: orgId },
        data: {
          autonomyLevel: dto.autonomyLevel, maxDailySpendMinor: m(dto.maxDailySpend), maxMonthlySpendMinor: m(dto.maxMonthlySpend),
          maxCampaignBudgetMinor: m(dto.maxCampaignBudget), maxBudgetIncreasePct: dto.maxBudgetIncreasePct, maxConcurrentCampaigns: dto.maxConcurrentCampaigns,
          reservePct: dto.reservePct, allowedProviders: dto.allowedProviders, autoPauseOnCpiMultiple: dto.autoPauseOnCpiMultiple, updatedById: userId,
        },
      });
      const org = await tx.organization.update({ where: { id: orgId }, data: dto.autonomyLevel ? { autonomyLevel: dto.autonomyLevel } : {} });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'automation_policy.updated', entityType: 'automation_policy', entityId: orgId, before, after: p }, tx);
      return this.policyView(p, org);
    });
  }

  /** Organization-wide automation switch. Turning it off sets the emergency stop: workers then refuse every mutating action. */
  setAutomation(orgId: string, userId: string, enabled: boolean, reason?: string) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const org = await tx.organization.update({ where: { id: orgId }, data: { automationEnabled: enabled, emergencyStopAt: enabled ? null : new Date() } });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: enabled ? 'automation.resumed' : 'automation.emergency_stop', entityType: 'organization', entityId: orgId, after: { reason }, security: !enabled }, tx);
      return { automationEnabled: org.automationEnabled, emergencyStopAt: org.emergencyStopAt };
    });
  }

  /** audit_logs has a nullable org (platform events), so it isn't under RLS: read with the owner role, always filtered by org. */
  async auditLog(orgId: string, page: number, pageSize: number) {
    const where = { organizationId: orgId };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }
}
