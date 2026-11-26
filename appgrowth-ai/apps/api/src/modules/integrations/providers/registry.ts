import { AppleAdsProvider } from './apple-ads';
import { GoogleAdsProvider } from './google-ads';
import { MetaAdsProvider } from './meta-ads';
import { TikTokAdsProvider } from './tiktok-ads';
import { AdvertisingProvider } from './types';

/** Adding a platform = implementing AdvertisingProvider and registering it here; core logic is unchanged. */
export const AD_PROVIDERS: Record<string, AdvertisingProvider> = {
  google_ads: new GoogleAdsProvider(), meta_ads: new MetaAdsProvider(), tiktok_ads: new TikTokAdsProvider(), apple_ads: new AppleAdsProvider(),
};
export const providerForEnum = (e: string) => Object.values(AD_PROVIDERS).find((p) => p.enumKey === e);
/** Tests replace adapters through this hook; production never calls it. */
export const overrideProvider = (key: string, impl: AdvertisingProvider) => { AD_PROVIDERS[key] = impl; };
