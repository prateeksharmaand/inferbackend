const router = require('express').Router();
const api    = require('./inbound.api.controller');

// All routes here are already mounted under /api/emr/inbound
// and already protected by emrAuth (applied in emr.routes.js before this mount)

// ── Conversations (staff monitoring) ─────────────────────────────────────
router.get  ('/conversations',              api.listConversations);
router.get  ('/conversations/:id',          api.getConversation);
router.patch('/conversations/:id/takeover', api.takeoverConversation);
router.post ('/conversations/:id/reply',    api.staffReply);

// ── Doctor availability schedule ─────────────────────────────────────────
router.get   ('/availability',         api.getAvailability);
router.post  ('/availability',         api.upsertAvailability);
router.delete('/availability/:id',     api.deleteAvailability);
router.get   ('/availability/slots',   api.getSlots);  // ?doctor_id=&date=

// ── Channel config (link Telnyx numbers to clinic) ────────────────────────
router.get   ('/channels',         api.listChannelConfigs);
router.post  ('/channels',         api.upsertChannelConfig);
router.delete('/channels/:id',     api.deleteChannelConfig);

// ── Patient portal booking (direct, no AI) ────────────────────────────────
router.post('/portal/book', api.portalBook);

// ── Chat widget ────────────────────────────────────────────────────────────
router.post('/chat', api.chatMessage);

// ── Analytics ─────────────────────────────────────────────────────────────
router.get('/analytics', api.getAnalytics);

module.exports = router;
