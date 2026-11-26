import { AdAccount, AdvertisingProvider, call, CampaignSpec, Credentials, major, MetricRow, ProviderApiError, TokenSet } from './types';

const B = 'https://business-api.tiktok.com/open_api/v1.3';
interface Envelope<T> { code: number; message: string; data: T }

/**
 * TikTok API for Business — App Promotion (APP_INSTALL) campaigns.
 * Requires a TikTok for Business developer app approved for the Marketing API scopes (campaign, ad group, reporting).
 * Docs: https://business-api.tiktok.com/portal/docs
 */
export class TikTokAdsProvider implements AdvertisingProvider {
  key = 'tiktok_ads'; enumKey = 'TIKTOK_ADS' as const; name = 'TikTok Ads'; authType = 'oauth' as const;
  readiness = 'implemented_unverified' as const;

  configured() { return !!(process.env.TIKTOK_APP_ID && process.env.TIKTOK_APP_SECRET); }
  setupChecklist() {
    return [
      'Register a developer app at business-api.tiktok.com and request Ads Management + Reporting scopes',
      'Set the advertiser redirect URL to https://marketing.noushealthcare.online/api/v1/integrations/tiktok_ads/callback',
      'Set TIKTOK_APP_ID and TIKTOK_APP_SECRET',
      'Customers add their app in TikTok Ads Manager (App Management) so it has a TikTok app id',
    ];
  }

  private async req<T>(path: string, t: TokenSet | null, init: { method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
    const url = `${B}${path}${init.query ? `?${new URLSearchParams(init.query)}` : ''}`;
    const r = await call<Envelope<T>>(this.key, url, { method: init.method ?? 'GET', headers: { 'Content-Type': 'application/json', ...(t ? { 'Access-Token': t.accessToken } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined });
    if (r.code !== 0) {
      const kind = [40100, 40101, 40102, 40104, 40105].includes(r.code) ? 'auth' : r.code === 40001 || r.code === 40002 ? 'permission' : r.code === 40100 || r.code === 51021 ? 'rate_limit' : 'invalid';
      throw new ProviderApiError(this.key, `TikTok ${r.code}: ${r.message}`, null, kind, r);
    }
    return r.data;
  }

  authorizeUrl(state: string, _c: string, redirectUri: string) {
    return `https://business-api.tiktok.com/portal/auth?${new URLSearchParams({ app_id: process.env.TIKTOK_APP_ID!, state, redirect_uri: redirectUri })}`;
  }
  async exchangeCode(code: string): Promise<TokenSet> {
    const d = await this.req<{ access_token: string; advertiser_ids: string[]; scope: number[] }>('/oauth2/access_token/', null, { method: 'POST', body: { app_id: process.env.TIKTOK_APP_ID, secret: process.env.TIKTOK_APP_SECRET, auth_code: code } });
    return { accessToken: d.access_token, refreshToken: null, expiresAt: null, scopes: (d.scope ?? []).map(String) }; // long-lived until revoked
  }
  async refresh(t: TokenSet) { return t; }
  async revoke(t: TokenSet) { await this.req('/oauth2/revoke_token/', null, { method: 'POST', body: { app_id: process.env.TIKTOK_APP_ID, secret: process.env.TIKTOK_APP_SECRET, access_token: t.accessToken } }).catch(() => undefined); }

  async listAccounts(c: Pick<Credentials, 'token'>): Promise<AdAccount[]> {
    const adv = await this.req<{ list: { advertiser_id: string; advertiser_name: string }[] }>('/oauth2/advertiser/get/', c.token, { query: { app_id: process.env.TIKTOK_APP_ID!, secret: process.env.TIKTOK_APP_SECRET! } });
    if (!adv.list.length) return [];
    const info = await this.req<{ list: { advertiser_id: string; name: string; currency: string; timezone: string; status: string }[] }>('/advertiser/info/', c.token, { query: { advertiser_ids: JSON.stringify(adv.list.map((a) => a.advertiser_id)) } });
    return info.list.map((a) => ({ externalId: a.advertiser_id, name: a.name, currency: a.currency, timezone: a.timezone, status: a.status }));
  }

  async checkPermissions(c: Credentials) {
    try { await this.req('/campaign/get/', c.token, { query: { advertiser_id: c.account.externalId, page_size: '1' } }); return { read_reports: true, manage_campaigns: true }; }
    catch (e) { if (e instanceof ProviderApiError && (e.kind === 'auth' || e.kind === 'permission')) return { read_reports: false, manage_campaigns: false }; throw e; }
  }

  async createCampaign(c: Credentials, s: CampaignSpec, idem: string) {
    const tag = `[ag:${idem.slice(0, 12)}]`;
    const found = await this.req<{ list: { campaign_id: string; operation_status: string; campaign_name: string }[] }>('/campaign/get/', c.token, { query: { advertiser_id: c.account.externalId, filtering: JSON.stringify({ campaign_name: tag }), page_size: '10' } });
    const hit = found.list.find((x) => x.campaign_name.includes(tag));
    if (hit) return { externalCampaignId: hit.campaign_id, externalStatus: hit.operation_status };
    if (!s.externalAppId) throw new ProviderApiError(this.key, 'Set the TikTok app id for this app (Integrations → app mapping) before creating TikTok campaigns', null, 'invalid');
    const camp = await this.req<{ campaign_id: string }>('/campaign/create/', c.token, { method: 'POST', body: {
      advertiser_id: c.account.externalId, campaign_name: `${s.name} ${tag}`.slice(0, 512), objective_type: 'APP_PROMOTION', app_promotion_type: 'APP_INSTALL',
      budget_mode: 'BUDGET_MODE_DAY', budget: Number(major(s.dailyBudgetMinor)), operation_status: 'DISABLE',
    } });
    const adgroup = await this.req<{ adgroup_id: string }>('/adgroup/create/', c.token, { method: 'POST', body: {
      advertiser_id: c.account.externalId, campaign_id: camp.campaign_id, adgroup_name: `${s.name} ad group`, app_id: s.externalAppId, operating_systems: [s.platform],
      placement_type: 'PLACEMENT_TYPE_AUTOMATIC', location_ids: s.countries, optimization_goal: 'INSTALL', billing_event: 'OCPM', bid_type: s.targetCpiMinor ? 'BID_TYPE_CUSTOM' : 'BID_TYPE_NO_BID',
      ...(s.targetCpiMinor ? { conversion_bid_price: Number(major(s.targetCpiMinor)) } : {}), budget_mode: 'BUDGET_MODE_INFINITE', schedule_type: s.endDate ? 'SCHEDULE_START_END' : 'SCHEDULE_FROM_NOW',
      schedule_start_time: s.startDate.toISOString().replace('T', ' ').slice(0, 19), ...(s.endDate ? { schedule_end_time: s.endDate.toISOString().replace('T', ' ').slice(0, 19) } : {}), pacing: 'PACING_MODE_SMOOTH',
    } });
    return { externalCampaignId: camp.campaign_id, externalStatus: 'DISABLE', children: { adgroup: adgroup.adgroup_id } };
  }

  async setStatus(c: Credentials, id: string, status: 'ACTIVE' | 'PAUSED') {
    const op = status === 'ACTIVE' ? 'ENABLE' : 'DISABLE';
    await this.req('/campaign/status/update/', c.token, { method: 'POST', body: { advertiser_id: c.account.externalId, campaign_ids: [id], operation_status: op } });
    return op;
  }
  async setDailyBudget(c: Credentials, id: string, dailyMinor: bigint) { await this.req('/campaign/update/', c.token, { method: 'POST', body: { advertiser_id: c.account.externalId, campaign_id: id, budget: Number(major(dailyMinor)) } }); }
  async getStatus(c: Credentials, id: string) {
    const r = await this.req<{ list: { operation_status: string; secondary_status: string }[] }>('/campaign/get/', c.token, { query: { advertiser_id: c.account.externalId, filtering: JSON.stringify({ campaign_ids: [id] }) } });
    if (!r.list[0]) throw new ProviderApiError(this.key, 'Campaign not found on TikTok', 404, 'invalid');
    return `${r.list[0].operation_status}/${r.list[0].secondary_status}`;
  }

  async metrics(c: Credentials, ids: string[], from: string, to: string): Promise<MetricRow[]> {
    if (!ids.length) return [];
    const r = await this.req<{ list: { dimensions: { campaign_id: string; stat_time_day: string }; metrics: { spend: string; impressions: string; clicks: string; app_install: string } }[] }>('/report/integrated/get/', c.token, { query: {
      advertiser_id: c.account.externalId, report_type: 'BASIC', data_level: 'AUCTION_CAMPAIGN', dimensions: JSON.stringify(['campaign_id', 'stat_time_day']),
      metrics: JSON.stringify(['spend', 'impressions', 'clicks', 'app_install']), start_date: from, end_date: to, filtering: JSON.stringify([{ field_name: 'campaign_ids', filter_type: 'IN', filter_value: JSON.stringify(ids) }]), page_size: '1000',
    } });
    return r.list.map((x) => {
      const [w, f = '0'] = (x.metrics.spend ?? '0').split('.');
      return { externalCampaignId: x.dimensions.campaign_id, date: x.dimensions.stat_time_day.slice(0, 10), country: 'ZZ', impressions: BigInt(x.metrics.impressions || 0), clicks: BigInt(x.metrics.clicks || 0), installs: Number(x.metrics.app_install || 0), spendMinor: BigInt(w) * 100n + BigInt((f + '00').slice(0, 2)) };
    });
  }
}
