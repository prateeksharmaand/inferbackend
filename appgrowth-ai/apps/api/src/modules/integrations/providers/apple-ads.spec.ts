import { createPublicKey, createVerify } from 'crypto';
import { AppleAdsProvider } from './apple-ads';

describe('Apple Ads client secret', () => {
  it('signs an ES256 JWT that verifies with the uploaded public key', async () => {
    const kp = AppleAdsProvider.generateKeyPair();
    expect(kp.publicPem).toMatch(/BEGIN PUBLIC KEY/);
    let captured = '';
    const orig = global.fetch;
    global.fetch = (async (_url: string, init: RequestInit) => { captured = new URLSearchParams(String(init.body)).get('client_secret')!; return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 }); }) as typeof fetch;
    try { await new AppleAdsProvider().clientToken({ clientId: 'SEARCHADS.c', teamId: 'SEARCHADS.t', keyId: 'k1', privatePem: kp.privatePem }); } finally { global.fetch = orig; }
    const [h, p, s] = captured.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'k1' });
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toMatchObject({ sub: 'SEARCHADS.c', iss: 'SEARCHADS.t', aud: 'https://appleid.apple.com' });
    const sig = Buffer.from(s, 'base64url'); expect(sig.length).toBe(64);
    const ok = createVerify('SHA256').update(`${h}.${p}`).verify({ key: createPublicKey(kp.publicPem), dsaEncoding: 'ieee-p1363' }, sig);
    expect(ok).toBe(true);
  });
});
