const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const {
  authUrl, oauthCallback, status, manualSync, disconnectGmail,
} = require('../controllers/gmail.controller');

// Public — Google redirects here; no JWT in the browser redirect
router.get('/callback', oauthCallback);

// All other routes require the app's JWT
router.use(authMiddleware);
router.get('/auth-url',    authUrl);
router.get('/status',      status);
router.post('/sync',       manualSync);
router.delete('/disconnect', disconnectGmail);

module.exports = router;
