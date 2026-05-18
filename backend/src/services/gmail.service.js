const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { query } = require('../config/database');
const logger = require('../utils/logger');

// ── Detection keyword lists ────────────────────────────────────────────────────

const SENDER_KEYWORDS = [
  'lab', 'diagnostic', 'hospital', 'clinic', 'pathology', 'health',
  'medic', 'pharma', 'thyrocare', 'srl', 'metropolis', 'narayana',
  'apollo', 'fortis', 'maxhealth', 'aiims', 'lal path', 'drlal',
  'redcliffe', 'healthians', '1mg', 'tata 1mg', 'practo',
];

const SUBJECT_KEYWORDS = [
  'report', 'result', 'test result', 'prescription', 'discharge', 'lab',
  'blood', 'urine', 'scan', 'x-ray', 'xray', 'mri', 'ct scan',
  'pathology', 'medical', 'biopsy', 'ecg', 'ultrasound', 'stool',
  'lipid', 'thyroid', 'diabetes', 'hemoglobin', 'covid', 'pcr',
  'culture', 'sensitivity', 'radiology', 'investigation',
];

const ALLOWED_EXTS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);

// ── OAuth client factory ───────────────────────────────────────────────────────

function _createClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

// ── Public: generate OAuth consent URL ────────────────────────────────────────

function getAuthUrl(userId) {
  return _createClient().generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: userId,
    prompt: 'consent',
  });
}

// ── Public: exchange auth code → store tokens ─────────────────────────────────

async function handleCallback(code, userId) {
  const client = _createClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();

  await query(
    `INSERT INTO user_gmail_tokens
       (user_id, gmail_email, access_token, refresh_token, expiry_date)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       gmail_email   = EXCLUDED.gmail_email,
       access_token  = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, user_gmail_tokens.refresh_token),
       expiry_date   = EXCLUDED.expiry_date,
       is_active     = true,
       updated_at    = NOW()`,
    [userId, data.email, tokens.access_token, tokens.refresh_token || null, tokens.expiry_date],
  );

  return data.email;
}

// ── Public: connection status ──────────────────────────────────────────────────

async function getStatus(userId) {
  const result = await query(
    'SELECT gmail_email, last_synced_at, is_active FROM user_gmail_tokens WHERE user_id = $1',
    [userId],
  );
  if (result.rows.length === 0) return { connected: false };
  const row = result.rows[0];
  return {
    connected: !!row.is_active,
    email: row.gmail_email,
    lastSyncedAt: row.last_synced_at,
  };
}

// ── Public: disconnect ────────────────────────────────────────────────────────

async function disconnect(userId) {
  await query(
    'UPDATE user_gmail_tokens SET is_active = false, updated_at = NOW() WHERE user_id = $1',
    [userId],
  );
}

// ── Internal: build authenticated Gmail client ────────────────────────────────

async function _getAuthClient(userId) {
  const result = await query(
    'SELECT * FROM user_gmail_tokens WHERE user_id = $1 AND is_active = true',
    [userId],
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const client = _createClient();
  client.setCredentials({
    access_token:  row.access_token,
    refresh_token: row.refresh_token,
    expiry_date:   row.expiry_date,
  });

  // Persist refreshed token automatically
  client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await query(
        `UPDATE user_gmail_tokens SET access_token = $1, expiry_date = $2, updated_at = NOW()
         WHERE user_id = $3`,
        [tokens.access_token, tokens.expiry_date, userId],
      ).catch(() => {});
    }
  });

  return { client, row };
}

// ── Internal: keyword detection ────────────────────────────────────────────────

function _isMedical(from, subject) {
  const f = (from    || '').toLowerCase().replace(/\s+/g, '');
  const s = (subject || '').toLowerCase();
  return SENDER_KEYWORDS.some(k => f.includes(k.replace(/\s+/g, '')))
      || SUBJECT_KEYWORDS.some(k => s.includes(k));
}

// ── Internal: walk message parts recursively to find attachments ───────────────

function _extractAttachments(payload, out = []) {
  if (payload.parts) {
    for (const part of payload.parts) _extractAttachments(part, out);
  }
  if (payload.filename && payload.body?.attachmentId) {
    out.push({
      filename:     payload.filename,
      mimeType:     payload.mimeType || 'application/octet-stream',
      attachmentId: payload.body.attachmentId,
    });
  }
  return out;
}

// ── Public: sync new medical emails for one user ───────────────────────────────

async function syncUserEmails(userId) {
  const auth = await _getAuthClient(userId);
  if (!auth) return { synced: 0 };

  const { client, row } = auth;
  const gmail = google.gmail({ version: 'v1', auth: client });

  // Date cutoff: last sync or first 90 days
  const cutoffSec = row.last_synced_at
    ? Math.floor(new Date(row.last_synced_at).getTime() / 1000)
    : Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);

  logger.info(`[Gmail Sync] user:${userId} | cutoff: ${new Date(cutoffSec * 1000).toISOString()}`);

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: `has:attachment -in:sent -in:drafts after:${cutoffSec}`,
    maxResults: 50,
  });

  // Stamp last_synced_at now, before processing, so the next run doesn't re-check
  await query(
    'UPDATE user_gmail_tokens SET last_synced_at = NOW(), updated_at = NOW() WHERE user_id = $1',
    [userId],
  );

  const messages = listRes.data.messages || [];
  if (messages.length === 0) return { synced: 0 };

  const uploadDir = process.env.UPLOADS_PATH || './uploads';
  const userDir   = path.join(uploadDir, userId);
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

  let synced = 0;

  for (const { id: msgId } of messages) {
    try {
      const detail  = await gmail.users.messages.get({ userId: 'me', id: msgId, format: 'full' });
      const headers = detail.data.payload.headers || [];
      const from    = headers.find(h => h.name === 'From')?.value    || '';
      const subject = headers.find(h => h.name === 'Subject')?.value || 'Gmail Report';
      const date    = headers.find(h => h.name === 'Date')?.value;

      if (!_isMedical(from, subject)) continue;

      for (const att of _extractAttachments(detail.data.payload)) {
        const ext = path.extname(att.filename).toLowerCase();
        if (!ALLOWED_EXTS.has(ext)) continue;

        const sourceRef = `gmail:${msgId}:${att.filename}`;

        // Skip if already imported
        const dup = await query(
          'SELECT id FROM documents WHERE user_id = $1 AND source_ref = $2',
          [userId, sourceRef],
        );
        if (dup.rows.length > 0) continue;

        // Download attachment data
        const attRes = await gmail.users.messages.attachments.get({
          userId: 'me', messageId: msgId, id: att.attachmentId,
        });
        const buf       = Buffer.from(attRes.data.data, 'base64url');
        const savedName = `${crypto.randomUUID()}${ext}`;
        const savedPath = path.join(userDir, savedName);
        fs.writeFileSync(savedPath, buf);

        const fileUrl = `/uploads/${userId}/${savedName}`;
        const docDate = date ? new Date(date) : null;

        const docRes = await query(
          `INSERT INTO documents
             (user_id, title, type, file_path, file_url, mime_type, file_size,
              is_encrypted, source_ref, tags, document_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [
            userId,
            att.filename || subject,
            'Lab Report',
            savedPath,
            fileUrl,
            att.mimeType,
            buf.length,
            false,
            sourceRef,
            ['gmail_sync'],
            docDate,
          ],
        );

        const doc = docRes.rows[0];
        logger.info(`[Gmail Sync] Saved "${doc.title}" | user:${userId} | doc:${doc.id}`);

        // Kick off OCR asynchronously — does not block this loop
        const { ingestDocumentAsync } = require('../controllers/documents.controller');
        ingestDocumentAsync(doc.id, savedPath, userId, att.mimeType).catch(
          e => logger.error(`[Gmail Sync] OCR failed | doc:${doc.id} | ${e.message}`),
        );

        synced++;
      }
    } catch (err) {
      logger.error(`[Gmail Sync] msg:${msgId} failed: ${err.message}`);
    }
  }

  logger.info(`[Gmail Sync] user:${userId} | done | synced: ${synced}`);
  return { synced };
}

module.exports = { getAuthUrl, handleCallback, getStatus, disconnect, syncUserEmails };
