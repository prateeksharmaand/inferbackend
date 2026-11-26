import { Injectable, Logger } from '@nestjs/common';
import { createSign } from 'crypto';
import { AppError } from '../../common/errors';

export const ANDROID_PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
export const IOS_BUNDLE = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

export interface ListingData {
  title: string; subtitle: string; description: string; developer: string; rating: number | null; ratingCount: number | null;
  iconUrl: string; screenshotUrls: string[]; category: string; storeUrl: string; appleAppId?: string; bundleId?: string; raw: Record<string, unknown>;
  source: 'itunes_lookup' | 'play_developer_api';
}

/** Parses Play / App Store URLs into identifiers. */
export function parseStoreUrl(url: string): { platform: 'ANDROID'; storeId: string } | { platform: 'IOS'; appleAppId: string } | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (u.hostname === 'play.google.com' && u.pathname.startsWith('/store/apps/details')) {
    const id = u.searchParams.get('id');
    return id && ANDROID_PACKAGE.test(id) ? { platform: 'ANDROID', storeId: id } : null;
  }
  if (u.hostname === 'apps.apple.com' || u.hostname === 'itunes.apple.com') {
    const m = u.pathname.match(/\/id(\d{5,12})(?:$|[/?])/);
    return m ? { platform: 'IOS', appleAppId: m[1] } : null;
  }
  return null;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Store metadata:
 *  - iOS: Apple's public iTunes Lookup API (no credentials). Works for any published app.
 *  - Android: Google offers no public metadata API. We (a) confirm the package exists by the HTTP status of its public
 *    Play page — content is not scraped — and (b) read the full listing through the Google Play Developer API with the
 *    app owner's service account, when they provide one.
 */
@Injectable()
export class StoreService {
  private log = new Logger('Store');

  async lookupIos(q: { appleAppId?: string; bundleId?: string }, country = 'IN'): Promise<ListingData | null> {
    const params = new URLSearchParams({ country: country.toLowerCase(), entity: 'software' });
    if (q.appleAppId) params.set('id', q.appleAppId); else if (q.bundleId) params.set('bundleId', q.bundleId); else return null;
    const r = await fetch(`https://itunes.apple.com/lookup?${params}`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new AppError(`App Store lookup failed (HTTP ${r.status})`, 502, 'store_unavailable');
    const body = (await r.json()) as { resultCount: number; results: Record<string, unknown>[] };
    const a = body.results?.[0];
    if (!a) return null;
    const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '');
    return {
      title: s('trackName'), subtitle: '', description: s('description'), developer: s('sellerName') || s('artistName'),
      rating: typeof a.averageUserRating === 'number' ? Math.round((a.averageUserRating as number) * 100) / 100 : null,
      ratingCount: typeof a.userRatingCount === 'number' ? (a.userRatingCount as number) : null,
      iconUrl: s('artworkUrl512') || s('artworkUrl100'), screenshotUrls: [...((a.screenshotUrls as string[]) ?? []), ...((a.ipadScreenshotUrls as string[]) ?? [])].slice(0, 10),
      category: s('primaryGenreName'), storeUrl: s('trackViewUrl'), appleAppId: String(a.trackId ?? ''), bundleId: s('bundleId'),
      raw: { trackId: a.trackId, bundleId: a.bundleId, version: a.version, price: a.price, contentAdvisoryRating: a.contentAdvisoryRating, languageCodesISO2A: a.languageCodesISO2A, releaseDate: a.releaseDate, currentVersionReleaseDate: a.currentVersionReleaseDate, genres: a.genres },
      source: 'itunes_lookup',
    };
  }

  /** true = public Play page exists, false = 404, null = could not determine (network/rate limit). */
  async androidPackageExists(pkg: string): Promise<boolean | null> {
    if (!ANDROID_PACKAGE.test(pkg)) return false;
    try {
      const r = await fetch(`https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&hl=en`, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'AppGrowthAI/1.0 (+https://marketing.noushealthcare.online)' } });
      await r.body?.cancel();
      if (r.status === 200) return true;
      if (r.status === 404) return false;
      return null;
    } catch {
      return null;
    }
  }

  /** Google Play Developer API (androidpublisher v3): read listings via a temporary edit, then delete the edit. */
  async playListing(pkg: string, serviceAccountJson: string, language = 'en-US'): Promise<ListingData | null> {
    const token = await this.googleServiceToken(serviceAccountJson, 'https://www.googleapis.com/auth/androidpublisher');
    const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}`;
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const edit = await fetch(`${base}/edits`, { method: 'POST', headers: h, body: '{}', signal: AbortSignal.timeout(15_000) });
    if (!edit.ok) throw new AppError(`Google Play Developer API: ${edit.status} ${(await edit.text()).slice(0, 200)}`, 502, 'play_api_error');
    const { id } = (await edit.json()) as { id: string };
    try {
      const [listings, details] = await Promise.all([
        fetch(`${base}/edits/${id}/listings`, { headers: h }).then((r) => r.json() as Promise<{ listings?: { language: string; title: string; shortDescription: string; fullDescription: string }[] }>),
        fetch(`${base}/edits/${id}/details`, { headers: h }).then((r) => r.json() as Promise<{ contactEmail?: string; defaultLanguage?: string }>),
      ]);
      const all = listings.listings ?? [];
      const l = all.find((x) => x.language === language) ?? all.find((x) => x.language === details.defaultLanguage) ?? all[0];
      if (!l) return null;
      return {
        title: l.title, subtitle: l.shortDescription, description: l.fullDescription, developer: details.contactEmail ?? '', rating: null, ratingCount: null,
        iconUrl: '', screenshotUrls: [], category: '', storeUrl: `https://play.google.com/store/apps/details?id=${pkg}`,
        raw: { languages: all.map((x) => x.language), defaultLanguage: details.defaultLanguage }, source: 'play_developer_api',
      };
    } finally {
      await fetch(`${base}/edits/${id}`, { method: 'DELETE', headers: h }).catch(() => undefined);
    }
  }

  /** OAuth 2.0 JWT bearer grant for a Google service account (RS256), no SDK needed. */
  async googleServiceToken(json: string, scope: string): Promise<string> {
    let sa: { client_email: string; private_key: string; token_uri?: string };
    try { sa = JSON.parse(json); } catch { throw new AppError('Service account JSON is not valid JSON', 400, 'invalid_credentials'); }
    if (!sa.client_email || !sa.private_key) throw new AppError('Service account JSON is missing client_email or private_key', 400, 'invalid_credentials');
    const now = Math.floor(Date.now() / 1000);
    const aud = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope, aud, iat: now, exp: now + 3600 }))}`;
    const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key);
    const r = await fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }), signal: AbortSignal.timeout(15_000) });
    const body = (await r.json()) as { access_token?: string; error_description?: string; error?: string };
    if (!r.ok || !body.access_token) throw new AppError(`Google rejected the service account: ${body.error_description ?? body.error ?? r.status}`, 400, 'invalid_credentials');
    return body.access_token;
  }
}
