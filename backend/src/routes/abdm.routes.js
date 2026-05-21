const router  = require('express').Router();
const auth    = require('../middleware/auth');
const ctrl    = require('../controllers/abdm.controller');

// ── M1: ABHA enrollment (Aadhaar) ────────────────────────────────────────────
router.post('/enrol/aadhaar/otp',    auth, ctrl.aadhaarGenerateOtp);
router.post('/enrol/aadhaar/verify', auth, ctrl.aadhaarVerifyOtp);

// ── M1: ABHA enrollment (Mobile) ─────────────────────────────────────────────
router.post('/enrol/mobile/otp',    auth, ctrl.mobileGenerateOtp);
router.post('/enrol/mobile/verify', auth, ctrl.mobileVerifyOtp);

// ── M1: ABHA login ────────────────────────────────────────────────────────────
router.post('/login/otp',    auth, ctrl.loginGenerateOtp);
router.post('/login/verify', auth, ctrl.loginVerifyOtp);

// ── M1: ABHA status / profile / card / logout ────────────────────────────────
router.get('/status',  auth, ctrl.getAbhaStatus);
router.get('/profile', auth, ctrl.getAbhaProfile);
router.get('/card',    auth, ctrl.getAbhaCard);
router.post('/logout', auth, ctrl.logoutAbha);

// ── M2: Care-context discovery (async) ───────────────────────────────────────
router.post('/care-contexts/discover',               auth, ctrl.discoverCareContexts);
router.get('/care-contexts/discover/:requestId',     auth, ctrl.discoverStatus);
router.post('/care-contexts/on-discover',                  ctrl.onDiscover);       // ABDM callback

// ── M2: Patient-initiated link ────────────────────────────────────────────────
router.post('/links/init',                           auth, ctrl.linkInit);
router.get('/links/:requestId/status',               auth, ctrl.linkStatus);
router.post('/links/confirm',                        auth, ctrl.linkConfirm);
router.get('/links/:requestId/confirm-status',       auth, ctrl.confirmStatus);
router.post('/links/link/on-init',                         ctrl.onLinkInit);       // ABDM callback
router.post('/links/link/on-confirm',                      ctrl.onLinkConfirm);    // ABDM callback

// ── M2: HIP-initiated link (legacy) ──────────────────────────────────────────
router.post('/care-contexts/link',     auth, ctrl.linkCareContexts);
router.get('/care-contexts',           auth, ctrl.getLinkedCareContexts);

// ── M2: Consent management ────────────────────────────────────────────────────
router.post('/consents',                    auth, ctrl.createConsent);
router.get('/consents',                     auth, ctrl.getConsents);
router.post('/consents/:requestId/respond', auth, ctrl.respondConsent);

// ── M3: Callbacks – called by ABDM gateway (no auth) ─────────────────────────
router.post('/consent/notify',     ctrl.consentNotify);
router.post('/health-info/push',   ctrl.healthInfoPush);

// ── M3: View fetched health records ──────────────────────────────────────────
router.get('/health-records', auth, ctrl.getHealthRecords);

// ── Debug: test ABDM gateway credentials (no auth, remove after testing) ─────
router.get('/debug/token', ctrl.debugToken);

module.exports = router;
