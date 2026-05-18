const {
  getAuthUrl, handleCallback, getStatus, disconnect, syncUserEmails,
} = require('../services/gmail.service');
const logger = require('../utils/logger');

// GET /gmail/auth-url  (auth required)
async function authUrl(req, res) {
  const url = getAuthUrl(req.user.id);
  res.json({ url });
}

// GET /gmail/callback  (public — Google redirects here after consent)
async function oauthCallback(req, res) {
  const { code, state: userId, error } = req.query;

  if (error) {
    return res.send(_htmlPage('Gmail Connection Failed',
      `<p style="color:#E53935">${error}</p>`));
  }
  if (!code || !userId) {
    return res.status(400).send(_htmlPage('Bad Request', '<p>Missing code or state.</p>'));
  }

  try {
    const email = await handleCallback(code, userId);
    // Kick off first sync immediately (non-blocking)
    syncUserEmails(userId).catch(() => {});
    logger.info(`[Gmail] Connected: ${email} for user ${userId}`);
    return res.send(_htmlPage(
      '✅ Gmail Connected!',
      `<p>Your account <strong>${email}</strong> is now connected.</p>
       <p style="color:#938F99;font-size:14px">
         Medical reports will be auto-imported every 30 minutes.<br>
         You can close this tab and return to the app.
       </p>`,
    ));
  } catch (err) {
    logger.error(`[Gmail Callback] ${err.message}`);
    return res.status(500).send(_htmlPage('Connection Failed',
      `<p style="color:#E53935">${err.message}</p>`));
  }
}

// GET /gmail/status  (auth required)
async function status(req, res) {
  const s = await getStatus(req.user.id);
  res.json(s);
}

// POST /gmail/sync  (auth required — triggers immediate sync)
async function manualSync(req, res) {
  const result = await syncUserEmails(req.user.id);
  res.json({ success: true, ...result });
}

// DELETE /gmail/disconnect  (auth required)
async function disconnectGmail(req, res) {
  await disconnect(req.user.id);
  res.json({ success: true });
}

// ── HTML helper ───────────────────────────────────────────────────────────────

function _htmlPage(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="font-family:'Segoe UI',sans-serif;background:#F5F4FF;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="background:#fff;border-radius:20px;padding:48px 40px;max-width:420px;width:90%;box-shadow:0 8px 32px #7B6EF61A;text-align:center">
    <h2 style="color:#7B6EF6;margin-top:0">${title}</h2>
    ${body}
  </div>
</body></html>`;
}

module.exports = { authUrl, oauthCallback, status, manualSync, disconnectGmail };
