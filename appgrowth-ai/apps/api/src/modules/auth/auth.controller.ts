import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'crypto';
import type { CookieOptions, Request, Response } from 'express';
import { AuthUser, CurrentUser, NoOrg, Public } from '../../common/decorators';
import { COOKIES } from '../../common/guards/auth.guard';
import { ACCESS_TTL_SEC, AuthService, IssuedTokens, REFRESH_TTL_SEC } from './auth.service';
import { AcceptInviteDto, ForgotDto, LoginDto, MfaCodeDto, RefreshDto, RegisterDto, ResetDto } from './dto';

const secure = () => process.env.NODE_ENV === 'production';
const base = (): CookieOptions => ({ httpOnly: true, secure: secure(), sameSite: 'lax', path: '/' });
const ctxOf = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

/** Web: tokens in httpOnly cookies + readable CSRF cookie. API clients: tokens in the body (`client=api`). */
function setSession(req: Request, res: Response, t: IssuedTokens, csrf: string) {
  res.cookie(COOKIES.access, t.accessToken, { ...base(), maxAge: ACCESS_TTL_SEC * 1000 });
  res.cookie(COOKIES.refresh, t.refreshToken, { ...base(), path: '/api/v1/auth', maxAge: REFRESH_TTL_SEC * 1000 });
  res.cookie(COOKIES.csrf, csrf, { ...base(), httpOnly: false, maxAge: REFRESH_TTL_SEC * 1000 });
  const api = req.query.client === 'api';
  return api ? { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn } : { expiresIn: t.expiresIn };
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  private csrf() { return randomBytes(24).toString('base64url'); }

  @Public() @Post('register') @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create an account and its organization (owner role, free trial)' })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.register(dto, ctxOf(req));
    return { ...setSession(req, res, r.tokens, this.csrf()), user: r.user, organization: r.organization };
  }

  @Public() @Post('login') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in (send mfaCode when two-factor authentication is on). Add ?client=api for tokens in the body.' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return setSession(req, res, await this.auth.login(dto, ctxOf(req)), this.csrf());
  }

  @Public() @Post('refresh') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rotate the refresh token. Reusing an old one revokes the session.' })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = dto.refreshToken ?? (req.cookies?.[COOKIES.refresh] as string | undefined);
    try {
      return setSession(req, res, await this.auth.refresh(token, ctxOf(req)), req.cookies?.[COOKIES.csrf] ?? this.csrf());
    } catch (e) {
      for (const c of Object.values(COOKIES)) res.clearCookie(c, { path: c === COOKIES.refresh ? '/api/v1/auth' : '/' });
      throw e;
    }
  }

  @NoOrg() @Post('logout') @HttpCode(204) @ApiBearerAuth()
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId);
    for (const c of Object.values(COOKIES)) res.clearCookie(c, { path: c === COOKIES.refresh ? '/api/v1/auth' : '/' });
  }

  @Public() @Post('forgot-password') @HttpCode(202) @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @ApiOperation({ summary: 'Email a reset link. Always 202 so it does not reveal which emails have accounts.' })
  async forgot(@Body() dto: ForgotDto, @Req() req: Request) {
    await this.auth.forgotPassword(dto.email, ctxOf(req));
    return { message: 'If an account exists for that email, a reset link is on its way.' };
  }

  @Public() @Post('reset-password') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  async reset(@Body() dto: ResetDto, @Req() req: Request) {
    await this.auth.resetPassword(dto.token, dto.password, ctxOf(req));
    return { message: 'Password changed. Sign in with your new password.' };
  }

  @Public() @Post('accept-invite') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  async acceptInvite(@Body() dto: AcceptInviteDto, @Req() req: Request) {
    return this.auth.acceptInvite(dto.token, dto.name, dto.password, ctxOf(req));
  }

  @NoOrg() @Get('me') @ApiBearerAuth()
  me(@CurrentUser() user: AuthUser) { return this.auth.me(user.id, user.sessionId); }

  @NoOrg() @Post('mfa/setup') @ApiBearerAuth()
  @ApiOperation({ summary: 'Start TOTP setup: returns the secret and otpauth:// URL to show as a QR code' })
  mfaSetup(@CurrentUser() user: AuthUser) { return this.auth.mfaSetup(user.id); }

  @NoOrg() @Post('mfa/enable') @HttpCode(204) @ApiBearerAuth() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  mfaEnable(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto, @Req() req: Request) { return this.auth.mfaEnable(user.id, user.sessionId, dto.code, ctxOf(req)); }

  @NoOrg() @Post('mfa/verify') @HttpCode(204) @ApiBearerAuth() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  mfaVerify(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto, @Req() req: Request) { return this.auth.mfaVerify(user.id, user.sessionId, dto.code, ctxOf(req)); }

  @NoOrg() @Post('mfa/disable') @HttpCode(204) @ApiBearerAuth() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  mfaDisable(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto, @Req() req: Request) { return this.auth.mfaDisable(user.id, dto.code, ctxOf(req)); }
}
