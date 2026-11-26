import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { MailService } from '../mail/mail.service';
import { OrganizationsService } from '../organizations/organizations.service';
import type { LoginDto, RegisterDto } from './dto';

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 30 * 24 * 3600;
const MAX_FAILED = 5;
const LOCK_MIN = 15;
// Argon2id, OWASP-recommended parameters (19 MiB, 2 iterations).
const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
// A fixed hash to compare against when the email is unknown, so timing doesn't reveal which emails exist.
let DUMMY_HASH: Promise<string> | null = null;

export interface IssuedTokens { accessToken: string; refreshToken: string; expiresIn: number; sessionId: string }
interface Ctx { ip?: string; userAgent?: string }

authenticator.options = { window: 1 };

@Injectable()
export class AuthService {
  private log = new Logger('Auth');
  constructor(
    private prisma: PrismaService, private jwt: JwtService, private crypto: CryptoService, private audit: AuditService,
    private mail: MailService, private orgs: OrganizationsService,
  ) {}

  hashPassword(p: string) { return argon2.hash(p, ARGON); }

  async register(dto: RegisterDto, ctx: Ctx) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new AppError('An account with this email already exists. Sign in instead.', 409, 'email_taken');
    const passwordHash = await this.hashPassword(dto.password);
    const { user, org } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, name: dto.name.trim(), passwordHash } });
      const org = await this.orgs.createWithOwner(tx, { name: dto.organizationName.trim() }, user.id);
      return { user, org };
    });
    await this.audit.record({ organizationId: org.id, actorUserId: user.id, actor: `user:${user.id}`, action: 'auth.register', entityType: 'user', entityId: user.id, ip: ctx.ip });
    const tokens = await this.startSession(user.id, false, ctx, org.id);
    return { tokens, user: { id: user.id, email, name: user.name }, organization: { id: org.id, name: org.name, slug: org.slug } };
  }

  async login(dto: LoginDto, ctx: Ctx): Promise<IssuedTokens> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const fail = async (reason: string) => {
      await this.audit.record({ actorUserId: user?.id, actor: user ? `user:${user.id}` : 'anonymous', action: 'auth.login_failed', after: { email, reason }, ip: ctx.ip, security: true });
      return new AppError('Incorrect email or password', 401, 'invalid_credentials');
    };
    if (!user || !user.passwordHash || user.deletedAt) {
      DUMMY_HASH ??= this.hashPassword('not-a-real-password-0A');
      await argon2.verify(await DUMMY_HASH, dto.password).catch(() => false);
      throw await fail('unknown_user');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(`Too many failed attempts. Try again after ${user.lockedUntil.toISOString()}.`, HttpStatus.TOO_MANY_REQUESTS, 'account_locked');
    }
    if (user.status === 'DISABLED') throw new AppError('This account is disabled', 403, 'account_disabled');
    if (!(await argon2.verify(user.passwordHash, dto.password))) {
      const failed = user.failedLogins + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MIN * 60_000) : null },
      });
      if (failed >= MAX_FAILED) await this.audit.record({ actorUserId: user.id, actor: `user:${user.id}`, action: 'auth.account_locked', ip: ctx.ip, security: true });
      throw await fail('bad_password');
    }
    let mfaVerified = false;
    if (user.mfaEnabledAt && user.mfaSecretEnc) {
      if (!dto.mfaCode) throw new AppError('Enter the 6-digit code from your authenticator app', 401, 'mfa_required');
      if (!authenticator.check(dto.mfaCode, this.crypto.decrypt(user.mfaSecretEnc))) throw await fail('bad_mfa');
      mfaVerified = true;
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.audit.record({ actorUserId: user.id, actor: `user:${user.id}`, action: 'auth.login', ip: ctx.ip, security: true });
    return this.startSession(user.id, mfaVerified, ctx);
  }

  private async startSession(userId: string, mfaVerified: boolean, ctx: Ctx, organizationId?: string): Promise<IssuedTokens> {
    const session = await this.prisma.userSession.create({
      data: { userId, mfaVerified, ip: ctx.ip, userAgent: ctx.userAgent?.slice(0, 300), organizationId },
    });
    return this.issue(session.id, userId);
  }

  private async issue(sessionId: string, userId: string): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync({ sub: userId, sid: sessionId, typ: 'access' }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: ACCESS_TTL_SEC, algorithm: 'HS256' });
    const refreshToken = this.crypto.token(48);
    await this.prisma.refreshToken.create({ data: { sessionId, tokenHash: this.crypto.sha256(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000) } });
    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SEC, sessionId };
  }

  /** Rotation with reuse detection: a refresh token works once; replaying a used one revokes the whole session. */
  async refresh(token: string | undefined, ctx: Ctx): Promise<IssuedTokens> {
    if (!token) throw new AppError('Not signed in', 401, 'unauthorized');
    const rt = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.crypto.sha256(token) }, include: { session: { include: { user: true } } } });
    if (!rt) throw new AppError('Session expired', 401, 'session_expired');
    if (rt.usedAt) {
      await this.prisma.userSession.update({ where: { id: rt.sessionId }, data: { revokedAt: new Date() } });
      await this.audit.record({ actorUserId: rt.session.userId, actor: `user:${rt.session.userId}`, action: 'auth.refresh_token_reuse', entityType: 'session', entityId: rt.sessionId, ip: ctx.ip, security: true });
      throw new AppError('Session revoked for your security. Please sign in again.', 401, 'token_reuse');
    }
    if (rt.expiresAt < new Date() || rt.session.revokedAt || rt.session.user.status !== 'ACTIVE') throw new AppError('Session expired', 401, 'session_expired');
    // Conditional update: two concurrent refreshes with the same token — only one wins.
    const claimed = await this.prisma.refreshToken.updateMany({ where: { id: rt.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new AppError('Session expired', 401, 'session_expired');
    await this.prisma.userSession.update({ where: { id: rt.sessionId }, data: { lastSeenAt: new Date() } });
    return this.issue(rt.sessionId, rt.session.userId);
  }

  async logout(sessionId: string) {
    await this.prisma.userSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async forgotPassword(emailRaw: string, ctx: Ctx) {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Same response whether or not the account exists.
    if (!user || user.deletedAt || user.status === 'DISABLED') return;
    const recent = await this.prisma.passwordResetToken.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 15 * 60_000) } } });
    if (recent >= 3) return;
    const token = this.crypto.token(32);
    await this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: this.crypto.sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
    await this.audit.record({ actorUserId: user.id, actor: `user:${user.id}`, action: 'auth.password_reset_requested', ip: ctx.ip, security: true });
    await this.mail.send(user.email, 'Reset your AppGrowth AI password', [
      `Hi ${user.name},`, 'Someone (hopefully you) asked to reset your password. The link works for one hour.',
      'If this wasn’t you, ignore this email — your password stays the same.',
    ], { label: 'Choose a new password', url: `${process.env.PUBLIC_URL}/reset-password?token=${token}` });
  }

  async resetPassword(token: string, password: string, ctx: Ctx) {
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: this.crypto.sha256(token) } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw new AppError('This reset link has expired. Request a new one.', 400, 'invalid_token');
    const passwordHash = await this.hashPassword(password);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash, failedLogins: 0, lockedUntil: null } }),
      this.prisma.userSession.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } }), // sign out everywhere
    ]);
    await this.audit.record({ actorUserId: row.userId, actor: `user:${row.userId}`, action: 'auth.password_reset', ip: ctx.ip, security: true });
  }

  // ── MFA (TOTP) ──
  async mfaSetup(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabledAt) throw new AppError('Two-factor authentication is already on', 409, 'mfa_enabled');
    const secret = authenticator.generateSecret(20);
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecretEnc: this.crypto.encrypt(secret) } });
    return { secret, otpauthUrl: authenticator.keyuri(user.email, 'AppGrowth AI', secret) };
  }

  async mfaEnable(userId: string, sessionId: string, code: string, ctx: Ctx) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecretEnc) throw new AppError('Start setup first', 400, 'mfa_not_started');
    if (!authenticator.check(code, this.crypto.decrypt(user.mfaSecretEnc))) throw new AppError('That code is not valid. Check your device clock and try again.', 400, 'invalid_code');
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabledAt: new Date() } });
    await this.prisma.userSession.update({ where: { id: sessionId }, data: { mfaVerified: true } });
    await this.audit.record({ actorUserId: userId, actor: `user:${userId}`, action: 'auth.mfa_enabled', ip: ctx.ip, security: true });
  }

  /** Step-up: verify MFA on the current session (e.g. a Super Admin who signed in before enabling MFA). */
  async mfaVerify(userId: string, sessionId: string, code: string, ctx: Ctx) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaEnabledAt || !user.mfaSecretEnc) throw new AppError('Two-factor authentication is not on', 400, 'mfa_not_enabled');
    if (!authenticator.check(code, this.crypto.decrypt(user.mfaSecretEnc))) {
      await this.audit.record({ actorUserId: userId, actor: `user:${userId}`, action: 'auth.mfa_failed', ip: ctx.ip, security: true });
      throw new AppError('That code is not valid', 400, 'invalid_code');
    }
    await this.prisma.userSession.update({ where: { id: sessionId }, data: { mfaVerified: true } });
  }

  async mfaDisable(userId: string, code: string, ctx: Ctx) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.platformRole !== 'NONE') throw new AppError('Platform administrators must keep two-factor authentication on', 403, 'mfa_mandatory');
    if (!user.mfaSecretEnc || !authenticator.check(code, this.crypto.decrypt(user.mfaSecretEnc))) throw new AppError('That code is not valid', 400, 'invalid_code');
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabledAt: null, mfaSecretEnc: null } });
    await this.audit.record({ actorUserId: userId, actor: `user:${userId}`, action: 'auth.mfa_disabled', ip: ctx.ip, security: true });
  }

  async me(userId: string, sessionId: string) {
    const [user, session] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: { memberships: { include: { organization: { select: { id: true, name: true, slug: true, status: true, deletedAt: true } }, role: { select: { key: true, name: true, permissions: { select: { permission: { select: { key: true } } } } } } } } },
      }),
      this.prisma.userSession.findUniqueOrThrow({ where: { id: sessionId } }),
    ]);
    return {
      id: user.id, email: user.email, name: user.name, platformRole: user.platformRole,
      mfaEnabled: !!user.mfaEnabledAt, mfaVerified: session.mfaVerified,
      organizations: user.memberships.filter((m) => !m.organization.deletedAt).map((m) => ({
        id: m.organization.id, name: m.organization.name, slug: m.organization.slug, status: m.organization.status,
        role: m.role.key, roleName: m.role.name, permissions: m.role.permissions.map((p) => p.permission.key),
      })),
    };
  }

  async acceptInvite(token: string, name: string | undefined, password: string | undefined, ctx: Ctx) {
    const inv = await this.prisma.invitation.findUnique({ where: { tokenHash: this.crypto.sha256(token) } });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new AppError('This invitation has expired. Ask for a new one.', 400, 'invalid_token');
    let user = await this.prisma.user.findUnique({ where: { email: inv.email } });
    const existed = !!user;
    if (!user) {
      if (!name || !password) throw new AppError('Enter your name and a password to create your account', 400, 'details_required');
      user = await this.prisma.user.create({ data: { email: inv.email, name, passwordHash: await this.hashPassword(password), emailVerifiedAt: new Date() } });
    }
    const role = await this.prisma.role.findUniqueOrThrow({ where: { key: inv.roleKey } });
    await this.prisma.$transaction([
      this.prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: inv.organizationId, userId: user.id } },
        create: { organizationId: inv.organizationId, userId: user.id, roleId: role.id }, update: {},
      }),
      this.prisma.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } }),
    ]);
    await this.audit.record({ organizationId: inv.organizationId, actorUserId: user.id, actor: `user:${user.id}`, action: 'member.joined', entityType: 'user', entityId: user.id, after: { role: inv.roleKey }, ip: ctx.ip });
    return { organizationId: inv.organizationId, existingAccount: existed };
  }
}
