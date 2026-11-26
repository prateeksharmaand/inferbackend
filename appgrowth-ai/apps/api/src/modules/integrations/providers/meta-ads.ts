import { AdAccount, AdvertisingProvider, call, CampaignSpec, Credentials, MetricRow, ProviderApiError, TokenSet } from './types';

const V = () => process.env.META_GRAPH_VERSION ?? 'v23.0';
const G = () => `https://graph.facebook.com/${V()}`;

/**
 * Meta Marketing API — App Promotion campaigns (OUTCOME_APP_PROMOTION, optimised for APP_INSTALLS).
 * Requires a Meta app with Marketing API access and Advanced Access for ads_management/ads_read (App Review),
 * and the customer's app registered in Meta (application id) with its store URL.
 * Docs: https://developers.facebook.com/docs/marketing-api/
 */
export class MetaAdsProvider implements AdvertisingProvider {
  key = 'meta_ads'; enumKey = 'META_ADS' as const; name = 'Meta Ads'; authType = 'oauth' as const;
  readiness = 'implemented_unverified' as const;

  configured() { return !!(process.env.META_APP_ID && process.env.META_APP_SECRET); }
  setupChecklist() {
    return [
      'Create a Meta app (Business type) and add the Marketing API product',
      'Add the OAuth redirect URI https://marketing.noushealthcare.online/api/v1/integrations/meta_ads/callback',
      'Pass App Review for Advanced Access to ads_management and ads_read',
      'Set META_APP_ID and META_APP_SECRET',
      'Each customer registers their app in Meta (App Dashboard) so its application id can be used as the promoted object',
    ];
  }

  authorizeUrl(state: string, _challenge: string, redirectUri: string) {
    const p = new URLSearchParams({ client_id: process.env.META_APP_ID!, redirect_uri: redirectUri, state, scope: 'ads_management,ads_read,business_management', response_type: 'code' });
    return `https://www.facebook.com/${V()}/dialog/oauth?${p}`;
  }

  async exchangeCode(code: string, _verifier: string, redirectUri: string): Promise<TokenSet> {
    const short = await call<{ access_token: string }>(this.key, `${G()}/oauth/access_token?${new URLSearchParams({ client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, redirect_uri: redirectUri, code })}`);
    // Exchange for a long-lived (~60 day) token; Meta has no refresh token — users reconnect before expiry.
    const long = await call<{ access_token: string; expires_in?: number }>(this.key, `${G()}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, fb_exchange_token: short.access_token })}`);
    return { accessToken: long.access_token, refreshToken: null, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null };
  }
  async refresh(t: TokenSet): Promise<TokenSet> {
    // Re-exchange keeps a still-valid long-lived token alive; an expired one needs the user to reconnect.
    if (t.expiresAt && t.expiresAt < new Date()) throw new ProviderApiError(this.key, 'Meta access expired; reconnect the account', 401, 'auth');
    const r = await call<{ access_token: string; expires_in?: number }>(this.key, `${G()}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, fb_exchange_token: t.accessToken })}`);
    return { accessToken: r.access_token, refreshToken: null, expiresAt: r.expires_in ? new Date(Date.now() + r.expires_in * 1000) : t.expiresAt ?? null };
  }
  async revoke(t: TokenSet) { await call(this.key, `${G()}/me/permissions?access_token=${encodeURIComponent(t.accessToken)}`, { method: 'DELETE' }).catch(() => undefined); }

  private get<T>(path: string, t: TokenSet, params: Record<string, string> = {}) { return call<T>(this.key, `${G()}/${path}?${new URLSearchParams({ ...params, access_token: t.accessToken })}`); }
  private post<T>(path: string, t: TokenSet, body: Record<string, unknown>) {
    const form = new URLSearchParams({ access_token: t.accessToken });
    for (const [k, v] of Object.entries(body)) if (v !== undefined) form.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    return call<T>(this.key, `${G()}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  }

  async listAccounts(c: Pick<Credentials, 'token'>): Promise<AdAccount[]> {
    const r = await this.get<{ data: { id: string; name: string; currency: string; timezone_name: string; account_status: number }[] }>('me/adaccounts', c.token, { fields: 'id,name,currency,timezone_name,account_status', limit: '200' });
    return r.data.map((a) => ({ externalId: a.id, name: a.name, currency: a.currency, timezone: a.timezone_name, status: a.account_status === 1 ? 'ACTIVE' : `STATUS_${a.account_status}` }));
  }

  async checkPermissions(c: Credentials) {
    const r = await this.get<{ data: { permission: string; status: string }[] }>('me/permissions', c.token);
    const granted = new Set(r.data.filter((p) => p.status === 'granted').map((p) => p.permission));
    return { read_reports: granted.has('ads_read') || granted.has('ads_management'), manage_campaigns: granted.has('ads_management') };
  }

  async createCampaign(c: Credentials, s: CampaignSpec, idem: string) {
    const tag = `[ag:${idem.slice(0, 12)}]`;
    const found = await this.get<{ data: { id: string; status: string }[] }>(`${c.account.externalId}/campaigns`, c.token, { fields: 'id,status,name', filtering: JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: tag }]) });
    if (found.data[0]) return { externalCampaignId: found.data[0].id, externalStatus: found.data[0].status };
    if (!s.externalAppId) throw new ProviderApiError(this.key, 'Set the Meta application id for this app (Integrations → app mapping) before creating Meta campaigns', null, 'invalid');
    // Budget on the campaign (Advantage campaign budget); Meta takes the account currency's minor units.
    const camp = await this.post<{ id: string }>(`${c.account.externalId}/campaigns`, c.token, {
      name: `${s.name} ${tag}`, objective: 'OUTCOME_APP_PROMOTION', status: 'PAUSED', special_ad_categories: [], daily_budget: s.dailyBudgetMinor.toString(), bid_strategy: s.targetCpiMinor ? 'COST_CAP' : 'LOWEST_COST_WITHOUT_CAP',
    });
    const adset = await this.post<{ id: string }>(`${c.account.externalId}/adsets`, c.token, {
      name: `${s.name} ad set`, campaign_id: camp.id, status: 'ACTIVE', billing_event: 'IMPRESSIONS', optimization_goal: 'APP_INSTALLS',
      ...(s.targetCpiMinor ? { bid_amount: s.targetCpiMinor.toString() } : {}),
      promoted_object: { application_id: s.externalAppId, object_store_url: s.app.storeUrl },
      targeting: { geo_locations: { countries: s.countries }, user_os: [s.platform === 'IOS' ? 'iOS' : 'Android'], publisher_platforms: ['facebook', 'instagram', 'audience_network'] },
      start_time: s.startDate.toISOString(), ...(s.endDate ? { end_time: s.endDate.toISOString() } : {}),
    });
    return { externalCampaignId: camp.id, externalStatus: 'PAUSED', children: { adset: adset.id } };
  }

  async setStatus(c: Credentials, id: string, status: 'ACTIVE' | 'PAUSED') { await this.post(id, c.token, { status }); return status; }
  async setDailyBudget(c: Credentials, id: string, dailyMinor: bigint) { await this.post(id, c.token, { daily_budget: dailyMinor.toString() }); }
  async getStatus(c: Credentials, id: string) { const r = await this.get<{ status: string; effective_status: string }>(id, c.token, { fields: 'status,effective_status' }); return `${r.status}/${r.effective_status}`; }

  async metrics(c: Credentials, ids: string[], from: string, to: string): Promise<MetricRow[]> {
    const out: MetricRow[] = [];
    for (const id of ids) {
      const r = await this.get<{ data: { date_start: string; spend: string; impressions: string; clicks: string; country?: string; actions?: { action_type: string; value: string }[] }[] }>(`${id}/insights`, c.token, {
        fields: 'spend,impressions,clicks,actions', time_increment: '1', time_range: JSON.stringify({ since: from, until: to }), breakdowns: 'country', limit: '500',
      });
      for (const d of r.data) {
        const installs = Number(d.actions?.find((a) => a.action_type === 'mobile_app_install' || a.action_type === 'app_install')?.value ?? 0);
        const [w, f = '0'] = d.spend.split('.');
        out.push({ externalCampaignId: id, date: d.date_start, country: (d.country ?? 'ZZ').toUpperCase().slice(0, 2), impressions: BigInt(d.impressions ?? 0), clicks: BigInt(d.clicks ?? 0), installs: Math.round(installs), spendMinor: BigInt(w) * 100n + BigInt((f + '00').slice(0, 2)) });
      }
    }
    return out;
  }
}
