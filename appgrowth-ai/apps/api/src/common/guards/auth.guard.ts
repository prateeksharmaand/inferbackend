import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthUser, IS_PUBLIC, NO_ORG, OrgContext, PERMISSION, PLATFORM_ADMIN } from '../decorators';
import { PrismaService } from '../prisma.service';

export const COOKIES = { access: 'ag_access', refresh: 'ag_refresh', csrf: 'ag_csrf' } as const;
export const ORG_HEADER = 'x-organization-id';
export const adminMfaRequired = () => process.env.ADMIN_MFA_REQUIRED !== 'false';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Req = Request & { user?: AuthUser; org?: OrgContext };

/**
 * Global guard. Order:
 *  1. @Public passes.
 *  2. Access JWT from Bearer header (API clients) or httpOnly cookie (web); session must be live.
 *  3. Cookie-authenticated mutations must echo the CSRF cookie in X-CSRF-Token (double submit).
 *  4. @PlatformAdmin: SUPER_ADMIN (or SUPPORT) and, when MFA is enabled — it is mandatory to enable — MFA verified.
 *  5. Otherwise an organization context is required (X-Organization-Id) unless @NoOrg: the user must be a member,
 *     the org must be ACTIVE (suspended orgs are read-only), and @RequirePermission must be granted.
 *     Routes with neither @RequirePermission nor @NoOrg are denied — deny by default.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Req>();
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
    const token = bearer ?? (req.cookies?.[COOKIES.access] as string | undefined);
    if (!token) throw new UnauthorizedException({ message: 'Not signed in', code: 'unauthorized' });
    let p: { sub: string; sid: string; typ: string };
    try {
      p = await this.jwt.verifyAsync(token, { secret: process.env.JWT_ACCESS_SECRET, algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException({ message: 'Session expired', code: 'token_expired' });
    }
    if (p.typ !== 'access') throw new UnauthorizedException({ message: 'Wrong token type', code: 'unauthorized' });
    const session = await this.prisma.userSession.findUnique({ where: { id: p.sid }, include: { user: true } });
    if (!session || session.revokedAt || session.userId !== p.sub) throw new UnauthorizedException({ message: 'Session revoked', code: 'session_revoked' });
    const u = session.user;
    if (u.status !== 'ACTIVE' || u.deletedAt) throw new UnauthorizedException({ message: 'Account disabled', code: 'account_disabled' });
    req.user = { id: u.id, email: u.email, name: u.name, platformRole: u.platformRole, sessionId: session.id, mfaVerified: session.mfaVerified, mfaEnabled: !!u.mfaEnabledAt };

    if (!bearer && !SAFE.has(req.method)) {
      const sent = req.headers['x-csrf-token'];
      const cookie = req.cookies?.[COOKIES.csrf];
      if (typeof sent !== 'string' || !cookie || sent !== cookie) throw new ForbiddenException({ message: 'CSRF token missing or invalid', code: 'csrf_failed' });
    }

    const admin = this.reflector.getAllAndOverride<{ allowSupport?: boolean }>(PLATFORM_ADMIN, targets);
    if (admin) {
      const ok = u.platformRole === 'SUPER_ADMIN' || (admin.allowSupport && u.platformRole === 'SUPPORT');
      if (!ok) throw new ForbiddenException({ message: 'Platform administrators only', code: 'forbidden' });
      // ADMIN_MFA_REQUIRED=false (operator's choice) lets admins in without two-factor; on by default.
      if (adminMfaRequired()) {
        if (!u.mfaEnabledAt) throw new ForbiddenException({ message: 'Set up two-factor authentication to use the admin console', code: 'mfa_setup_required' });
        if (!session.mfaVerified) throw new ForbiddenException({ message: 'Two-factor verification required', code: 'mfa_required' });
      }
      return true;
    }

    const noOrg = this.reflector.getAllAndOverride<boolean>(NO_ORG, targets);
    const perm = this.reflector.getAllAndOverride<string>(PERMISSION, targets);
    if (noOrg && !perm) return true;
    if (!perm) throw new ForbiddenException({ message: 'Endpoint has no permission declared', code: 'forbidden' });

    const orgId = req.headers[ORG_HEADER];
    if (typeof orgId !== 'string' || !UUID.test(orgId)) throw new ForbiddenException({ message: 'Select an organization (X-Organization-Id)', code: 'org_required' });
    const m = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: u.id } },
      include: { organization: { select: { status: true, deletedAt: true } }, role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!m || m.organization.deletedAt) throw new ForbiddenException({ message: 'Not a member of this organization', code: 'forbidden' });
    const permissions = new Set(m.role.permissions.map((rp) => rp.permission.key));
    req.org = { id: orgId, role: m.role.key, permissions, status: m.organization.status };
    if (m.organization.status !== 'ACTIVE' && !SAFE.has(req.method)) {
      throw new ForbiddenException({ message: 'This organization is suspended. Contact support.', code: 'org_suspended' });
    }
    if (!permissions.has(perm)) throw new ForbiddenException({ message: `Your role lacks permission: ${perm}`, code: 'forbidden' });
    return true;
  }
}
