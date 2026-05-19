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

// ── M1: ABHA status / profile / card ─────────────────────────────────────────
router.get('/status',  auth, ctrl.getAbhaStatus);
router.get('/profile', auth, ctrl.getAbhaProfile);
router.get('/card',    auth, ctrl.getAbhaCard);

// ── M2: Care contexts ─────────────────────────────────────────────────────────
router.post('/care-contexts/discover', auth, ctrl.discoverCareContexts);
router.post('/care-contexts/link',     auth, ctrl.linkCareContexts);
router.get('/care-contexts',           auth, ctrl.getLinkedCareContexts);

// ── M2: Consent management ────────────────────────────────────────────────────
router.post('/consents', auth, ctrl.createConsent);
router.get('/consents',  auth, ctrl.getConsents);

// ── M3: Callbacks – called by ABDM gateway (no auth) ─────────────────────────
router.post('/consent/notify',     ctrl.consentNotify);
router.post('/health-info/push',   ctrl.healthInfoPush);

// ── M3: View fetched health records ──────────────────────────────────────────
router.get('/health-records', auth, ctrl.getHealthRecords);

module.exports = router;
