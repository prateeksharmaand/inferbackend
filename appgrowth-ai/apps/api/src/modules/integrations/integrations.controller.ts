import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, Public, RequirePermission } from '../../common/decorators';
import { AppleConnectDto, AutomationDto, MapAppsDto } from './dto';
import { IntegrationsService } from './integrations.service';

@ApiTags('Integrations') @ApiBearerAuth() @ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('integrations')
export class IntegrationsController {
  constructor(private s: IntegrationsService) {}

  @RequirePermission('integrations.read') @Get() @ApiOperation({ summary: 'Provider catalogue (availability, setup checklist) and connected accounts' })
  list(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser) { return this.s.overview(o.id, u.id); }

  @RequirePermission('integrations.manage') @Post(':provider/connect') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Start OAuth (returns authorizeUrl). Apple Ads: use /apple_ads/keypair then /apple_ads/credentials.' })
  connect(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('provider') p: string) { return this.s.connect(o.id, u.id, p); }

  @Public() @Get(':provider/callback') @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'OAuth redirect target. Validates the one-time state and redirects to the web app.' })
  async callback(@Param('provider') p: string, @Query('code') code: string | undefined, @Query('state') state: string | undefined, @Query('error') error: string | undefined, @Query('auth_code') authCode: string | undefined, @Res() res: Response) {
    const back = `${process.env.PUBLIC_URL}/integrations`;
    try {
      const r = await this.s.callback(p, code ?? authCode, state, error);
      res.redirect(302, r.error ? `${back}?error=${encodeURIComponent(r.error)}` : `${back}?connected=${encodeURIComponent(p)}&count=${r.connected}`);
    } catch (e) {
      res.redirect(302, `${back}?error=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
    }
  }

  @RequirePermission('integrations.manage') @Post('apple_ads/keypair') @HttpCode(200) appleKey(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser) { return this.s.appleKeyPair(o.id, u.id); }
  @RequirePermission('integrations.manage') @Post('apple_ads/credentials') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  apple(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: AppleConnectDto) { return this.s.appleConnect(o.id, u.id, dto); }

  @RequirePermission('integrations.read') @Get(':provider/accounts') @ApiOperation({ summary: 'Advertising accounts accessible with the current authorization (live from the provider)' })
  accounts(@CurrentOrg() o: OrgContext, @Param('provider') p: string) { return this.s.liveAccounts(o.id, p); }

  @RequirePermission('integrations.manage') @Delete(':id') @HttpCode(200) disconnect(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.disconnect(o.id, u.id, id); }
  @RequirePermission('integrations.manage') @Post(':id/sync') @HttpCode(202) @Throttle({ default: { limit: 10, ttl: 60_000 } }) sync(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.requestSync(o.id, u.id, id); }
  @RequirePermission('integrations.manage') @Post(':id/permissions') @HttpCode(200) perms(@Param('id', ParseUUIDPipe) id: string, @CurrentOrg() o: OrgContext) { return this.s.refreshPermissionsFor(o.id, id); }
  @RequirePermission('integrations.manage') @Put(':id/applications') @HttpCode(204) map(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MapAppsDto) { return this.s.mapApplications(o.id, u.id, id, dto.links); }
  @RequirePermission('integrations.manage') @Patch(':id/automation') @HttpCode(204) automation(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AutomationDto) { return this.s.setAutomation(o.id, u.id, id, dto.enabled); }
  @RequirePermission('integrations.read') @Get(':id/logs') logs(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.logs(o.id, u.id, id); }
}
