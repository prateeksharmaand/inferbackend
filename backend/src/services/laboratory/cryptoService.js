/**
 * Encryption Service for Lab Data
 * Uses AES-256-GCM for sensitive data
 */

const crypto = require('crypto');

class CryptoService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY || crypto.randomBytes(32));
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(data) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: this.algorithm
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedObj) {
    try {
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.encryptionKey,
        Buffer.from(encryptedObj.iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));

      let decrypted = decipher.update(encryptedObj.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypt file content
   */
  encryptFile(fileBuffer) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

      let encrypted = cipher.update(fileBuffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      const authTag = cipher.getAuthTag();

      return {
        encrypted: encrypted.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      console.error('File encryption error:', error);
      throw new Error('Failed to encrypt file');
    }
  }

  /**
   * Decrypt file content
   */
  decryptFile(encryptedObj) {
    try {
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.encryptionKey,
        Buffer.from(encryptedObj.iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));

      let decrypted = decipher.update(Buffer.from(encryptedObj.encrypted, 'hex'));
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted;
    } catch (error) {
      console.error('File decryption error:', error);
      throw new Error('Failed to decrypt file');
    }
  }

  /**
   * Generate API secret hash
   */
  hashApiSecret(secret) {
    return crypto
      .createHash('sha256')
      .update(secret)
      .digest('hex');
  }

  /**
   * Compare API secret
   */
  compareApiSecret(secret, hash) {
    const computedHash = this.hashApiSecret(secret);
    return crypto.timingSafeEqual(
      Buffer.from(computedHash),
      Buffer.from(hash)
    );
  }
}

module.exports = new CryptoService();
