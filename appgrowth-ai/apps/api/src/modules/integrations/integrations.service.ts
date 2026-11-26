import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import { AppError, notFound } from '../../common/errors';
import { providerErrors } from '../../common/metrics';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { QUEUES, queue } from '../../queues/queues';
import { NotificationsService } from '../notifications/notifications.service';
import { AppleAdsProvider } from './providers/apple-ads';
import { AD_PROVIDERS } from './providers/registry';
import { AdvertisingProvider, Credentials, ProviderApiError, TokenSet } from './providers/types';

const AD_KEYS = ['google_ads', 'apple_ads', 'meta_ads', 'tiktok_ads'];
const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const redirectUri = (provider: string) => `${process.env.PUBLIC_URL}/api/v1/integrations/${provider}/callback`;

@Injectable()
export class IntegrationsService {
  private log = new Logger('Integrations');
  constructor(private prisma: PrismaService, private crypto: CryptoService, private audit: AuditService, private redis: RedisService, private notify: NotificationsService) {}

  provider(key: string): AdvertisingProvider {
    const p = AD_PROVIDERS[key];
    if (!p) throw new AppError('Unknown provider', 404, 'not_found');
    return p;
  }

  /** Catalogue + this org's accounts. Platform availability = feature flag enabled AND credentials configured. */
  async overview(orgId: string, userId: string) {
    const [catalogue, flags] = await Promise.all([this.prisma.integrationProvider.findMany({ orderBy: { name: 'asc' } }), this.prisma.featureFlag.findMany({ where: { key: { startsWith: 'integration.' } } })]);
    const flag = new Map(flags.map((f) => [f.key.replace('integration.', ''), f.enabled || f.orgAllowList.includes(orgId)]));
    const accounts = await this.prisma.tenant(orgId, userId, (tx) => tx.connectedAccount.findMany({
      where: { organizationId: orgId, deletedAt: null }, orderBy: { createdAt: 'asc' },
      include: { appLinks: true, permissions: true, _count: { select: { campaigns: { where: { status: { in: ['ACTIVE', 'PAUSED'] } } } } } },
    }));
    return {
      providers: catalogue.map((c) => {
        const ad = AD_PROVIDERS[c.key];
        const available = ad ? (flag.get(c.key) ?? false) && ad.configured() : false;
        return { key: c.key, name: c.name, category: c.category, docsUrl: c.docsUrl, available, readiness: ad ? ad.readiness : c.readiness, readinessNote: c.readinessNote, authType: ad?.authType ?? null, setupChecklist: ad?.setupChecklist() ?? [], featureEnabled: flag.get(c.key) ?? null, platformConfigured: ad?.configured() ?? null };
      }),
      accounts: accounts.map((a) => ({
        id: a.id, providerKey: a.providerKey, externalAccountId: a.externalAccountId, name: a.name, currency: a.currency, timezone: a.timezone, status: a.status, statusDetail: a.statusDetail,
        automationEnabled: a.automationEnabled, lastSyncedAt: a.lastSyncedAt, tokenExpiresAt: a.tokenExpiresAt, scopes: a.scopes, liveCampaigns: a._count.campaigns,
        applications: a.appLinks.map((l) => ({ applicationId: l.applicationId, externalAppId: l.externalAppId })), permissions: Object.fromEntries(a.permissions.map((p) => [p.capability, p.granted])),
      })),
    };
  }

  private async assertAvailable(orgId: string, key: string) {
    const p = this.provider(key);
    const f = await this.prisma.featureFlag.findUnique({ where: { key: `integration.${key}` } });
    if (!(f?.enabled || f?.orgAllowList.includes(orgId))) throw new AppError(`${p.name} isn’t available yet: its API access is pending approval for this platform.`, 409, 'integration_unavailable');
    if (!p.configured()) throw new AppError(`${p.name} credentials are not configured on the platform`, 409, 'integration_unconfigured');
    const sub = await this.prisma.subscription.findFirst({ where: { organizationId: orgId, status: { in: ['ACTIVE', 'TRIALING'] } }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
    const n = await this.prisma.connectedAccount.count({ where: { organizationId: orgId, deletedAt: null, providerKey: { in: AD_KEYS }, status: { not: 'DISCONNECTED' } } });
    if (sub && n >= sub.plan.maxAdAccounts) throw new AppError(`Your ${sub.plan.name} plan allows ${sub.plan.maxAdAccounts} ad account(s)`, 403, 'plan_limit');
    return p;
  }

  /** Starts OAuth: one-time state (hashed at rest, 15 min) + PKCE verifier (encrypted). */
  async connect(orgId: string, userId: string, key: string) {
    const p = await this.assertAvailable(orgId, key);
    if (p.authType !== 'oauth' || !p.authorizeUrl) throw new AppError('This provider connects with API keys, not a sign-in redirect', 400, 'wrong_flow');
    const state = b64url(randomBytes(32)); const verifier = b64url(randomBytes(48));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    await this.prisma.oAuthState.create({ data: { organizationId: orgId, userId, providerKey: key, stateHash: this.crypto.sha256(state), codeVerifierEnc: this.crypto.encrypt(verifier), expiresAt: new Date(Date.now() + 15 * 60_000) } });
    await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'integration.connect_started', entityType: 'integration', entityId: key });
    return { authorizeUrl: p.authorizeUrl(state, challenge, redirectUri(key)) };
  }

  /** OAuth callback (public route): validates state, exchanges the code, stores tokens encrypted, records accounts. */
  async callback(key: string, code: string | undefined, state: string | undefined, error?: string) {
    if (!state) throw new AppError('Missing state', 400, 'invalid_state');
    const row = await this.prisma.oAuthState.findUnique({ where: { stateHash: this.crypto.sha256(state) } });
    if (!row || row.usedAt || row.expiresAt < new Date() || row.providerKey !== key) throw new AppError('This sign-in link expired. Start again from Integrations.', 400, 'invalid_state');
    const claimed = await this.prisma.oAuthState.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new AppError('This sign-in link was already used', 400, 'invalid_state');
    if (error || !code) {
      await this.audit.record({ organizationId: row.organizationId, actorUserId: row.userId, actor: `user:${row.userId}`, action: 'integration.connect_denied', entityType: 'integration', entityId: key, after: { error } });
      return { organizationId: row.organizationId, connected: 0, error: error ?? 'cancelled' };
    }
    const p = this.provider(key);
    const token = await p.exchangeCode!(code, row.codeVerifierEnc ? this.crypto.decrypt(row.codeVerifierEnc) : '', redirectUri(key));
    const accounts = await p.listAccounts({ token });
    const connected = await this.storeAccounts(row.organizationId, row.userId, key, accounts, token);
    return { organizationId: row.organizationId, connected, error: null };
  }

  private async storeAccounts(orgId: string, userId: string, key: string, accounts: Awaited<ReturnType<AdvertisingProvider['listAccounts']>>, token: TokenSet, extra?: Record<string, string>) {
    if (!accounts.length) throw new AppError('No advertising accounts are accessible with that login', 400, 'no_accounts');
    const tokenData = { accessTokenEnc: this.crypto.encrypt(token.accessToken), refreshTokenEnc: token.refreshToken ? this.crypto.encrypt(token.refreshToken) : extra ? this.crypto.encrypt(JSON.stringify(extra)) : null, expiresAt: token.expiresAt ?? null, refreshedAt: new Date(), tokenType: extra ? 'apple_client_credentials' : 'Bearer' };
    await this.prisma.tenant(orgId, userId, async (tx) => {
      for (const a of accounts) {
        const acc = await tx.connectedAccount.upsert({
          where: { organizationId_providerKey_externalAccountId: { organizationId: orgId, providerKey: key, externalAccountId: a.externalId } },
          create: { organizationId: orgId, providerKey: key, externalAccountId: a.externalId, name: a.name, currency: a.currency, timezone: a.timezone, status: 'CONNECTED', scopes: token.scopes ?? [], connectedById: userId, tokenExpiresAt: token.expiresAt ?? null },
          update: { name: a.name, currency: a.currency, timezone: a.timezone, status: 'CONNECTED', statusDetail: '', deletedAt: null, scopes: token.scopes ?? [], tokenExpiresAt: token.expiresAt ?? null },
        });
        await tx.oAuthToken.upsert({ where: { connectedAccountId: acc.id }, create: { organizationId: orgId, connectedAccountId: acc.id, ...tokenData }, update: tokenData });
      }
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'integration.connected', entityType: 'integration', entityId: key, after: { accounts: accounts.map((a) => a.externalId) }, security: true }, tx);
    });
    for (const a of await this.prisma.connectedAccount.findMany({ where: { organizationId: orgId, providerKey: key, externalAccountId: { in: accounts.map((x) => x.externalId) } } })) {
      await this.refreshPermissions(a.id).catch((e) => this.log.warn(`permissions ${a.id}: ${(e as Error).message}`));
    }
    return accounts.length;
  }

  /** Apple Ads step 1: generate a key pair; the private key is held (encrypted) until the client id arrives. */
  async appleKeyPair(orgId: string, userId: string) {
    await this.assertAvailable(orgId, 'apple_ads');
    const kp = AppleAdsProvider.generateKeyPair();
    await this.redis.client.set(`apple-key:${orgId}:${userId}`, this.crypto.encrypt(kp.privatePem), 'EX', 3600);
    return { publicKey: kp.publicPem, expiresInSeconds: 3600 };
  }

  /** Apple Ads step 2: client id / team id / key id from Apple Ads; verifies by fetching the ACL. */
  async appleConnect(orgId: string, userId: string, dto: { clientId: string; teamId: string; keyId: string }) {
    await this.assertAvailable(orgId, 'apple_ads');
    const enc = await this.redis.client.get(`apple-key:${orgId}:${userId}`);
    if (!enc) throw new AppError('Generate a new key pair first (the previous one expired after an hour)', 400, 'key_expired');
    const extra = { ...dto, privatePem: this.crypto.decrypt(enc) };
    const p = this.provider('apple_ads') as AppleAdsProvider;
    const token = await p.clientToken(extra);
    const accounts = await p.listAccounts({ token });
    const n = await this.storeAccounts(orgId, userId, 'apple_ads', accounts, { ...token, refreshToken: null }, extra);
    await this.redis.client.del(`apple-key:${orgId}:${userId}`);
    return { connected: n };
  }

  /**
   * Decrypted, fresh credentials for an account. Refresh is serialised with a distributed lock so two workers never
   * race a rotating refresh token. Auth failures mark the account EXPIRED and disable its automation.
   */
  async credentials(accountId: string): Promise<Credentials & { provider: AdvertisingProvider; organizationId: string }> {
    const acc = await this.prisma.connectedAccount.findUnique({ where: { id: accountId }, include: { token: true } });
    if (!acc || acc.deletedAt || !acc.token) throw new AppError('Ad account is not connected', 409, 'account_disconnected');
    if (acc.status !== 'CONNECTED') throw new AppError(`Ad account is ${acc.status.toLowerCase()}: ${acc.statusDetail || 'reconnect it in Integrations'}`, 409, 'account_unavailable');
    const p = this.provider(acc.providerKey);
    const apple = acc.token.tokenType === 'apple_client_credentials';
    const extra = apple && acc.token.refreshTokenEnc ? (JSON.parse(this.crypto.decrypt(acc.token.refreshTokenEnc)) as Record<string, string>) : undefined;
    let token: TokenSet = { accessToken: this.crypto.decrypt(acc.token.accessTokenEnc), refreshToken: !apple && acc.token.refreshTokenEnc ? this.crypto.decrypt(acc.token.refreshTokenEnc) : null, expiresAt: acc.token.expiresAt };
    const soon = token.expiresAt && token.expiresAt.getTime() - Date.now() < 5 * 60_000;
    if (soon && p.refresh) {
      const r = await this.redis.withLock(`token-refresh:${acc.id}`, 30_000, async () => {
        const fresh = await this.prisma.oAuthToken.findUniqueOrThrow({ where: { connectedAccountId: acc.id } });
        if (fresh.expiresAt && fresh.expiresAt.getTime() - Date.now() > 5 * 60_000) return { accessToken: this.crypto.decrypt(fresh.accessTokenEnc), refreshToken: token.refreshToken, expiresAt: fresh.expiresAt };
        try {
          const n = await p.refresh!(token, extra);
          await this.prisma.oAuthToken.update({ where: { connectedAccountId: acc.id }, data: { accessTokenEnc: this.crypto.encrypt(n.accessToken), ...(n.refreshToken && !apple ? { refreshTokenEnc: this.crypto.encrypt(n.refreshToken) } : {}), expiresAt: n.expiresAt ?? null, refreshedAt: new Date() } });
          await this.prisma.connectedAccount.update({ where: { id: acc.id }, data: { tokenExpiresAt: n.expiresAt ?? null } });
          return n;
        } catch (e) { await this.handleProviderError(acc.id, e); throw e; }
      });
      if (r.acquired) token = r.value;
      else { await new Promise((ok) => setTimeout(ok, 2000)); return this.credentials(accountId); }
    }
    return { token, account: { externalId: acc.externalAccountId, currency: acc.currency }, extra, provider: p, organizationId: acc.organizationId };
  }

  /** Classifies provider errors: auth → EXPIRED (automation off, notify), permission → ERROR, others logged. */
  async handleProviderError(accountId: string, e: unknown, operation = 'call') {
    const acc = await this.prisma.connectedAccount.findUnique({ where: { id: accountId } });
    if (!acc) return;
    const pe = e instanceof ProviderApiError ? e : null;
    providerErrors.inc({ provider: acc.providerKey, kind: pe?.kind ?? 'unknown' });
    await this.prisma.integrationSyncLog.create({ data: { organizationId: acc.organizationId, connectedAccountId: acc.id, providerKey: acc.providerKey, operation, status: 'error', httpStatus: pe?.status ?? null, errorCode: pe?.kind ?? 'unknown', message: (e as Error).message.slice(0, 1000) } });
    if (pe?.kind === 'auth' || pe?.kind === 'permission') {
      const status = pe.kind === 'auth' ? 'EXPIRED' : 'ERROR';
      await this.prisma.connectedAccount.update({ where: { id: acc.id }, data: { status, statusDetail: pe.message.slice(0, 300), automationEnabled: false } });
      await this.notify.notifyOrg(acc.organizationId, { kind: 'integration_expiring', severity: 'critical', title: `${this.provider(acc.providerKey).name} account “${acc.name}” needs attention`, body: `${pe.kind === 'auth' ? 'Access expired or was revoked' : 'A permission is missing'}. Automation for this account is paused until you reconnect it. Your existing campaigns keep running on the ad platform with their current budgets.`, link: '/integrations', dedupeKey: `integration:${acc.id}:${status}:${new Date().toISOString().slice(0, 10)}`, permission: 'integrations.read' });
    }
  }

  async refreshPermissions(accountId: string) {
    const c = await this.credentials(accountId);
    const perms = await c.provider.checkPermissions(c);
    await this.prisma.$transaction(Object.entries(perms).map(([capability, granted]) => this.prisma.integrationPermission.upsert({
      where: { connectedAccountId_capability: { connectedAccountId: accountId, capability } }, create: { organizationId: c.organizationId, connectedAccountId: accountId, capability, granted }, update: { granted, checkedAt: new Date() },
    })));
    return perms;
  }

  async refreshPermissionsFor(orgId: string, id: string) {
    const acc = await this.prisma.connectedAccount.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
    if (!acc) throw notFound('Account');
    try { return { permissions: await this.refreshPermissions(id) }; } catch (e) { await this.handleProviderError(id, e, 'check_permissions'); throw new AppError((e as Error).message, 502, 'provider_error'); }
  }

  async liveAccounts(orgId: string, key: string) {
    const acc = await this.prisma.connectedAccount.findFirst({ where: { organizationId: orgId, providerKey: key, deletedAt: null, status: 'CONNECTED' } });
    if (!acc) throw new AppError('Connect this provider first', 409, 'not_connected');
    const c = await this.credentials(acc.id);
    try { return await c.provider.listAccounts(c); } catch (e) { await this.handleProviderError(acc.id, e, 'list_accounts'); throw new AppError(`${c.provider.name}: ${(e as Error).message}`, 502, 'provider_error'); }
  }

  async disconnect(orgId: string, userId: string, id: string) {
    const acc = await this.prisma.connectedAccount.findFirst({ where: { id, organizationId: orgId, deletedAt: null }, include: { token: true, _count: { select: { campaigns: { where: { status: 'ACTIVE' } } } } } });
    if (!acc) throw notFound('Account');
    if (acc.token && acc.token.tokenType !== 'apple_client_credentials') {
      const p = AD_PROVIDERS[acc.providerKey];
      const others = await this.prisma.connectedAccount.count({ where: { organizationId: orgId, providerKey: acc.providerKey, deletedAt: null, id: { not: id } } });
      if (p?.revoke && !others) await p.revoke({ accessToken: this.crypto.decrypt(acc.token.accessTokenEnc), refreshToken: acc.token.refreshTokenEnc ? this.crypto.decrypt(acc.token.refreshTokenEnc) : null });
    }
    await this.prisma.tenant(orgId, userId, async (tx) => {
      await tx.oAuthToken.deleteMany({ where: { connectedAccountId: id } });
      await tx.connectedAccount.update({ where: { id }, data: { status: 'DISCONNECTED', automationEnabled: false, deletedAt: new Date() } });
      // Campaigns stay on the ad platform; we can no longer manage them, so mark them and stop automation.
      await tx.campaign.updateMany({ where: { connectedAccountId: id, status: { in: ['ACTIVE', 'PAUSED', 'READY'] } }, data: { automationEnabled: false, statusReason: 'Ad account disconnected — manage this campaign in the ad platform' } });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'integration.disconnected', entityType: 'connected_account', entityId: id, after: { provider: acc.providerKey, activeCampaigns: acc._count.campaigns }, security: true }, tx);
    });
    return { disconnected: true, activeCampaignsLeftRunning: acc._count.campaigns };
  }

  async mapApplications(orgId: string, userId: string, id: string, links: { applicationId: string; externalAppId?: string }[]) {
    return this.prisma.tenant(orgId, userId, async (tx) => {
      const acc = await tx.connectedAccount.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
      if (!acc) throw notFound('Account');
      const apps = await tx.application.count({ where: { id: { in: links.map((l) => l.applicationId) }, organizationId: orgId, deletedAt: null } });
      if (apps !== links.length) throw notFound('Application');
      await tx.accountApplication.deleteMany({ where: { connectedAccountId: id } });
      if (links.length) await tx.accountApplication.createMany({ data: links.map((l) => ({ organizationId: orgId, connectedAccountId: id, applicationId: l.applicationId, externalAppId: l.externalAppId?.trim() || null })) });
      await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: 'integration.apps_mapped', entityType: 'connected_account', entityId: id, after: links }, tx);
    });
  }

  async setAutomation(orgId: string, userId: string, id: string, enabled: boolean) {
    const acc = await this.prisma.connectedAccount.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
    if (!acc) throw notFound('Account');
    if (enabled && acc.status !== 'CONNECTED') throw new AppError('Reconnect the account before enabling automation', 409, 'account_unavailable');
    await this.prisma.connectedAccount.update({ where: { id }, data: { automationEnabled: enabled } });
    await this.audit.record({ organizationId: orgId, actorUserId: userId, actor: `user:${userId}`, action: enabled ? 'integration.automation_on' : 'integration.automation_off', entityType: 'connected_account', entityId: id });
  }

  async requestSync(orgId: string, userId: string, id: string) {
    const acc = await this.prisma.connectedAccount.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
    if (!acc) throw notFound('Account');
    const job = await queue(QUEUES.sync).add('account', { organizationId: orgId, connectedAccountId: id, requestedById: userId }, { jobId: `sync:${id}:${Math.floor(Date.now() / 60_000)}` });
    return { queued: true, jobId: job.id };
  }

  async logs(orgId: string, userId: string, id: string) {
    return this.prisma.tenant(orgId, userId, (tx) => tx.integrationSyncLog.findMany({ where: { organizationId: orgId, connectedAccountId: id }, orderBy: { startedAt: 'desc' }, take: 50 }));
  }
}
