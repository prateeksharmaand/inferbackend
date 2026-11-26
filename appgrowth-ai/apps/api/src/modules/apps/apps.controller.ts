import { Body, Controller, Delete, Get, HttpCode, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Platform } from '@prisma/client';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, RequirePermission } from '../../common/decorators';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { AppListQuery, AssetQuery, CreateAppDto, LookupDto, PlayCredentialsDto, TargetDto, UpdateAppDto } from './dto';
import { AppsService } from './apps.service';

@ApiTags('Applications') @ApiBearerAuth() @ApiHeader({ name: 'X-Organization-Id', required: true })
@Controller('apps')
export class AppsController {
  constructor(private apps: AppsService, private prisma: PrismaService) {}

  @RequirePermission('apps.read') @Get()
  list(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Query() q: AppListQuery) { return this.apps.list(o.id, u.id, q); }

  @RequirePermission('apps.write') @Post('lookup') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Parse a Play / App Store URL and return what the store publicly exposes' })
  async lookup(@CurrentOrg() o: OrgContext, @Body() dto: LookupDto) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: o.id } });
    return this.apps.lookup(dto.url, org.country);
  }

  @RequirePermission('apps.write') @Post() @ApiOperation({ summary: 'Add an app (validated against the stores); starts onboarding unless runOnboarding=false' })
  create(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Body() dto: CreateAppDto) { return this.apps.create(o.id, u.id, dto); }

  @RequirePermission('apps.read') @Get(':id')
  get(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.apps.get(o.id, u.id, id); }

  @RequirePermission('apps.write') @Patch(':id')
  update(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAppDto) { return this.apps.update(o.id, u.id, id, dto); }

  @RequirePermission('apps.write') @Delete(':id') @HttpCode(204)
  remove(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.apps.remove(o.id, u.id, id); }

  @RequirePermission('apps.write') @Delete(':id/platforms/:platform') @HttpCode(204)
  removePlatform(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('platform', new ParseEnumPipe(Platform)) p: Platform) { return this.apps.removePlatform(o.id, u.id, id, p); }

  @RequirePermission('apps.write') @Post(':id/refresh-metadata') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  refresh(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.apps.refreshMetadata(o.id, u.id, id); }

  @RequirePermission('ai.run') @Post(':id/onboarding') @HttpCode(202) @ApiOperation({ summary: 'Run (or re-run) the onboarding workflow: research, ASO audit, growth strategy' })
  onboarding(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.apps.startOnboarding(o.id, u.id, id); }

  @RequirePermission('integrations.manage') @Put(':id/play-credentials') @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Connect Google Play Developer API (service account) to import Android listing data' })
  play(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlayCredentialsDto) { return this.apps.setPlayCredentials(o.id, u.id, id, dto.serviceAccountJson); }

  @RequirePermission('apps.write') @Post(':id/assets') @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1048576, files: 1 } }))
  upload(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: AssetQuery, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new AppError('Attach a file in the "file" field', 400, 'file_required');
    return this.apps.addAsset(o.id, u.id, id, q.kind, file.buffer);
  }

  @RequirePermission('apps.write') @Delete(':id/assets/:assetId') @HttpCode(204)
  removeAsset(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('assetId', ParseUUIDPipe) assetId: string) { return this.apps.removeAsset(o.id, u.id, id, assetId); }

  @RequirePermission('apps.write') @Put(':id/targets/:month') @ApiOperation({ summary: 'Set the install target for a month (YYYY-MM)' })
  target(@CurrentOrg() o: OrgContext, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('month') month: string, @Body() dto: TargetDto) { return this.apps.setTarget(o.id, u.id, id, month, dto.installs, dto.targetCpi); }
}
