const router = require('express').Router();
const wh     = require('./sales.wa.webhook');

// ── Meta webhook (public — no auth, Meta calls this directly) ─────────────────
router.get ('/',    wh.verifyWebhook);
router.post('/',    wh.receiveWebhook);

// ── Internal API for Python sales agent ──────────────────────────────────────
router.get ('/inbox',     wh.getInbox);
router.post('/inbox/ack', wh.ackMessages);

module.exports = router;
