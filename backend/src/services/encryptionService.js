const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const KEY = (() => {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || Buffer.from(raw, 'utf8').length < 32)
    throw new Error('FATAL: ENCRYPTION_KEY must be set and at least 32 UTF-8 bytes');
  return Buffer.from(raw, 'utf8').slice(0, 32);
})();

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { encrypted, iv: iv.toString('hex') };
}

function decrypt(encrypted, ivHex) {
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function encryptFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);

    output.write(iv);
    input.pipe(cipher).pipe(output);

    output.on('finish', () => resolve(iv.toString('hex')));
    output.on('error', reject);
  });
}

function decryptFile(inputPath, outputPath, ivHex) {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    const input = fs.createReadStream(inputPath, { start: 16 }); // skip IV
    const output = fs.createWriteStream(outputPath);

    input.pipe(decipher).pipe(output);

    output.on('finish', resolve);
    output.on('error', reject);
  });
}

module.exports = { encrypt, decrypt, encryptFile, decryptFile };
