import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** AES-256-GCM for secrets at rest (OAuth tokens, MFA secrets, API keys); SHA-256 for token lookups. */
@Injectable()
export class CryptoService {
  private key: Buffer;
  constructor() {
    this.key = Buffer.from(process.env.DATA_ENCRYPTION_KEY ?? '', 'hex');
    if (this.key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return ['v1', iv, c.getAuthTag(), enc].map((b) => (typeof b === 'string' ? b : b.toString('base64'))).join('.');
  }
  decrypt(token: string): string {
    const [ver, iv, tag, enc] = token.split('.');
    if (ver !== 'v1') throw new Error('Unknown ciphertext version');
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
  }
  sha256(v: string) { return createHash('sha256').update(v).digest('hex'); }
  hmac(secret: string, payload: string | Buffer, enc: 'hex' | 'base64' = 'hex') { return createHmac('sha256', secret).update(payload).digest(enc); }
  safeEqual(a: string, b: string) {
    const x = Buffer.from(a); const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }
  token(bytes = 32) { return randomBytes(bytes).toString('base64url'); }
  /** Salted hash for device identifiers — raw advertising IDs are never stored. */
  deviceHash(id: string) { return this.hmac(process.env.DEVICE_HASH_SALT ?? '', id.trim().toLowerCase()); }
}
