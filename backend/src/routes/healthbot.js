const express = require('express');
const router = express.Router();
const { chat, getSessions, getSession } = require('../controllers/healthbotController');
const { authenticate, authorizeProfile } = require('../middleware/auth');

router.use(authenticate);

router.post('/chat', chat);
router.get('/sessions/:profileId', authorizeProfile, getSessions);
router.get('/session/:sessionId/messages', getSession);

module.exports = router;
