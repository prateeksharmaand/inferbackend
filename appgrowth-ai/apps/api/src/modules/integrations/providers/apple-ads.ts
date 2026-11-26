import { createPrivateKey, createSign, generateKeyPairSync } from 'crypto';
import { AdAccount, AdvertisingProvider, call, CampaignSpec, Credentials, major, MetricRow, ProviderApiError, TokenSet } from './types';

const B = 'https://api.searchads.apple.com/api/v5';
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** DER ECDSA signature → JOSE raw r||s (64 bytes) for ES256. */
function derToJose(der: Buffer): Buffer {
  let i = 2; if (der[1] & 0x80) i += der[1] & 0x7f;
  const rLen = der[i + 1]; let r = der.subarray(i + 2, i + 2 + rLen); i = i + 2 + rLen;
  const sLen = der[i + 1]; let s = der.subarray(i + 2, i + 2 + sLen);
  r = r[0] === 0 ? r.subarray(1) : r; s = s[0] === 0 ? s.subarray(1) : s;
  return Buffer.concat([Buffer.alloc(32 - r.length), r, Buffer.alloc(32 - s.length), s]);
}

/**
 * Apple Ads Campaign Management API v5 (Search results campaigns, iOS only).
 * Auth: OAuth client credentials. We generate an EC P-256 key pair; the customer uploads the public key in
 * Apple Ads → Account Settings → API and gives us the client id, team id and key id. The private key never leaves us.
 * Docs: https://developer.apple.com/documentation/apple_ads
 */
export class AppleAdsProvider implements AdvertisingProvider {
  key = 'apple_ads'; enumKey = 'APPLE_ADS' as const; name = 'Apple Ads'; authType = 'apple_client_credentials' as const;
  readiness = 'implemented_unverified' as const;

  configured() { return true; } // per-customer credentials; nothing platform-wide is needed
  setupChecklist() {
    return [
      'In Apple Ads, invite an API user (role: API Account Manager or API Account Read Only for reporting only)',
      'In AppGrowth, generate a key pair and upload the public key in Apple Ads → Account Settings → API',
      'Copy the client id, team id and key id back into AppGrowth',
    ];
  }

  static generateKeyPair() {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    return { privatePem: privateKey.export({ type: 'sec1', format: 'pem' }).toString(), publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
  }

  /** Client secret = ES256 JWT (max 180 days); access token valid 1 hour. */
  async clientToken(extra: Record<string, string>): Promise<TokenSet> {
    const { clientId, teamId, keyId, privatePem } = extra;
    if (!clientId || !teamId || !keyId || !privatePem) throw new ProviderApiError(this.key, 'Apple Ads credentials incomplete', null, 'auth');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64url(JSON.stringify({ alg: 'ES256', kid: keyId }))}.${b64url(JSON.stringify({ sub: clientId, aud: 'https://appleid.apple.com', iat: now, exp: now + 86400, iss: teamId }))}`;
    const sig = derToJose(createSign('SHA256').update(unsigned).sign(createPrivateKey(privatePem)));
    const r = await call<{ access_token: string; expires_in: number }>(this.key, 'https://appleid.apple.com/auth/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Host: 'appleid.apple.com' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: `${unsigned}.${b64url(sig)}`, scope: 'searchadsorg' }),
    });
    return { accessToken: r.access_token, expiresAt: new Date(Date.now() + (r.expires_in - 60) * 1000) };
  }
  async refresh(_t: TokenSet, extra?: Record<string, string>) { return this.clientToken(extra ?? {}); }

  private h(c: { token: TokenSet; account?: { externalId: string } }) {
    return { Authorization: `Bearer ${c.token.accessToken}`, 'Content-Type': 'application/json', ...(c.account ? { 'X-AP-Context': `orgId=${c.account.externalId}` } : {}) };
  }

  async listAccounts(c: Pick<Credentials, 'token'>): Promise<AdAccount[]> {
    const r = await call<{ data: { orgId: number; orgName: string; currency: string; timeZone: string; roleNames: string[] }[] }>(this.key, `${B}/acls`, { headers: this.h(c) });
    return r.data.map((o) => ({ externalId: String(o.orgId), name: o.orgName, currency: o.currency, timezone: o.timeZone, status: o.roleNames.join(',') }));
  }

  async checkPermissions(c: Credentials) {
    const r = await call<{ data: { orgId: number; roleNames: string[] }[] }>(this.key, `${B}/acls`, { headers: this.h({ token: c.token }) });
    const roles = r.data.find((o) => String(o.orgId) === c.account.externalId)?.roleNames ?? [];
    const manage = roles.some((x) => /Admin|Campaign Manager|Account Manager/i.test(x) && !/Read Only/i.test(x));
    return { read_reports: roles.length > 0, manage_campaigns: manage };
  }

  async createCampaign(c: Credentials, s: CampaignSpec, idem: string) {
    if (s.platform !== 'IOS') throw new ProviderApiError(this.key, 'Apple Ads promotes iOS apps only', null, 'invalid');
    if (!s.app.appleAppId) throw new ProviderApiError(this.key, 'The app needs its App Store id (adamId)', null, 'invalid');
    const tag = `[ag:${idem.slice(0, 12)}]`;
    const found = await call<{ data: { id: number; status: string; name: string }[] }>(this.key, `${B}/campaigns/find`, { method: 'POST', headers: this.h(c), body: JSON.stringify({ conditions: [{ field: 'name', operator: 'CONTAINS', values: [tag] }], pagination: { offset: 0, limit: 5 } }) });
    if (found.data[0]) return { externalCampaignId: String(found.data[0].id), externalStatus: found.data[0].status };
    const money = (m: bigint) => ({ amount: major(m), currency: s.currency });
    const camp = await call<{ data: { id: number; status: string } }>(this.key, `${B}/campaigns`, { method: 'POST', headers: this.h(c), body: JSON.stringify({
      orgId: Number(c.account.externalId), name: `${s.name} ${tag}`, adamId: Number(s.app.appleAppId), dailyBudgetAmount: money(s.dailyBudgetMinor), countriesOrRegions: s.countries,
      adChannelType: 'SEARCH', supplySources: ['APPSTORE_SEARCH_RESULTS'], billingEvent: 'TAPS', status: 'PAUSED',
    }) });
    const group = await call<{ data: { id: number } }>(this.key, `${B}/campaigns/${camp.data.id}/adgroups`, { method: 'POST', headers: this.h(c), body: JSON.stringify({
      name: `${s.name} search match`, pricingModel: 'CPC', defaultBidAmount: money(s.targetCpiMinor ? s.targetCpiMinor / 2n : 5000n), ...(s.targetCpiMinor ? { cpaGoal: money(s.targetCpiMinor) } : {}),
      startTime: s.startDate.toISOString().slice(0, 19) + '.000', ...(s.endDate ? { endTime: s.endDate.toISOString().slice(0, 19) + '.000' } : {}), automatedKeywordsOptIn: true, status: 'ENABLED',
    }) });
    return { externalCampaignId: String(camp.data.id), externalStatus: camp.data.status, children: { adGroup: String(group.data.id) } };
  }

  async setStatus(c: Credentials, id: string, status: 'ACTIVE' | 'PAUSED') {
    const st = status === 'ACTIVE' ? 'ENABLED' : 'PAUSED';
    await call(this.key, `${B}/campaigns/${id}`, { method: 'PUT', headers: this.h(c), body: JSON.stringify({ campaign: { status: st } }) });
    return st;
  }
  async setDailyBudget(c: Credentials, id: string, dailyMinor: bigint, currency: string) {
    await call(this.key, `${B}/campaigns/${id}`, { method: 'PUT', headers: this.h(c), body: JSON.stringify({ campaign: { dailyBudgetAmount: { amount: major(dailyMinor), currency } } }) });
  }
  async getStatus(c: Credentials, id: string) {
    const r = await call<{ data: { status: string; servingStatus: string; displayStatus: string } }>(this.key, `${B}/campaigns/${id}`, { headers: this.h(c) });
    return `${r.data.status}/${r.data.displayStatus ?? r.data.servingStatus}`;
  }

  async metrics(c: Credentials, ids: string[], from: string, to: string): Promise<MetricRow[]> {
    if (!ids.length) return [];
    const r = await call<{ data: { reportingDataResponse: { row: { metadata: { campaignId: number }; granularity: { date: string; impressions: number; taps: number; totalInstalls?: number; tapInstalls?: number; localSpend: { amount: string } }[] }[] } } }>(this.key, `${B}/reports/campaigns`, {
      method: 'POST', headers: this.h(c), body: JSON.stringify({ startTime: from, endTime: to, granularity: 'DAILY', timeZone: 'UTC', returnRecordsWithNoMetrics: false, returnRowTotals: false, returnGrandTotals: false,
        selector: { orderBy: [{ field: 'campaignId', sortOrder: 'ASCENDING' }], conditions: [{ field: 'campaignId', operator: 'IN', values: ids }], pagination: { offset: 0, limit: 1000 } } }),
    });
    const out: MetricRow[] = [];
    for (const row of r.data.reportingDataResponse.row ?? []) for (const g of row.granularity ?? []) {
      const [w, f = '0'] = (g.localSpend?.amount ?? '0').split('.');
      out.push({ externalCampaignId: String(row.metadata.campaignId), date: g.date, country: 'ZZ', impressions: BigInt(g.impressions ?? 0), clicks: BigInt(g.taps ?? 0), installs: g.totalInstalls ?? g.tapInstalls ?? 0, spendMinor: BigInt(w) * 100n + BigInt((f + '00').slice(0, 2)) });
    }
    return out;
  }
}
