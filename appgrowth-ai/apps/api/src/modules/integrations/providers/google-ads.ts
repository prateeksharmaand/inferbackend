import { AdAccount, AdvertisingProvider, call, CampaignSpec, Credentials, isoDate, MetricRow, ProviderApiError, TokenSet } from './types';

const V = () => process.env.GOOGLE_ADS_API_VERSION ?? 'v22';
const BASE = () => `https://googleads.googleapis.com/${V()}`;
type Row = Record<string, Record<string, unknown>>;

/**
 * Google Ads API (REST) — App campaigns (MULTI_CHANNEL / APP_CAMPAIGN) for Android and iOS.
 * Requires: OAuth client (GOOGLE_OAUTH_CLIENT_ID/SECRET) and an approved developer token (GOOGLE_ADS_DEVELOPER_TOKEN,
 * Basic or Standard access to manage real accounts; test-account access only works with test accounts).
 * Docs: https://developers.google.com/google-ads/api/docs/app-campaigns/overview
 */
export class GoogleAdsProvider implements AdvertisingProvider {
  key = 'google_ads'; enumKey = 'GOOGLE_ADS' as const; name = 'Google Ads'; authType = 'oauth' as const;
  readiness = 'implemented_unverified' as const;

  configured() { return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_ADS_DEVELOPER_TOKEN); }
  setupChecklist() {
    return [
      'Create an OAuth client (Web application) in Google Cloud; add the redirect URI https://marketing.noushealthcare.online/api/v1/integrations/google_ads/callback',
      'Enable the Google Ads API for the Cloud project',
      'Apply for a Google Ads API developer token (Basic access needed to manage live accounts) from a manager account',
      'Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN (and GOOGLE_ADS_LOGIN_CUSTOMER_ID if using a manager account)',
      'Complete OAuth consent screen verification for the adwords scope before onboarding external customers',
    ];
  }

  authorizeUrl(state: string, challenge: string, redirectUri: string) {
    const p = new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!, redirect_uri: redirectUri, response_type: 'code', scope: 'https://www.googleapis.com/auth/adwords', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state, code_challenge: challenge, code_challenge_method: 'S256' });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  }

  private async token(body: Record<string, string>): Promise<TokenSet> {
    const r = await call<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>(this.key, 'https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!, ...body }),
    });
    return { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: new Date(Date.now() + (r.expires_in - 60) * 1000), scopes: r.scope?.split(' ') };
  }
  exchangeCode(code: string, verifier: string, redirectUri: string) { return this.token({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri }); }
  async refresh(t: TokenSet) {
    if (!t.refreshToken) throw new ProviderApiError(this.key, 'No refresh token; reconnect the account', 401, 'auth');
    const n = await this.token({ grant_type: 'refresh_token', refresh_token: t.refreshToken });
    return { ...n, refreshToken: n.refreshToken ?? t.refreshToken };
  }
  async revoke(t: TokenSet) { await call(this.key, `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.refreshToken ?? t.accessToken)}`, { method: 'POST' }).catch(() => undefined); }

  private headers(t: TokenSet, loginCustomerId?: string) {
    const h: Record<string, string> = { Authorization: `Bearer ${t.accessToken}`, 'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '', 'Content-Type': 'application/json' };
    const login = loginCustomerId ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    if (login) h['login-customer-id'] = login.replace(/-/g, '');
    return h;
  }
  private async search(c: Pick<Credentials, 'token' | 'extra'>, customerId: string, query: string): Promise<Row[]> {
    const out: Row[] = []; let pageToken: string | undefined;
    do {
      const r = await call<{ results?: Row[]; nextPageToken?: string }>(this.key, `${BASE()}/customers/${customerId}/googleAds:search`, { method: 'POST', headers: this.headers(c.token, c.extra?.loginCustomerId), body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }) });
      out.push(...(r.results ?? [])); pageToken = r.nextPageToken;
    } while (pageToken);
    return out;
  }
  private async mutate(c: Credentials, resource: string, operations: unknown[]) {
    const r = await call<{ results: { resourceName: string }[] }>(this.key, `${BASE()}/customers/${c.account.externalId}/${resource}:mutate`, { method: 'POST', headers: this.headers(c.token, c.extra?.loginCustomerId), body: JSON.stringify({ operations }) });
    return r.results.map((x) => x.resourceName);
  }

  async listAccounts(c: Pick<Credentials, 'token' | 'extra'>): Promise<AdAccount[]> {
    const r = await call<{ resourceNames?: string[] }>(this.key, `${BASE()}/customers:listAccessibleCustomers`, { headers: this.headers(c.token) });
    const out: AdAccount[] = [];
    for (const rn of r.resourceNames ?? []) {
      const id = rn.split('/')[1];
      try {
        const [row] = await this.search({ ...c, extra: { ...c.extra, loginCustomerId: id } }, id, 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.status FROM customer');
        const cu = row?.customer as { descriptiveName?: string; currencyCode?: string; timeZone?: string; manager?: boolean; status?: string } | undefined;
        if (cu && !cu.manager) out.push({ externalId: id, name: cu.descriptiveName || `Google Ads ${id}`, currency: cu.currencyCode ?? null, timezone: cu.timeZone ?? null, status: cu.status });
      } catch (e) { if (e instanceof ProviderApiError && e.kind === 'auth') throw e; }
    }
    return out;
  }

  async checkPermissions(c: Credentials) {
    try {
      await this.search(c, c.account.externalId, 'SELECT customer.id FROM customer LIMIT 1');
      return { read_reports: true, manage_campaigns: true };
    } catch (e) {
      if (e instanceof ProviderApiError && (e.kind === 'permission' || e.kind === 'auth')) return { read_reports: false, manage_campaigns: false };
      throw e;
    }
  }

  private async geo(c: Credentials, country: string) {
    const rows = await this.search(c, c.account.externalId, `SELECT geo_target_constant.resource_name FROM geo_target_constant WHERE geo_target_constant.country_code = '${country.replace(/[^A-Z]/g, '')}' AND geo_target_constant.target_type = 'Country'`);
    return (rows[0]?.geoTargetConstant as { resourceName?: string })?.resourceName;
  }
  private async language(c: Credentials, code: string) {
    const rows = await this.search(c, c.account.externalId, `SELECT language_constant.resource_name FROM language_constant WHERE language_constant.code = '${code.replace(/[^a-zA-Z-]/g, '').split('-')[0]}'`);
    return (rows[0]?.languageConstant as { resourceName?: string })?.resourceName;
  }

  async createCampaign(c: Credentials, s: CampaignSpec, idem: string) {
    // Idempotency: a campaign created by an earlier attempt carries the key in its name; reuse it.
    const tag = `[ag:${idem.slice(0, 12)}]`;
    const existing = await this.search(c, c.account.externalId, `SELECT campaign.id, campaign.status FROM campaign WHERE campaign.name LIKE '%${tag}%'`);
    if (existing[0]) return { externalCampaignId: String((existing[0].campaign as { id: string }).id), externalStatus: String((existing[0].campaign as { status: string }).status) };
    const appId = s.platform === 'ANDROID' ? s.app.androidPackage : s.app.appleAppId;
    if (!appId) throw new ProviderApiError(this.key, `Missing ${s.platform === 'ANDROID' ? 'package name' : 'App Store id'} for the app`, null, 'invalid');
    const [budget] = await this.mutate(c, 'campaignBudgets', [{ create: { name: `${s.name} budget ${tag}`, amountMicros: String(s.dailyBudgetMinor * 10_000n), deliveryMethod: 'STANDARD', explicitlyShared: false } }]);
    const campaign: Record<string, unknown> = {
      name: `${s.name} ${tag}`, status: 'PAUSED', advertisingChannelType: 'MULTI_CHANNEL', advertisingChannelSubType: 'APP_CAMPAIGN', campaignBudget: budget,
      appCampaignSetting: { appId, appStore: s.platform === 'ANDROID' ? 'GOOGLE_APP_STORE' : 'APPLE_APP_STORE', biddingStrategyGoalType: 'OPTIMIZE_INSTALLS_TARGET_INSTALL_COST' },
      startDate: isoDate(s.startDate), ...(s.endDate ? { endDate: isoDate(s.endDate) } : {}),
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
      ...(s.targetCpiMinor ? { targetCpa: { targetCpaMicros: String(s.targetCpiMinor * 10_000n) } } : { maximizeConversions: {} }),
    };
    const [campaignRn] = await this.mutate(c, 'campaigns', [{ create: campaign }]);
    const criteria: unknown[] = [];
    for (const cc of s.countries) { const g = await this.geo(c, cc); if (g) criteria.push({ create: { campaign: campaignRn, location: { geoTargetConstant: g } } }); }
    for (const l of s.languages) { const g = await this.language(c, l); if (g) criteria.push({ create: { campaign: campaignRn, language: { languageConstant: g } } }); }
    if (criteria.length) await this.mutate(c, 'campaignCriteria', criteria);
    const [adGroup] = await this.mutate(c, 'adGroups', [{ create: { name: `${s.name} ad group`, campaign: campaignRn, status: 'ENABLED' } }]);
    const headlines = s.creatives.headlines.filter((h) => h.length <= 30).slice(0, 5);
    const descriptions = s.creatives.descriptions.filter((d) => d.length <= 90).slice(0, 5);
    if (headlines.length && descriptions.length) {
      await this.mutate(c, 'adGroupAds', [{ create: { adGroup, status: 'ENABLED', ad: { appAd: { headlines: headlines.map((text) => ({ text })), descriptions: descriptions.map((text) => ({ text })) } } } }]);
    }
    return { externalCampaignId: campaignRn.split('/').pop()!, externalStatus: 'PAUSED', children: { budget, adGroup } };
  }

  async setStatus(c: Credentials, id: string, status: 'ACTIVE' | 'PAUSED') {
    await this.mutate(c, 'campaigns', [{ update: { resourceName: `customers/${c.account.externalId}/campaigns/${id}`, status: status === 'ACTIVE' ? 'ENABLED' : 'PAUSED' }, updateMask: 'status' }]);
    return status === 'ACTIVE' ? 'ENABLED' : 'PAUSED';
  }

  async setDailyBudget(c: Credentials, id: string, dailyMinor: bigint) {
    const [row] = await this.search(c, c.account.externalId, `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${Number(id)}`);
    const budget = (row?.campaign as { campaignBudget?: string })?.campaignBudget;
    if (!budget) throw new ProviderApiError(this.key, 'Campaign budget not found', 404, 'invalid');
    await this.mutate(c, 'campaignBudgets', [{ update: { resourceName: budget, amountMicros: String(dailyMinor * 10_000n) }, updateMask: 'amount_micros' }]);
  }

  async getStatus(c: Credentials, id: string) {
    const [row] = await this.search(c, c.account.externalId, `SELECT campaign.status, campaign.serving_status, campaign.primary_status FROM campaign WHERE campaign.id = ${Number(id)}`);
    const cp = row?.campaign as { status?: string; primaryStatus?: string } | undefined;
    if (!cp) throw new ProviderApiError(this.key, 'Campaign not found on Google Ads', 404, 'invalid');
    return `${cp.status}${cp.primaryStatus ? `/${cp.primaryStatus}` : ''}`;
  }

  async metrics(c: Credentials, ids: string[], from: string, to: string): Promise<MetricRow[]> {
    if (!ids.length) return [];
    const rows = await this.search(c, c.account.externalId, `SELECT campaign.id, segments.date, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros FROM campaign WHERE campaign.id IN (${ids.map(Number).join(',')}) AND segments.date BETWEEN '${from}' AND '${to}'`);
    return rows.map((r) => {
      const m = r.metrics as { impressions?: string; clicks?: string; conversions?: number; costMicros?: string };
      return { externalCampaignId: String((r.campaign as { id: string }).id), date: String((r.segments as { date: string }).date), country: 'ZZ', impressions: BigInt(m.impressions ?? 0), clicks: BigInt(m.clicks ?? 0), installs: Math.round(Number(m.conversions ?? 0)), spendMinor: BigInt(m.costMicros ?? 0) / 10_000n };
    });
  }
}
