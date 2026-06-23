const express = require('express');
const router  = express.Router();

const { adminAuth }  = require('./admin.middleware');
const authCtrl       = require('./admin.auth.controller');
const clinicsCtrl    = require('./admin.clinics.controller');
const subsCtrl       = require('./admin.subscriptions.controller');
const salesCtrl      = require('./admin.sales.controller');

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
router.patch('/clinics/:id/abdm',     clinicsCtrl.updateClinicAbdm);
router.post('/clinics/sync-hips',     clinicsCtrl.syncClinicHips);

// Subscription catalog
router.get('/subscription-catalog',                subsCtrl.getCatalog);

// Subscriptions — specific routes before param routes
router.get('/subscriptions/revenue',               subsCtrl.getRevenue);
router.post('/subscriptions/create',               subsCtrl.createSubscription);
router.get('/subscriptions',                       subsCtrl.listSubscriptions);
router.patch('/subscriptions/:clinic_id',          subsCtrl.updateSubscription);
router.get('/subscriptions/:clinic_id/items',      subsCtrl.getSubscriptionItems);

// Audit logs
router.get('/audit-logs', subsCtrl.getAuditLogs);

// Sales CRM
router.get('/sales/crm', salesCtrl.getCrmDashboard);
router.get('/sales/leads/:id', salesCtrl.getLeadDetail);
router.patch('/sales/leads/:id', salesCtrl.updateLead);
router.get('/sales/wa-inbox', salesCtrl.getWhatsAppInbox);
router.post('/sales/wa-inbox/:id/link', salesCtrl.linkWhatsAppToLead);
router.get('/sales/activity/:lead_id', salesCtrl.getLeadActivity);

module.exports = router;
