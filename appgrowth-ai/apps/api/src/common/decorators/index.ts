import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '../permissions';

export const IS_PUBLIC = 'isPublic';
export const PERMISSION = 'permission';
export const PLATFORM_ADMIN = 'platformAdmin';
export const NO_ORG = 'noOrg';

/** No authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Requires the active organization membership to grant this permission. */
export const RequirePermission = (p: PermissionKey) => SetMetadata(PERMISSION, p);
/** Super Admin (or SUPPORT when allowSupport) with MFA verified on the session. */
export const PlatformAdmin = (opts: { allowSupport?: boolean } = {}) => SetMetadata(PLATFORM_ADMIN, opts);
/** Authenticated, but no organization context required (profile, org list, create org). */
export const NoOrg = () => SetMetadata(NO_ORG, true);

export interface AuthUser {
  id: string; email: string; name: string; platformRole: 'SUPER_ADMIN' | 'SUPPORT' | 'NONE';
  sessionId: string; mfaVerified: boolean; mfaEnabled: boolean;
}
export interface OrgContext { id: string; role: string; permissions: Set<string>; status: string }

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
export const CurrentOrg = createParamDecorator((_: unknown, ctx: ExecutionContext): OrgContext => ctx.switchToHttp().getRequest().org);
