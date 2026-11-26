import { AdProvider } from '@prisma/client';

export interface TokenSet { accessToken: string; refreshToken?: string | null; expiresAt?: Date | null; scopes?: string[] }
export interface AdAccount { externalId: string; name: string; currency: string | null; timezone: string | null; status?: string }
export interface Credentials { token: TokenSet; account: { externalId: string; currency: string | null }; extra?: Record<string, string> }
export interface CampaignSpec {
  name: string; platform: 'ANDROID' | 'IOS'; objective: 'installs' | 'in_app_actions' | 'value'; countries: string[]; languages: string[];
  dailyBudgetMinor: bigint; currency: string; targetCpiMinor: bigint | null; startDate: Date; endDate: Date | null;
  app: { androidPackage?: string; appleAppId?: string; storeUrl: string; name: string };
  creatives: { headlines: string[]; descriptions: string[]; imageUrls: string[]; videoUrls: string[] };
  externalAppId?: string; // e.g. Meta application id / TikTok app id registered in the ad platform
}
export interface MetricRow { externalCampaignId: string; date: string; country: string; impressions: bigint; clicks: bigint; installs: number; spendMinor: bigint }
export class ProviderApiError extends Error {
  constructor(public provider: string, message: string, public status: number | null, public kind: 'auth' | 'permission' | 'rate_limit' | 'invalid' | 'transient' | 'unknown', public raw?: unknown) { super(message); }
}

/** Contract every advertising platform adapter implements. Core logic never depends on a specific platform. */
export interface AdvertisingProvider {
  key: string; enumKey: AdProvider; name: string;
  authType: 'oauth' | 'apple_client_credentials';
  /** True when the platform credentials this adapter needs are present in the server environment. */
  configured(): boolean;
  setupChecklist(): string[];
  readiness: 'implemented_unverified' | 'verified';
  authorizeUrl?(state: string, codeChallenge: string, redirectUri: string): string;
  exchangeCode?(code: string, codeVerifier: string, redirectUri: string): Promise<TokenSet>;
  refresh?(token: TokenSet, extra?: Record<string, string>): Promise<TokenSet>;
  revoke?(token: TokenSet): Promise<void>;
  listAccounts(c: Pick<Credentials, 'token' | 'extra'>): Promise<AdAccount[]>;
  checkPermissions(c: Credentials): Promise<Record<string, boolean>>;
  createCampaign(c: Credentials, spec: CampaignSpec, idempotencyKey: string): Promise<{ externalCampaignId: string; externalStatus: string; children?: Record<string, string> }>;
  setStatus(c: Credentials, externalCampaignId: string, status: 'ACTIVE' | 'PAUSED'): Promise<string>;
  setDailyBudget(c: Credentials, externalCampaignId: string, dailyMinor: bigint, currency: string): Promise<void>;
  getStatus(c: Credentials, externalCampaignId: string): Promise<string>;
  metrics(c: Credentials, externalCampaignIds: string[], from: string, to: string): Promise<MetricRow[]>;
}

/** Converts minor units to major-unit decimal string (for APIs taking decimal amounts). */
export const major = (minor: bigint) => `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`;
/** Fetch wrapper that classifies provider HTTP errors. */
export async function call<T>(provider: string, url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 30_000) });
  } catch (e) {
    throw new ProviderApiError(provider, `Network error: ${(e as Error).message}`, null, 'transient');
  }
  const text = await r.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
  if (!r.ok) {
    const kind = r.status === 401 ? 'auth' : r.status === 403 ? 'permission' : r.status === 429 ? 'rate_limit' : r.status >= 500 ? 'transient' : 'invalid';
    const msg = typeof body === 'object' && body ? JSON.stringify(body).slice(0, 400) : String(body).slice(0, 400);
    throw new ProviderApiError(provider, `HTTP ${r.status}: ${msg}`, r.status, kind, body);
  }
  return body as T;
}
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
