const router = require('express').Router();
const emr    = require('./emr.controller');

// ── EMR API (web UI calls these) ──────────────────────────────────────────────
router.get   ('/patients',                  emr.listPatients);
router.post  ('/patients',                  emr.createPatient);
router.get   ('/patients/:id',              emr.getPatient);
router.patch ('/patients/:id',              emr.updatePatient);
router.delete('/patients/:id',              emr.deletePatient);
router.post  ('/patients/:id/care-contexts',        emr.addCareContext);
router.delete('/patients/:id/care-contexts/:ctxId', emr.deleteCareContext);

router.get('/pending-otps',    emr.pendingOtps);
router.get('/health-requests', emr.healthRequests);
router.get('/activity',        emr.activityLog);

module.exports = router;
