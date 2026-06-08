const express = require('express');
const router  = express.Router();

const { adminAuth }  = require('./admin.middleware');
const authCtrl       = require('./admin.auth.controller');
const clinicsCtrl    = require('./admin.clinics.controller');
const subsCtrl       = require('./admin.subscriptions.controller');

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/auth/login', authCtrl.login);

// ── Protected (superadmin JWT required) ───────────────────────────────────────
router.use(adminAuth);

router.post('/auth/change-password', authCtrl.changePassword);

// Stats
router.get('/stats', clinicsCtrl.getStats);

// Clinics
router.get('/clinics',              clinicsCtrl.listClinics);
router.post('/clinics',             clinicsCtrl.createClinic);
router.get('/clinics/:id',          clinicsCtrl.getClinic);
router.patch('/clinics/:id',        clinicsCtrl.updateClinic);
router.patch('/clinics/:id/suspend',  clinicsCtrl.suspendClinic);
router.patch('/clinics/:id/activate', clinicsCtrl.activateClinic);

// Subscriptions — revenue must be before /:clinic_id to avoid param capture
router.get('/subscriptions/revenue',               subsCtrl.getRevenue);
router.get('/subscriptions',                       subsCtrl.listSubscriptions);
router.patch('/subscriptions/:clinic_id',          subsCtrl.updateSubscription);

// Audit logs
router.get('/audit-logs', subsCtrl.getAuditLogs);

module.exports = router;
