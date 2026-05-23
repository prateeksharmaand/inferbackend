const router  = require('express').Router();
const { emrAuth } = require('./emr.middleware');
const auth    = require('./emr.auth.controller');
const emr     = require('./emr.controller');
const queue   = require('./emr.queue.controller');
const appt    = require('./emr.appointment.controller');
const tags    = require('./emr.tags.controller');
const uhid    = require('./emr.uhid.controller');
const svc     = require('./emr.services.controller');
const rec     = require('./emr.receipts.controller');
const docs    = require('./emr.documents.controller');
const ac      = require('./emr.autocomplete.controller');
const scribe      = require('./emr.scribe.controller');
const tpl         = require('./emr.templates.controller');
const assessment  = require('../controllers/assessment.controller');

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/auth/login',           auth.login);
router.post('/auth/register-clinic', auth.registerClinic);

// Autocomplete proxy (ICD-10 / RxTerms via NLM — public, avoids CSP)
router.get('/autocomplete/icd10',   ac.searchICD10);
router.get('/autocomplete/rxterms', ac.searchRxTerms);
router.get('/autocomplete/ping',    ac.ping);

// Scribe health — public so ops can check without a token
router.get('/scribe/status', scribe.status);

// ── Protected (all routes below require EMR JWT) ───────────────────────────
router.use(emrAuth);
router.post  ('/scribe/transcribe',    ...scribe.transcribe);
router.post  ('/scribe/soap',              scribe.extractSOAP);
router.post  ('/assessment/questions',    assessment.generateQuestions);
router.post  ('/assessment/analyze',      assessment.analyzeAnswers);
router.get   ('/scribe/templates',     tpl.listTemplates);
router.post  ('/scribe/templates',     tpl.createTemplate);
router.put   ('/scribe/templates/:id', tpl.updateTemplate);
router.delete('/scribe/templates/:id', tpl.deleteTemplate);

// Auth helpers
router.post  ('/auth/add-doctor',    auth.addDoctor);
router.get   ('/auth/doctors',       auth.listDoctors);
router.patch ('/auth/doctors/:id',   auth.updateDoctor);
router.delete('/auth/doctors/:id',   auth.deleteDoctor);

// Patients (existing EMR patient store)
router.get   ('/patients',                         emr.listPatients);
router.post  ('/patients',                         emr.createPatient);
router.get   ('/patients/history',                 appt.listPatientHistory);
router.get   ('/patients/:id',                     emr.getPatient);
router.patch ('/patients/:id',                     emr.updatePatient);
router.delete('/patients/:id',                     emr.deletePatient);
router.post  ('/patients/:id/care-contexts',       emr.addCareContext);
router.delete('/patients/:id/care-contexts/:ctxId',emr.deleteCareContext);

// ABHA Creation (M1)
router.post('/patients/:id/abha/create-otp',        emr.abhaCreateOtp);
router.post('/patients/:id/abha/create-verify',     emr.abhaCreateVerify);
router.post('/patients/:id/abha/mobile-otp',        emr.abhaCreateMobileOtp);
router.post('/patients/:id/abha/mobile-verify',     emr.abhaCreateMobileVerify);
router.post('/patients/:id/abha/suggestions',       emr.abhaGetSuggestions);
router.post('/patients/:id/abha/set-address',       emr.abhaSetAddress);
router.get ('/patients/:id/abha/card',              emr.abhaGetCard);

// ABHA Verification / Linking (M1)
router.post('/patients/:id/abha/verify-otp',        emr.abhaVerifyOtp);
router.post('/patients/:id/abha/verify-confirm',    emr.abhaVerifyConfirm);

// Queues
router.get   ('/queues',     queue.listQueues);
router.post  ('/queues',     queue.createQueue);
router.patch ('/queues/:id', queue.updateQueue);
router.delete('/queues/:id', queue.deleteQueue);

// Appointments
router.get  ('/appointments',                    appt.listAppointments);
router.post ('/appointments',                    appt.createAppointment);
router.get  ('/appointments/:id',                appt.getAppointment);
router.patch('/appointments/:id/status',         appt.updateStatus);
router.post ('/appointments/:id/encounter',      appt.saveEncounter);
router.post ('/appointments/:id/reminder',       appt.sendReminder);

// Tags (Custom Attribute Values)
router.get   ('/tags',     tags.listTags);
router.post  ('/tags',     tags.createTag);
router.patch ('/tags/:id', tags.updateTag);
router.delete('/tags/:id', tags.deleteTag);

// Services
router.get   ('/services',     svc.listServices);
router.post  ('/services',     svc.createService);
router.patch ('/services/:id', svc.updateService);
router.delete('/services/:id', svc.deleteService);

// Medical Documents
router.get   ('/appointments/:id/documents',         docs.listDocuments);
router.get   ('/appointments/:id/patient-documents', docs.listPatientDocuments);
router.post  ('/appointments/:id/documents',         docs.uploadDocument);
router.patch ('/appointments/:id/documents/:docId',  docs.patchDocument);
router.delete('/appointments/:id/documents/:docId',  docs.deleteDocument);

// Receipts
router.get  ('/receipts',     rec.listReceipts);
router.post ('/receipts',     rec.createReceipt);
router.get  ('/receipts/:id', rec.getReceipt);
router.patch('/receipts/:id', rec.updateReceipt);

// UHID Settings
router.get ('/settings/uhid',          uhid.getSettings);
router.patch('/settings/uhid',         uhid.updateSettings);
router.post ('/settings/uhid/generate', uhid.generateUhid);

// ABDM / HIP activity
router.get('/pending-otps',    emr.pendingOtps);
router.get('/health-requests', emr.healthRequests);
router.get('/activity',        emr.activityLog);

// ABDM bridge / callback-URL diagnostics
router.get ('/abdm/bridge',        emr.abdmGetBridge);
router.post('/abdm/bridge/update', emr.abdmUpdateBridge);

// Patient profile shares (QR walk-in — SHARE_PATIENT_PROFILE_701)
router.get   ('/profile-shares',                        emr.listProfileShares);
router.patch ('/profile-shares/:id/dismiss',            emr.dismissProfileShare);
router.post  ('/profile-shares/:id/link-patient',       emr.linkProfileShareToPatient);

// Add Patient via Aadhaar (standalone)
router.post('/abha/aadhaar-otp',          emr.abhaCreateOtp);
router.post('/abha/aadhaar-verify',       emr.abhaCreateVerify);
router.post('/abha/aadhaar-mobile-otp',   emr.abhaCreateMobileOtp);
router.post('/abha/aadhaar-mobile-verify',emr.abhaCreateMobileVerify);
router.post('/abha/aadhaar-suggestions',  emr.abhaGetSuggestions);
router.post('/abha/aadhaar-set-address',  emr.abhaAadhaarSetAddress);
router.post('/abha/aadhaar-finalize',     emr.abhaAadhaarCreate);

// Add Patient via ABHA (standalone — no existing patient needed)
router.post('/abha/request-otp',   emr.abhaAddOtp);
router.post('/abha/verify-create', emr.abhaAddCreate);

// Login with ABHA (patient verification at point of care)
router.post('/abha/login-request-otp',  emr.abhaLoginRequestOtp);
router.post('/abha/login-verify-otp',   emr.abhaLoginVerifyOtp);
router.post('/abha/login-update-mobile',emr.abhaLoginUpdateMobile);
router.post('/abha/login-link-patient', emr.abhaLoginLinkPatient);

// Consent management (EMR acting as HIU)
router.post('/consents',                        emr.createConsentRequest);
router.get ('/consents',                        emr.listConsentRequests);
router.get ('/consents/health-records',         emr.getConsentHealthRecords);
router.post('/consents/:requestId/respond',     emr.respondConsent);
router.post('/consents/:requestId/pull-data',   emr.pullConsentData);

module.exports = router;
