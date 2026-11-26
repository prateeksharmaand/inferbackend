import { Injectable, Logger } from '@nestjs/common';
import { Platform, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import { AppError, notFound } from '../../common/errors';
import { fromMinor, toMinor } from '../../common/money';
import { paged, skipTake } from '../../common/pagination';
import { PrismaService, Tx } from '../../common/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ANDROID_PACKAGE, IOS_BUNDLE, ListingData, parseStoreUrl, StoreService } from '../store/store.service';
import { WorkflowStarter } from '../workflows/workflow-starter.service';
import type { AndroidInput, AppListQuery, CreateAppDto, IosInput, UpdateAppDto } from './dto';

interface ResolvedPlatform { platform: Platform; storeId: string; storeUrl: string; appleAppId?: string; listing?: ListingData | null; validated: boolean; note: string }
const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

@Injectable()
export class AppsService {
  private log = new Logger('Apps');
  constructor(
    private prisma: PrismaService, private audit: AuditService, private store: StoreService, private storage: StorageService,
    private crypto: CryptoService, private workflows: WorkflowStarter,
  ) {}

  /** Resolves identifiers from URL and/or id and validates them against the stores. */
  async resolveAndroid(a: AndroidInput): Promise<ResolvedPlatform> {
    let pkg = a.packageName;
    if (a.storeUrl) {
      const p = parseStoreUrl(a.storeUrl);
      if (!p || p.platform !== 'ANDROID') throw new AppError('That is not a Google Play app URL (https://play.google.com/store/apps/details?id=…)', 400, 'invalid_store_url');
      if (pkg && pkg !== p.storeId) throw new AppError('The Play URL and package name refer to different apps', 400, 'mismatch');
      pkg = p.storeId;
    }
    if (!pkg || !ANDROID_PACKAGE.test(pkg)) throw new AppError('Enter a Play Store URL or Android package name', 400, 'android_id_required');
    const exists = await this.store.androidPackageExists(pkg);
    if (exists === false) throw new AppError(`No app with package “${pkg}” is published on Google Play. Check the package name (unpublished apps can be added once they are live).`, 400, 'android_not_found');
    return {
      platform: 'ANDROID', storeId: pkg, storeUrl: `https://play.google.com/store/apps/details?id=${pkg}`, validated: exists === true,
      note: exists === true ? 'Found on Google Play' : 'Could not reach Google Play to confirm; will retry during onboarding',
    };
  }

  async resolveIos(i: IosInput, country = 'IN'): Promise<ResolvedPlatform> {
    let appleAppId: string | undefined;
    if (i.storeUrl) {
      const p = parseStoreUrl(i.storeUrl);
      if (!p || p.platform !== 'IOS') throw new AppError('That is not an App Store URL (https://apps.apple.com/…/id123456789)', 400, 'invalid_store_url');
      appleAppId = p.appleAppId;
    }
    if (!appleAppId && !i.bundleId) throw new AppError('Enter an App Store URL or iOS bundle identifier', 400, 'ios_id_required');
    if (i.bundleId && !IOS_BUNDLE.test(i.bundleId)) throw new AppError('Invalid iOS bundle identifier', 400, 'invalid_bundle_id');
    let listing: ListingData | null = null;
    try { listing = await this.store.lookupIos({ appleAppId, bundleId: i.bundleId }, country); } catch (e) { this.log.warn(`iTunes lookup: ${(e as Error).message}`); }
    if (listing) {
      if (i.bundleId && listing.bundleId && listing.bundleId !== i.bundleId) throw new AppError(`The App Store URL is for ${listing.bundleId}, not ${i.bundleId}`, 400, 'mismatch');
      return { platform: 'IOS', storeId: listing.bundleId || i.bundleId!, storeUrl: listing.storeUrl, appleAppId: listing.appleAppId, listing, validated: true, note: 'Found on the App Store' };
    }
    if (appleAppId) throw new AppError(`No App Store app with id ${appleAppId} is available in ${country}. Check the URL or your organization country.`, 400, 'ios_not_found');
    return { platform: 'IOS', storeId: i.bundleId!, storeUrl: '', validated: false, note: `Not found on the ${country} App Store yet; metadata will be fetched when it is live` };
  }

  /** Preview for the "add app" form: parse a store URL and return public metadata. */
  async lookup(url: string, country: string) {
    const p = parseStoreUrl(url);
    if (!p) throw new AppError('Paste a Google Play or App Store app link', 400, 'invalid_store_url');
    if (p.platform === 'ANDROID') {
      const r = await this.resolveAndroid({ storeUrl: url });
      return { platform: 'ANDROID', storeId: r.storeId, storeUrl: r.storeUrl, validated: r.validated, note: r.note, listing: null };
    }
    const r = await this.resolveIos({ storeUrl: url }, country);
    return { platform: 'IOS', storeId: r.storeId, storeUrl: r.storeUrl, appleAppId: r.appleAppId, validated: r.validated, note: r.note, listing: r.listing };
  }

  private async assertPlanAllowsApp(orgId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { organizationId: orgId, status: { in: ['ACTIVE', 'TRIALING'] } }, orderBy: { createdAt: 'desc' }, include: { plan: true } });
    if (!sub) throw new AppError('Your subscription is not active. Renew it to add apps.', 402, 'subscription_inactive');
    if (sub.trialEndsAt && sub.trialEndsAt < new Date() && sub.status === 'TRIALING') throw new AppError('Your free trial has ended. Choose a plan to continue.', 402, 'trial_ended');
    const count = await this.prisma.application.count({ where: { organizationId: orgId, deletedAt: null } });
    if (count >= sub.plan.maxApps) throw new AppError(`Your ${sub.plan.name} plan includes ${sub.plan.maxApps} app${sub.plan.maxApps === 1 ? '' : 's'}. Upgrade to add more.`, 403, 'plan_limit');
  }

  private async saveListing(tx: Tx, orgId: string, appId: string, platform: Platform, l: ListingData, country: string) {
    const contentHash = createHash('sha256').update(JSON.stringify([l.title, l.subtitle, l.description, l.iconUrl, l.screenshotUrls])).digest('hex');
    const last = await tx.applicationStoreListing.findFirst({ where: { applicationId: appId, platform, country }, orderBy: { fetchedAt: 'desc' } });
    if (last?.contentHash === contentHash) return { changed: false };
    await tx.applicationStoreListing.create({
      data: {
        organizationId: orgId, applicationId: appId, platform, country, title: l.title, subtitle: l.subtitle, description: l.description, developer: l.developer,
        rating: l.rating ?? undefined, ratingCount: l.ratingCount ?? undefined, iconUrl: l.iconUrl, screenshotUrls: l.screenshotUrls, raw: l.raw as Prisma.InputJsonValue, source: l.source, contentHash,
      },
    });
    return { changed: !!last };
  }

  async create(orgId: string, userId: string, dto: CreateAppDto) {
    if (!dto.android && !dto.ios) throw new AppError('Add at least one platform (Android or iOS)', 400, 'platform_required');
    await this.assertPlanAllowsApp(orgId);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const resolved: ResolvedPlatform[] = [];
    if (dto.android) resolved.push(await this.resolveAndroid(dto.android));
    if (dto.ios) resolved.push(await this.resolveIos(dto.ios, org.country));
    const iosListing = resolved.find((r) => r.listing)?.listing;
    const app = await this.prisma.tenant(orgId, userId, async (tx) => {
      for (const r of resolved) {
        const dup = await tx.applicationPlatform.findFirst({ where: { organizationId: orgId, platform: r.platform, storeId: r.storeId, application: { deletedAt: null } }, include: { application: true } });
        if (dup) throw new AppError(`${r.storeId} is already added as “${dup.application.name}”`, 409, 'duplicate_app');
      }
      const app = await tx.application.create({
        data: {
          organizationId: orgId, name: dto.name, category: dto.category ?? iosListing?.category ?? '', description: dto.description || iosListing?.description || '',
          targetAudience: dto.targetAudience ?? '', monthlyInstallTarget: dto.monthlyInstallTarget ?? 10000, targetCpiMinor: dto.targetCpi ? toMinor(dto.targetCpi) : null, currency: org.currency,
        },
      });
      for (const r of resolved) {
        await tx.applicationPlatform.create({ data: { organizationId: orgId, applicationId: app.id, platform: r.platform, storeId: r.storeId, storeUrl: r.storeUrl, appleAppId: r.appleAppId, validatedAt: r.validated ? new Date() : null, validationNote: r.note } });
        if (r.listing) await this.saveListing(tx, orgId, app.id, r.platform, r.listing, org.country);
      }
      const countries = dto.countries?.length ? dto.countries : [org.country];
      await tx.applicationCountry.createMany({ data: [...new Set(countries)].map((country) => ({ organizationId: orgId, applicationId: app.id, country })) });
      await tx.applicationLanguage.createMany({ data: [...new Set(dto.languages?.length ? dto.languages : ['en'])].map((language) => ({ organizationId: orgId, applicationId: app.id, language })) });
      await tx.applicationTarget.create({ data: { organizationId: orgId, applicationId: app.id, month: monthStart(), installs: app.monthlyInstallTarget, targetCpiMinor: app.targetCpiMinor } });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'app.created', entityType: 'application', entityId: app.id, after: { name: dto.name, platforms: resolved.map((r) => `${r.platform}:${r.storeId}`) } }, tx);
      return app;
    });
    let onboarding: { id: string } | null = null;
    if (dto.runOnboarding !== false) {
      try {
        const r = await this.workflows.start({ organizationId: orgId, key: 'app_onboarding', idempotencyKey: `app_onboarding:${app.id}:initial`, subjectType: 'application', subjectId: app.id, input: { requestedBy: userId } });
        onboarding = { id: r.execution.id };
        await this.prisma.application.update({ where: { id: app.id }, data: { onboardingStatus: 'running' } });
      } catch (e) {
        this.log.warn(`onboarding not started for ${app.id}: ${(e as Error).message}`);
      }
    }
    return { ...(await this.get(orgId, userId, app.id)), onboardingExecutionId: onboarding?.id ?? null };
  }

  async list(orgId: string, userId: string, q: AppListQuery) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const where: Prisma.ApplicationWhereInput = {
        organizationId: orgId, deletedAt: null,
        ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
        ...(q.platform ? { platforms: { some: { platform: q.platform } } } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.application.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q), include: { platforms: true, listings: { orderBy: { fetchedAt: 'desc' }, take: 2, select: { platform: true, iconUrl: true, title: true, rating: true } }, assets: { where: { kind: 'icon' }, take: 1 }, _count: { select: { campaigns: { where: { status: 'ACTIVE', deletedAt: null } } } } } }),
        tx.application.count({ where }),
      ]);
      const since = monthStart();
      const installs = await tx.analyticsDaily.groupBy({ by: ['applicationId'], where: { organizationId: orgId, applicationId: { in: rows.map((r) => r.id) }, date: { gte: since } }, _sum: { firstInstalls: true, spendMinor: true } });
      const byApp = new Map(installs.map((i) => [i.applicationId, i._sum]));
      return paged(rows.map((a) => ({
        id: a.id, name: a.name, category: a.category, status: a.status, onboardingStatus: a.onboardingStatus, monthlyInstallTarget: a.monthlyInstallTarget,
        targetCpi: fromMinor(a.targetCpiMinor), currency: a.currency, createdAt: a.createdAt,
        iconUrl: a.assets[0] ? this.storage.signedUrl(a.assets[0].storageKey) : a.listings.find((l) => l.iconUrl)?.iconUrl ?? null,
        platforms: a.platforms.map((p) => ({ platform: p.platform, storeId: p.storeId, storeUrl: p.storeUrl, validated: !!p.validatedAt })),
        activeCampaigns: a._count.campaigns,
        monthToDate: { installs: byApp.get(a.id)?.firstInstalls ?? 0, spendMinor: byApp.get(a.id)?.spendMinor ?? 0n },
      })), total, q);
    });
  }

  async get(orgId: string, userId: string, id: string) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const a = await tx.application.findFirst({
        where: { id, organizationId: orgId, deletedAt: null },
        include: { platforms: true, countries: true, languages: true, assets: { orderBy: { createdAt: 'asc' } }, targets: { orderBy: { month: 'desc' }, take: 12 } },
      });
      if (!a) throw notFound('Application');
      const listings = await Promise.all(a.platforms.map((p) => tx.applicationStoreListing.findFirst({ where: { applicationId: id, platform: p.platform }, orderBy: { fetchedAt: 'desc' } })));
      const playCreds = await tx.accountApplication.findFirst({ where: { applicationId: id, account: { providerKey: 'play_console', deletedAt: null } }, include: { account: { select: { id: true, name: true, status: true, statusDetail: true, lastSyncedAt: true } } } });
      const onboarding = await tx.workflowExecution.findFirst({ where: { organizationId: orgId, workflowKey: 'app_onboarding', subjectId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, currentStep: true, steps: true, error: true, createdAt: true, finishedAt: true } });
      return {
        id: a.id, name: a.name, category: a.category, description: a.description, targetAudience: a.targetAudience, status: a.status, onboardingStatus: a.onboardingStatus,
        monthlyInstallTarget: a.monthlyInstallTarget, targetCpi: fromMinor(a.targetCpiMinor), currency: a.currency, createdAt: a.createdAt,
        platforms: a.platforms.map((p) => ({ id: p.id, platform: p.platform, storeId: p.storeId, storeUrl: p.storeUrl, appleAppId: p.appleAppId, validatedAt: p.validatedAt, validationNote: p.validationNote })),
        countries: a.countries.map((c) => c.country), languages: a.languages.map((l) => l.language),
        assets: a.assets.map((x) => ({ id: x.id, kind: x.kind, mimeType: x.mimeType, sizeBytes: x.sizeBytes, width: x.width, height: x.height, url: this.storage.signedUrl(x.storageKey), createdAt: x.createdAt })),
        targets: a.targets.map((t) => ({ month: t.month, installs: t.installs, targetCpi: fromMinor(t.targetCpiMinor) })),
        listings: listings.filter(Boolean).map((l) => ({ platform: l!.platform, country: l!.country, title: l!.title, subtitle: l!.subtitle, description: l!.description, developer: l!.developer, rating: l!.rating ? Number(l!.rating) : null, ratingCount: l!.ratingCount, iconUrl: l!.iconUrl, screenshotUrls: l!.screenshotUrls, source: l!.source, fetchedAt: l!.fetchedAt })),
        playConsole: playCreds ? playCreds.account : null,
        onboarding,
      };
    });
  }

  async update(orgId: string, userId: string, id: string, dto: UpdateAppDto) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const android = dto.android ? await this.resolveAndroid(dto.android) : null;
    const ios = dto.ios ? await this.resolveIos(dto.ios, org.country) : null;
    await this.prisma.tenant(orgId, userId, async (tx) => {
      const before = await tx.application.findFirst({ where: { id, organizationId: orgId, deletedAt: null }, include: { countries: true, languages: true, platforms: true } });
      if (!before) throw notFound('Application');
      await tx.application.update({
        where: { id },
        data: {
          name: dto.name, category: dto.category, description: dto.description, targetAudience: dto.targetAudience, status: dto.status,
          monthlyInstallTarget: dto.monthlyInstallTarget, targetCpiMinor: dto.targetCpi === undefined ? undefined : dto.targetCpi === null ? null : toMinor(dto.targetCpi),
        },
      });
      if (dto.monthlyInstallTarget !== undefined || dto.targetCpi !== undefined) {
        const month = monthStart();
        const fresh = await tx.application.findUniqueOrThrow({ where: { id } });
        await tx.applicationTarget.upsert({ where: { applicationId_month: { applicationId: id, month } }, create: { organizationId: orgId, applicationId: id, month, installs: fresh.monthlyInstallTarget, targetCpiMinor: fresh.targetCpiMinor }, update: { installs: fresh.monthlyInstallTarget, targetCpiMinor: fresh.targetCpiMinor } });
      }
      if (dto.countries) {
        await tx.applicationCountry.deleteMany({ where: { applicationId: id } });
        await tx.applicationCountry.createMany({ data: [...new Set(dto.countries)].map((country) => ({ organizationId: orgId, applicationId: id, country })) });
      }
      if (dto.languages) {
        await tx.applicationLanguage.deleteMany({ where: { applicationId: id } });
        await tx.applicationLanguage.createMany({ data: [...new Set(dto.languages)].map((language) => ({ organizationId: orgId, applicationId: id, language })) });
      }
      for (const r of [android, ios].filter((x): x is ResolvedPlatform => !!x)) {
        const dup = await tx.applicationPlatform.findFirst({ where: { organizationId: orgId, platform: r.platform, storeId: r.storeId, applicationId: { not: id }, application: { deletedAt: null } } });
        if (dup) throw new AppError(`${r.storeId} already belongs to another app in this organization`, 409, 'duplicate_app');
        await tx.applicationPlatform.upsert({
          where: { applicationId_platform: { applicationId: id, platform: r.platform } },
          create: { organizationId: orgId, applicationId: id, platform: r.platform, storeId: r.storeId, storeUrl: r.storeUrl, appleAppId: r.appleAppId, validatedAt: r.validated ? new Date() : null, validationNote: r.note },
          update: { storeId: r.storeId, storeUrl: r.storeUrl, appleAppId: r.appleAppId, validatedAt: r.validated ? new Date() : null, validationNote: r.note },
        });
        if (r.listing) await this.saveListing(tx, orgId, id, r.platform, r.listing, org.country);
      }
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'app.updated', entityType: 'application', entityId: id, before: { name: before.name, monthlyInstallTarget: before.monthlyInstallTarget, targetCpiMinor: before.targetCpiMinor, countries: before.countries.map((c) => c.country) }, after: dto }, tx);
    });
    return this.get(orgId, userId, id);
  }

  async removePlatform(orgId: string, userId: string, id: string, platform: Platform) {
    await this.prisma.tenant(orgId, userId, async (tx) => {
      const count = await tx.applicationPlatform.count({ where: { applicationId: id, organizationId: orgId } });
      if (count <= 1) throw new AppError('An app needs at least one platform', 409, 'last_platform');
      const active = await tx.campaign.count({ where: { applicationId: id, platform, status: { in: ['ACTIVE', 'PAUSED', 'READY', 'PENDING_APPROVAL'] }, deletedAt: null } });
      if (active) throw new AppError(`End or archive the ${active} ${platform} campaign(s) first`, 409, 'has_campaigns');
      await tx.applicationPlatform.deleteMany({ where: { applicationId: id, organizationId: orgId, platform } });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'app.platform_removed', entityType: 'application', entityId: id, after: { platform } }, tx);
    });
  }

  /** Soft delete; refused while campaigns are live so nothing keeps spending unattended. */
  async remove(orgId: string, userId: string, id: string) {
    await this.prisma.tenant(orgId, userId, async (tx) => {
      const a = await tx.application.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
      if (!a) throw notFound('Application');
      const live = await tx.campaign.count({ where: { applicationId: id, status: { in: ['ACTIVE', 'PAUSED', 'READY', 'PENDING_APPROVAL'] }, deletedAt: null } });
      if (live) throw new AppError(`This app has ${live} campaign(s) that are not ended. Archive them first.`, 409, 'has_campaigns');
      await tx.application.update({ where: { id }, data: { deletedAt: new Date(), status: 'archived' } });
      await tx.applicationPlatform.deleteMany({ where: { applicationId: id } }); // frees the store ids for re-adding
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'app.deleted', entityType: 'application', entityId: id, before: { name: a.name } }, tx);
    });
  }

  /** Fetches fresh store metadata for every platform; records a new snapshot only when content changed. */
  async refreshMetadata(orgId: string, userId: string | null, id: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const a = await this.prisma.application.findFirst({ where: { id, organizationId: orgId, deletedAt: null }, include: { platforms: true } });
    if (!a) throw notFound('Application');
    const results: { platform: Platform; status: 'updated' | 'unchanged' | 'unavailable' | 'error'; detail: string }[] = [];
    for (const p of a.platforms) {
      try {
        let listing: ListingData | null = null;
        if (p.platform === 'IOS') listing = await this.store.lookupIos({ appleAppId: p.appleAppId ?? undefined, bundleId: p.appleAppId ? undefined : p.storeId }, org.country);
        else {
          const creds = await this.playCredentials(orgId, id);
          if (creds) listing = await this.store.playListing(p.storeId, creds, 'en-US');
          else {
            const exists = await this.store.androidPackageExists(p.storeId);
            await this.prisma.applicationPlatform.update({ where: { id: p.id }, data: exists ? { validatedAt: new Date(), validationNote: 'Found on Google Play' } : { validationNote: exists === false ? 'Not found on Google Play' : 'Google Play unreachable' } });
            results.push({ platform: p.platform, status: 'unavailable', detail: 'Add Play Console access to import Android listing text (Google has no public metadata API)' });
            continue;
          }
        }
        if (!listing) { results.push({ platform: p.platform, status: 'unavailable', detail: 'Not found in the store' }); continue; }
        const r = await this.prisma.$transaction((tx) => this.saveListing(tx, orgId, id, p.platform, listing!, org.country));
        await this.prisma.applicationPlatform.update({ where: { id: p.id }, data: { validatedAt: new Date(), validationNote: 'Metadata imported', appleAppId: listing.appleAppId || p.appleAppId } });
        results.push({ platform: p.platform, status: r.changed ? 'updated' : 'unchanged', detail: listing.source });
      } catch (e) {
        results.push({ platform: p.platform, status: 'error', detail: (e as Error).message });
      }
    }
    await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: userId ? `user:${userId}` : 'system', action: 'app.metadata_refreshed', entityType: 'application', entityId: id, after: results });
    return results;
  }

  async playCredentials(orgId: string, appId: string): Promise<string | null> {
    const link = await this.prisma.accountApplication.findFirst({ where: { organizationId: orgId, applicationId: appId, account: { providerKey: 'play_console', deletedAt: null, status: 'CONNECTED' } }, include: { account: { include: { token: true } } } });
    return link?.account.token ? this.crypto.decrypt(link.account.token.accessTokenEnc) : null;
  }

  /** Stores a Play Console service account (encrypted) after proving it can read this app's listing. */
  async setPlayCredentials(orgId: string, userId: string, appId: string, json: string) {
    const a = await this.prisma.application.findFirst({ where: { id: appId, organizationId: orgId, deletedAt: null }, include: { platforms: true } });
    if (!a) throw notFound('Application');
    const android = a.platforms.find((p) => p.platform === 'ANDROID');
    if (!android) throw new AppError('Add the Android platform first', 400, 'no_android');
    const listing = await this.store.playListing(android.storeId, json);
    const email = (JSON.parse(json) as { client_email: string }).client_email;
    await this.prisma.tenant(orgId, userId, async (tx) => {
      const acc = await tx.connectedAccount.upsert({
        where: { organizationId_providerKey_externalAccountId: { organizationId: orgId, providerKey: 'play_console', externalAccountId: email } },
        create: { organizationId: orgId, providerKey: 'play_console', externalAccountId: email, name: email, status: 'CONNECTED', scopes: ['androidpublisher'], connectedById: userId, lastSyncedAt: new Date() },
        update: { status: 'CONNECTED', statusDetail: '', deletedAt: null, lastSyncedAt: new Date() },
      });
      await tx.oAuthToken.upsert({ where: { connectedAccountId: acc.id }, create: { organizationId: orgId, connectedAccountId: acc.id, accessTokenEnc: this.crypto.encrypt(json), tokenType: 'service_account' }, update: { accessTokenEnc: this.crypto.encrypt(json) } });
      await tx.accountApplication.upsert({ where: { connectedAccountId_applicationId: { connectedAccountId: acc.id, applicationId: appId } }, create: { organizationId: orgId, connectedAccountId: acc.id, applicationId: appId }, update: {} });
      if (listing) await this.saveListing(tx, orgId, appId, 'ANDROID', listing, 'IN');
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'app.play_credentials_set', entityType: 'application', entityId: appId, after: { serviceAccount: email } }, tx);
    });
    return { connected: true, serviceAccount: email, listingImported: !!listing };
  }

  async addAsset(orgId: string, userId: string, appId: string, kind: string, file: Buffer) {
    const a = await this.prisma.application.findFirst({ where: { id: appId, organizationId: orgId, deletedAt: null } });
    if (!a) throw notFound('Application');
    const video = kind === 'video';
    const saved = await this.storage.saveUpload(orgId, `apps/${appId}`, file, video ? { allow: ['video/mp4'], maxBytes: 100 * 1048576 } : { allow: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 10 * 1048576 });
    if (kind === 'icon' && saved.width && saved.height && saved.width !== saved.height) { await this.storage.delete(saved.key); throw new AppError('App icons must be square', 400, 'invalid_icon'); }
    return this.prisma.tenant(orgId, userId, async (tx) => {
      if (kind === 'icon' || kind === 'logo') {
        const old = await tx.applicationAsset.findMany({ where: { applicationId: appId, kind } });
        await tx.applicationAsset.deleteMany({ where: { applicationId: appId, kind } });
        for (const o of old) await this.storage.delete(o.storageKey);
      }
      const asset = await tx.applicationAsset.create({ data: { organizationId: orgId, applicationId: appId, kind, storageKey: saved.key, mimeType: saved.mime, sizeBytes: saved.size, width: saved.width, height: saved.height } });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'app.asset_added', entityType: 'application_asset', entityId: asset.id, after: { kind, size: saved.size } }, tx);
      return { id: asset.id, kind, url: this.storage.signedUrl(asset.storageKey), width: asset.width, height: asset.height };
    });
  }

  async removeAsset(orgId: string, userId: string, appId: string, assetId: string) {
    const key = await this.prisma.tenant(orgId, userId, async (tx) => {
      const x = await tx.applicationAsset.findFirst({ where: { id: assetId, applicationId: appId, organizationId: orgId } });
      if (!x) throw notFound('Asset');
      await tx.applicationAsset.delete({ where: { id: assetId } });
      return x.storageKey;
    });
    await this.storage.delete(key);
  }

  async setTarget(orgId: string, userId: string, appId: string, month: string, installs: number, targetCpi?: string) {
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m) throw new AppError('Month must be YYYY-MM', 400, 'invalid_month');
    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
    if (date < monthStart()) throw new AppError('Past months cannot be changed', 400, 'past_month');
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const a = await tx.application.findFirst({ where: { id: appId, organizationId: orgId, deletedAt: null } });
      if (!a) throw notFound('Application');
      const t = await tx.applicationTarget.upsert({
        where: { applicationId_month: { applicationId: appId, month: date } },
        create: { organizationId: orgId, applicationId: appId, month: date, installs, targetCpiMinor: targetCpi ? toMinor(targetCpi) : a.targetCpiMinor },
        update: { installs, targetCpiMinor: targetCpi ? toMinor(targetCpi) : undefined },
      });
      if (date.getTime() === monthStart().getTime()) await tx.application.update({ where: { id: appId }, data: { monthlyInstallTarget: installs } });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'app.target_set', entityType: 'application', entityId: appId, after: { month, installs, targetCpi } }, tx);
      return { month: t.month, installs: t.installs, targetCpi: fromMinor(t.targetCpiMinor) };
    });
  }

  async startOnboarding(orgId: string, userId: string, appId: string) {
    const a = await this.prisma.application.findFirst({ where: { id: appId, organizationId: orgId, deletedAt: null } });
    if (!a) throw notFound('Application');
    const running = await this.prisma.workflowExecution.findFirst({ where: { organizationId: orgId, workflowKey: 'app_onboarding', subjectId: appId, status: { in: ['QUEUED', 'RUNNING'] } } });
    if (running) return { executionId: running.id, alreadyRunning: true };
    const r = await this.workflows.start({ organizationId: orgId, key: 'app_onboarding', idempotencyKey: `app_onboarding:${appId}:${Date.now()}`, subjectType: 'application', subjectId: appId, input: { requestedBy: userId } });
    await this.prisma.application.update({ where: { id: appId }, data: { onboardingStatus: 'running' } });
    await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'app.onboarding_started', entityType: 'application', entityId: appId });
    return { executionId: r.execution.id, alreadyRunning: false };
  }
}
