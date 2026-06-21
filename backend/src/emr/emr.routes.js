const router    = require('express').Router();
const rateLimit = require('express-rate-limit');
const { emrAuth } = require('./emr.middleware');
const { pool }  = require('../config/database');

// SEC-023: tight rate limit for all ABHA OTP generation endpoints (10 per 10 sec per IP â€” relaxed for dev)
const otpLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Please wait 10 seconds before trying again.' },
  keyGenerator: (req) => req.ip + ':otp',
});

// Login endpoints already have the global authLimiter in server.js (10/15min)
// but add an extra tight limiter on the EMR login path
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  keyGenerator: (req) => req.ip + ':' + (req.body?.email || ''),
});
const auth      = require('./emr.auth.controller');
const labStaff  = require('./emr.labstaff.controller');
const staff     = require('./emr.staff.controller');
const emr     = require('./emr.controller');
const queue   = require('./emr.queue.controller');
const appt    = require('./emr.appointment.controller');
const tags    = require('./emr.tags.controller');
const uhid    = require('./emr.uhid.controller');
const theme   = require('./emr.theme.controller');
const assets  = require('./emr.clinicassets.controller');
const mailer  = require('./emr.mailer');
const svc     = require('./emr.services.controller');
const rec     = require('./emr.receipts.controller');
const docs    = require('./emr.documents.controller');
const ac      = require('./emr.autocomplete.controller');
const scribe      = require('./emr.scribe.controller');
const tpl         = require('./emr.templates.controller');
const assessment  = require('../controllers/assessment.controller');
const inbound     = require('./inbound/inbound.routes');
const analytics   = require('./emr.analytics.controller');
const docassist   = require('./emr.docassist.controller');
const rxpublic    = require('./emr.rxpublic.controller');
const subscription = require('./emr.subscription.controller');

// â”€â”€ Public â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Staff invitation acceptance (public â€” no JWT)
router.get ('/invite/:token',         staff.getInvitation);
router.post('/invite/:token/accept',  staff.acceptInvitation);

router.post('/auth/login',            loginLimiter, auth.login);
router.post('/auth/register-clinic',  auth.registerClinic);
router.post('/auth/lab/login',        labStaff.loginStaff);
router.post('/auth/forgot-password',  auth.forgotPassword);
router.post('/auth/reset-password',   auth.resetPassword);

// Autocomplete proxy (ICD-10 / RxTerms via NLM â€” public, avoids CSP)
router.get('/autocomplete/icd10',   ac.searchICD10);
router.get('/autocomplete/rxterms', ac.searchRxTerms);
router.get('/autocomplete/ping',    ac.ping);

// Scribe health â€” public so ops can check without a token
router.get('/scribe/status', scribe.status);

// Public prescription view â€” no auth, token-verified via HMAC
router.get('/public/rx/:apptId', rxpublic.getPublicRx);

// â”€â”€ Protected (all routes below require EMR JWT) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.use(emrAuth);

const { proOnlyCheck } = subscription;

// â”€â”€ AI features â€” Pro plan only â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post  ('/docassist',                          proOnlyCheck('ai_docassist'), docassist.chat);
router.post  ('/docassist/document',                 proOnlyCheck('ai_docassist'), docassist.generateDocument);
router.get   ('/docassist/patient-context/:patientId', proOnlyCheck('ai_docassist'), docassist.getPatientContext);
router.post  ('/scribe/transcribe',    proOnlyCheck('scribe'),       ...scribe.transcribe);
router.post  ('/scribe/soap',          proOnlyCheck('scribe'),       scribe.extractSOAP);
router.get   ('/scribe/templates',       proOnlyCheck('scribe'), tpl.listTemplates);
router.post  ('/scribe/templates',       proOnlyCheck('scribe'), tpl.createTemplate);
router.put   ('/scribe/templates/:id',   proOnlyCheck('scribe'), tpl.updateTemplate);
router.delete('/scribe/templates/:id',   proOnlyCheck('scribe'), tpl.deleteTemplate);
router.get   ('/scribe/active-template', tpl.getActiveTemplate);
router.patch ('/scribe/active-template', tpl.setActiveTemplate);
router.post  ('/assessment/questions', proOnlyCheck('ai_assessment'), assessment.generateQuestions);
router.post  ('/assessment/analyze',   proOnlyCheck('ai_assessment'), assessment.analyzeAnswers);

router.get   ('/appointments/:id/rx-token', rxpublic.getRxToken);

// Subscription
router.get   ('/subscription',                   subscription.getSubscription);
router.get   ('/subscription/plans',             subscription.getPlans);
router.post  ('/subscription/create-order',      subscription.createOrder);
router.post  ('/subscription/verify-payment',    subscription.verifyPayment);

// â”€â”€ Clinic ABDM settings (self-service for clinic admins) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/clinic-settings/abdm', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT hip_id, hip_name, hiu_id, hiu_name, abdm_enabled, abdm_status, abdm_last_synced_at
     FROM emr_clinics WHERE id = $1`,
    [req.emrUser.clinic_id]
  );
  res.json(rows[0] || {});
});

router.patch('/clinic-settings/abdm', async (req, res) => {
  if (req.emrUser.role !== 'admin')
    return res.status(403).json({ error: 'Only clinic admins can update ABDM configuration' });

  const { hip_id, hip_name, hiu_id, hiu_name, abdm_enabled } = req.body;
  const abdmResolver = require('../services/abdm-clinic-resolver.service');

  if (hip_id) {
    const { rows } = await pool.query(
      'SELECT id FROM emr_clinics WHERE hip_id=$1 AND id!=$2', [hip_id, req.emrUser.clinic_id]
    );
    if (rows.length) return res.status(409).json({ error: 'HIP ID already used by another clinic' });
  }
  if (hiu_id) {
    const { rows } = await pool.query(
      'SELECT id FROM emr_clinics WHERE hiu_id=$1 AND id!=$2', [hiu_id, req.emrUser.clinic_id]
    );
    if (rows.length) return res.status(409).json({ error: 'HIU ID already used by another clinic' });
  }

  const { rows: cur } = await pool.query('SELECT * FROM emr_clinics WHERE id=$1', [req.emrUser.clinic_id]);
  const newHipId   = hip_id    ?? cur[0].hip_id;
  const newEnabled = abdm_enabled ?? cur[0].abdm_enabled;
  const abdmStatus = newEnabled && newHipId ? 'CONFIGURED' : 'NOT_CONFIGURED';

  const { rows } = await pool.query(
    `UPDATE emr_clinics
     SET hip_id       = COALESCE($1, hip_id),
         hip_name     = COALESCE($2, hip_name),
         hiu_id       = COALESCE($3, hiu_id),
         hiu_name     = COALESCE($4, hiu_name),
         abdm_enabled = COALESCE($5, abdm_enabled),
         abdm_status  = $6
     WHERE id = $7
     RETURNING hip_id, hip_name, hiu_id, hiu_name, abdm_enabled, abdm_status`,
    [hip_id, hip_name, hiu_id, hiu_name, abdm_enabled, abdmStatus, req.emrUser.clinic_id]
  );

  abdmResolver.invalidateCache(req.emrUser.clinic_id);
  res.json(rows[0]);
});

// Auth helpers
router.post  ('/auth/logout',          auth.logout);
router.post  ('/auth/change-password', auth.changePassword);
router.get   ('/auth/seat-info',       auth.getSeatInfo);
router.post  ('/auth/add-doctor',    auth.addDoctor);
router.get   ('/auth/doctors',       auth.listDoctors);
router.patch ('/auth/doctors/:id',   auth.updateDoctor);
router.delete('/auth/doctors/:id',   auth.deleteDoctor);

// â”€â”€ Staff & RBAC management (admin only â€” enforced inside controller) â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get   ('/staff/doctors',            staff.listStaffDoctors);
router.get   ('/staff',                   staff.listStaff);
router.post  ('/staff',                   staff.createStaff);
router.patch ('/staff/:id',               staff.updateStaff);
router.delete('/staff/:id',               staff.deleteStaff);

router.get   ('/staff/roles',             staff.listRoles);
router.post  ('/staff/roles',             staff.createRole);
router.patch ('/staff/roles/:id',         staff.updateRole);
router.delete('/staff/roles/:id',         staff.deleteRole);
router.post  ('/staff/roles/:id/clone',   staff.cloneRole);

router.get   ('/staff/invitations',       staff.listInvitations);
router.post  ('/staff/invitations',       staff.createInvitation);
router.delete('/staff/invitations/:id',   staff.revokeInvitation);

router.get   ('/staff/activity-logs',     staff.listActivityLogs);

// Lab Staff (managed from OPD Settings â†’ Lab Staff tab)
router.get   ('/labs/staff',         labStaff.listStaff);
router.post  ('/labs/staff',         labStaff.createStaff);
router.patch ('/labs/staff/:id',     labStaff.updateStaff);
router.delete('/labs/staff/:id',     labStaff.deleteStaff);

// Patients (existing EMR patient store)
router.get   ('/patients',                         emr.listPatients);
router.post  ('/patients',                         subscription.subscriptionCheck('patients'), emr.createPatient);
router.post  ('/patients/register-abha',           emr.registerAbhaPatient);
router.get   ('/patients/history',                 appt.listPatientHistory);
router.get   ('/patients/:id',                     emr.getPatient);
router.patch ('/patients/:id',                     emr.updatePatient);
router.delete('/patients/:id',                     emr.deletePatient);
router.post  ('/patients/:id/care-contexts',              emr.addCareContext);
router.delete('/patients/:id/care-contexts/:ctxId',       emr.deleteCareContext);
router.post  ('/patients/:id/care-contexts/:ctxId/link',  emr.retryCareContextLink);

// ABHA Creation (M1) â€” OTP endpoints rate-limited
router.post('/patients/:id/abha/create-otp',        otpLimiter, emr.abhaCreateOtp);
router.post('/patients/:id/abha/create-verify',     emr.abhaCreateVerify);
router.post('/patients/:id/abha/mobile-otp',        otpLimiter, emr.abhaCreateMobileOtp);
router.post('/patients/:id/abha/mobile-verify',     emr.abhaCreateMobileVerify);
router.post('/patients/:id/abha/suggestions',       emr.abhaGetSuggestions);
router.post('/patients/:id/abha/set-address',       emr.abhaSetAddress);
router.post('/patients/:id/abha/sync-demographics',      emr.syncAbhaDemographics);
router.post('/patients/:id/abha/sync-from-share',        emr.syncDemographicsFromShare);
router.get ('/patients/:id/abha/card',              emr.abhaGetCard);

// ABHA Verification / Linking (M1)
router.post('/patients/:id/abha/verify-otp',        otpLimiter, emr.abhaVerifyOtp);
router.post('/patients/:id/abha/verify-confirm',    emr.abhaVerifyConfirm);

// Queues
router.get   ('/queues',     queue.listQueues);
router.post  ('/queues',     queue.createQueue);
router.patch ('/queues/:id', queue.updateQueue);
router.delete('/queues/:id', queue.deleteQueue);

// Appointments
router.get  ('/appointments',                    appt.listAppointments);
router.post ('/appointments',                    subscription.subscriptionCheck('appointments'), appt.createAppointment);
router.get  ('/appointments/:id',                appt.getAppointment);
router.patch('/appointments/:id/status',         appt.updateStatus);
router.post ('/appointments/:id/encounter',      subscription.subscriptionCheck('prescriptions'), appt.saveEncounter);
router.post ('/appointments/:id/reminder',       appt.sendReminder);

// Tags (Custom Attribute Values)
router.get   ('/tags',     tags.listTags);
router.post  ('/tags',     tags.createTag);
router.patch ('/tags/:id', tags.updateTag);
router.delete('/tags/:id', tags.deleteTag);

// Services
router.get   ('/services',              svc.listServices);
router.get   ('/services/bulk-template',svc.bulkTemplate);
router.post  ('/services/bulk-upload',  (() => {
  const multer = require('multer');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  return [upload.single('file'), svc.bulkUpload];
})());
router.post  ('/services',     svc.createService);
router.patch ('/services/:id', svc.updateService);
router.delete('/services/:id', svc.deleteService);

// Medical Documents
router.get   ('/appointments/:id/documents',         docs.listDocuments);
router.get   ('/appointments/:id/patient-documents', docs.listPatientDocuments);
router.post  ('/appointments/:id/documents',         docs.uploadDocument);
router.patch ('/appointments/:id/documents/:docId',  docs.patchDocument);
router.delete('/appointments/:id/documents/:docId',  docs.deleteDocument);
router.delete('/appointments/:id', async (req, res) => {
  const { pool } = require('../config/database');
  try {
    const { rows } = await pool.query(`DELETE FROM emr_appointments WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ message: 'Appointment deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Receipts
router.get  ('/receipts',     rec.listReceipts);
router.post ('/receipts',     rec.createReceipt);
router.get  ('/receipts/:id', rec.getReceipt);
router.patch('/receipts/:id', rec.updateReceipt);

// Theme Settings
router.get  ('/settings/theme',  theme.getTheme);
router.patch('/settings/theme',  theme.updateTheme);

// Clinic assets (header/footer/signature images)
router.get  ('/settings/clinic-assets', assets.getAssets);
router.patch('/settings/clinic-assets', assets.updateAssets);

// Prescription PDF download â€” same PDF used for email
const { generatePrescriptionPDF } = require('./emr.pdfgen');
router.get('/appointments/:id/prescription.pdf', async (req, res) => {
  try {
    const { rows: [appt] } = await pool.query(
      `SELECT a.*, d.name AS doctor_name FROM emr_appointments a LEFT JOIN emr_clinic_staff d ON d.id=a.doctor_id AND d.role='doctor' WHERE a.id=$1 AND a.clinic_id=$2`,
      [req.params.id, req.emrUser.clinic_id]
    );
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    const { rows: [encounter] } = await pool.query(`SELECT * FROM emr_encounters WHERE appointment_id=$1`, [req.params.id]);
    const { rows: [clinic] }   = await pool.query(`SELECT name, address, rx_header_img, rx_footer_img, rx_signature FROM emr_clinics WHERE id=$1`, [req.emrUser.clinic_id]);
    const pdf = await generatePrescriptionPDF({
      appt, encounter,
      clinicName:    clinic?.name || 'Clinic',
      clinicAddress: clinic?.address || '',
      doctorName:    appt.doctor_name || '',
      headerImg:     clinic?.rx_header_img  || '',
      footerImg:     clinic?.rx_footer_img  || '',
      signatureImg:  clinic?.rx_signature   || '',
    });
    const filename = `Rx_${appt.patient_name?.replace(/\s+/g,'_') || 'Patient'}_${appt.appointment_date?.toString().slice(0,10)}.pdf`;
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"` });
    res.send(pdf);
  } catch (e) {
    console.error('[pdf] generation failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Patient email notifications â€” fire-and-forget so SMTP delays never 500 the client
router.post('/email/prescription', async (req, res) => {
  const { to, patient_name, appointment_id } = req.body;
  if (!to) return res.status(400).json({ error: 'to is required' });
  try {
    const { rows: [clinic] } = await pool.query(`SELECT name, address, rx_header_img, rx_footer_img, rx_signature FROM emr_clinics WHERE id=$1`, [req.emrUser.clinic_id]);
    const { rows: [appt]   } = appointment_id
      ? await pool.query(`SELECT * FROM emr_appointments WHERE id=$1 AND clinic_id=$2`, [appointment_id, req.emrUser.clinic_id])
      : { rows: [null] };

    if (appointment_id) {
      await pool.query(`UPDATE emr_appointments SET patient_email=$1 WHERE id=$2 AND clinic_id=$3`,
        [to, appointment_id, req.emrUser.clinic_id]);
    }

    // Fetch encounter and clinic details for PDF
    const { rows: [encounter] } = appointment_id
      ? await pool.query(`SELECT * FROM emr_encounters WHERE appointment_id=$1`, [appointment_id])
      : { rows: [null] };
    const { rows: [doctor] } = appt?.doctor_id
      ? await pool.query(`SELECT name FROM emr_clinic_staff WHERE id=$1`, [appt.doctor_id])
      : { rows: [null] };

    // Respond immediately â€” generate PDF and send email in background
    res.json({ ok: true, queued: true });

    mailer.sendPrescriptionFromAppt({
      to,
      patientName:   patient_name || appt?.patient_name || 'Patient',
      clinicName:    clinic?.name || 'Clinic',
      clinicAddress: clinic?.address || '',
      doctorName:    doctor?.name || appt?.doctor_name || '',
      appt,
      encounter,
      headerImg:    clinic?.rx_header_img  || '',
      footerImg:    clinic?.rx_footer_img  || '',
      signatureImg: clinic?.rx_signature   || '',
    }).catch(e => console.error('[email] prescription send failed:', e.message));

  } catch (e) {
    console.error('[email] prescription route error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/email/receipt', async (req, res) => {
  const { to, patient_name, receipt_id } = req.body;
  if (!to || !receipt_id) return res.status(400).json({ error: 'to and receipt_id required' });
  try {
    const { rows: [clinic]  } = await pool.query(`SELECT name FROM emr_clinics WHERE id=$1`, [req.emrUser.clinic_id]);
    const { rows: [receipt] } = await pool.query(`SELECT * FROM emr_receipts WHERE id=$1 AND clinic_id=$2`, [receipt_id, req.emrUser.clinic_id]);
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    await pool.query(`UPDATE emr_receipts SET patient_email=$1 WHERE id=$2`, [to, receipt_id]);

    // Respond immediately
    res.json({ ok: true, queued: true });

    mailer.sendReceipt({
      to,
      patientName: patient_name || receipt.patient_name,
      clinicName:  clinic?.name || 'Clinic',
      receiptData: receipt,
    }).catch(e => console.error('[email] receipt send failed:', e.message));

  } catch (e) {
    console.error('[email] receipt route error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

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

// Patient profile shares (QR walk-in â€” SHARE_PATIENT_PROFILE_701)
router.get   ('/profile-shares',                        emr.listProfileShares);
router.patch ('/profile-shares/:id/dismiss',            emr.dismissProfileShare);
router.post  ('/profile-shares/:id/link-patient',       emr.linkProfileShareToPatient);

// Add Patient via Aadhaar (standalone) â€” OTP endpoints rate-limited
router.post('/abha/aadhaar-otp',          otpLimiter, emr.abhaCreateOtp);
router.post('/abha/aadhaar-verify',       emr.abhaCreateVerify);
router.post('/abha/aadhaar-mobile-otp',   otpLimiter, emr.abhaCreateMobileOtp);
router.post('/abha/aadhaar-mobile-verify',emr.abhaCreateMobileVerify);
router.post('/abha/aadhaar-suggestions',  emr.abhaGetSuggestions);
router.post('/abha/aadhaar-set-address',  emr.abhaAadhaarSetAddress);
router.post('/abha/aadhaar-finalize',     emr.abhaAadhaarCreate);
router.get ('/abha/card',                 emr.abhaGetCard);

// Add Patient via ABHA (standalone â€” no existing patient needed)
router.post('/abha/request-otp',   otpLimiter, emr.abhaAddOtp);
router.post('/abha/verify-create', emr.abhaAddCreate);

// Login with ABHA (patient verification at point of care)
router.post('/abha/login-request-otp',  otpLimiter, emr.abhaLoginRequestOtp);
router.post('/abha/login-verify-otp',   emr.abhaLoginVerifyOtp);
router.post('/abha/login-update-mobile',emr.abhaLoginUpdateMobile);
router.post('/abha/login-link-patient', emr.abhaLoginLinkPatient);

// Consent management (EMR acting as HIU)
router.post('/consents',                        emr.createConsentRequest);
router.get ('/consents',                        emr.listConsentRequests);
router.get ('/consents/health-records',         emr.getConsentHealthRecords);
router.post('/consents/:requestId/respond',     emr.respondConsent);
router.post('/consents/:requestId/pull-data',   emr.pullConsentData);
// Multi-HIP diagnostic: shows which HIPs are linked for a patient in our DB
// Use this to verify that other HIPs have linked care contexts before testing consent
router.get('/consents/linked-hips/:abha',       emr.getLinkedHipsForPatient);

// Lab results for EMR patient view â€” look up by mobile (bridges EMR â†” lab system)
router.get('/patients/:id/lab-results', async (req, res) => {
  try {
    const { pool } = require('../config/database');
    // Try direct UUID match first, then fall back to mobile-based lookup
    const { rows: direct } = await pool.query(
      `SELECT r.*, l.facility_name AS lab_name
       FROM lab_test_results r
       LEFT JOIN laboratories l ON l.id = r.lab_id
       WHERE r.patient_id::text = $1
       ORDER BY r.result_timestamp DESC LIMIT 100`,
      [req.params.id]
    );
    if (direct.length > 0) return res.json(direct);
    // Fallback: find user by mobile matching emr_patient
    const { rows: ep } = await pool.query(`SELECT mobile FROM emr_patients WHERE id=$1 AND deleted_at IS NULL`, [req.params.id]);
    if (!ep.length || !ep[0].mobile) return res.json([]);
    const { rows } = await pool.query(
      `SELECT r.*, l.facility_name AS lab_name
       FROM lab_test_results r
       LEFT JOIN laboratories l ON l.id = r.lab_id
       JOIN users u ON u.id = r.patient_id AND u.phone = $1
       ORDER BY r.result_timestamp DESC LIMIT 100`,
      [ep[0].mobile]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Lab reports for EMR patient view (released only)
router.get('/patients/:id/lab-reports', async (req, res) => {
  try {
    const { pool } = require('../config/database');

    // 1. Resolve UHID â€” prefer query param, then look up from emr_appointments
    let uhid = req.query.uhid || null;
    if (!uhid) {
      const { rows: uhidRows } = await pool.query(
        `SELECT MAX(uhid) AS uhid FROM emr_appointments WHERE emr_patient_id = $1 AND uhid IS NOT NULL`,
        [req.params.id]
      );
      uhid = uhidRows[0]?.uhid || null;
    }
    // Also try matching by appointment patient_id column (UUID) in case emr_patient_id differs
    if (!uhid && req.params.id && req.params.id !== 'unknown') {
      const { rows: uhidRows2 } = await pool.query(
        `SELECT MAX(uhid) AS uhid FROM emr_appointments WHERE uhid IS NOT NULL AND (
          emr_patient_id::text = $1 OR patient_mobile IN (
            SELECT mobile FROM emr_patients WHERE id::text = $1 AND deleted_at IS NULL
          )
        )`,
        [req.params.id]
      );
      uhid = uhidRows2[0]?.uhid || null;
    }

    // 2. Formal lab_reports (any status)
    const { rows: formalReports } = await pool.query(
      `SELECT r.id, r.report_number, r.created_at, r.observations, r.clinical_notes, r.pdf_path,
              l.facility_name AS lab_name, o.order_number,
              array_agg(json_build_object(
                'test_name', res.test_name,
                'result_value', res.result_value,
                'result_unit', res.result_unit,
                'is_critical', res.is_critical_value
              )) FILTER (WHERE res.id IS NOT NULL) AS results
       FROM lab_reports r
       LEFT JOIN laboratories l ON l.id = r.lab_id
       LEFT JOIN lab_orders o ON o.id = r.order_id
       LEFT JOIN lab_test_results res ON (res.patient_uhid = $2 OR res.patient_id::text = $1) AND res.lab_id = r.lab_id
       WHERE (r.patient_uhid = $2 OR r.patient_id::text = $1)
       GROUP BY r.id, l.facility_name, o.order_number
       ORDER BY r.created_at DESC`,
      [req.params.id, uhid || '']
    );

    // 3. Direct lab_test_results by UHID (uploaded results without a formal report)
    //    Group by lab + date to form virtual report cards
    let virtualReports = [];
    if (uhid) {
      const { rows: rawResults } = await pool.query(
        `SELECT res.id, res.test_name, res.result_value, res.result_unit,
                res.is_critical_value, res.collection_timestamp, res.result_status,
                res.reference_range_low, res.reference_range_high,
                l.facility_name AS lab_name, l.id AS lab_id
         FROM lab_test_results res
         LEFT JOIN laboratories l ON l.id = res.lab_id
         WHERE res.patient_uhid = $1
         ORDER BY res.collection_timestamp DESC`,
        [uhid]
      );

      // Group by lab + date
      const grouped = {};
      for (const r of rawResults) {
        const dateKey = r.collection_timestamp
          ? new Date(r.collection_timestamp).toISOString().split('T')[0]
          : 'unknown';
        const key = `${r.lab_id || 'unknown'}__${dateKey}`;
        if (!grouped[key]) {
          grouped[key] = {
            id: `vr_${key}`,
            report_number: null,
            order_number: null,
            lab_name: r.lab_name || 'Lab',
            created_at: r.collection_timestamp || new Date().toISOString(),
            observations: null,
            clinical_notes: null,
            pdf_path: null,
            results: [],
          };
        }
        grouped[key].results.push({
          test_name: r.test_name,
          result_value: r.result_value,
          result_unit: r.result_unit,
          is_critical: r.is_critical_value,
          reference_range_low: r.reference_range_low,
          reference_range_high: r.reference_range_high,
          result_status: r.result_status,
        });
      }
      virtualReports = Object.values(grouped);
    }

    // Also check lab_orders by UHID and pull their samples' results
    if (uhid) {
      const { rows: orderResults } = await pool.query(
        `SELECT o.id AS order_id, o.order_number, o.created_at, o.clinical_notes, o.status AS order_status,
                l.facility_name AS lab_name,
                json_agg(json_build_object(
                  'test_name', oi.test_name,
                  'result_value', COALESCE(ltr.result_value, ltr2.result_value),
                  'result_unit', COALESCE(ltr.result_unit, ltr2.result_unit),
                  'is_critical', COALESCE(ltr.is_critical_value, ltr2.is_critical_value, false),
                  'reference_range_low', COALESCE(ltr.reference_range_low, ltr2.reference_range_low),
                  'reference_range_high', COALESCE(ltr.reference_range_high, ltr2.reference_range_high),
                  'result_status', COALESCE(ltr.result_status, ltr2.result_status)
                ) ORDER BY oi.test_name) AS results
         FROM lab_orders o
         LEFT JOIN laboratories l ON l.id = o.lab_id
         LEFT JOIN lab_order_items oi ON oi.order_id = o.id
         LEFT JOIN lab_test_results ltr ON ltr.id = oi.result_id
         LEFT JOIN lab_test_results ltr2
           ON ltr.id IS NULL
           AND ltr2.patient_uhid = o.patient_uhid
           AND (LOWER(ltr2.test_code) = LOWER(oi.test_code) OR LOWER(ltr2.test_name) = LOWER(oi.test_name))
         WHERE o.patient_uhid = $1
         GROUP BY o.id, l.facility_name
         ORDER BY o.created_at DESC`,
        [uhid]
      );

      // Only add order-based cards if not already covered by virtualReports or formalReports
      const coveredOrderNums = new Set([
        ...formalReports.map(r => r.order_number),
        ...virtualReports.map(r => r.order_number),
      ]);
      for (const o of orderResults) {
        if (!coveredOrderNums.has(o.order_number)) {
          virtualReports.push({
            id: `order_${o.order_id}`,
            report_number: null,
            order_number: o.order_number,
            order_status: o.order_status,
            lab_name: o.lab_name || 'Lab',
            created_at: o.created_at,
            observations: null,
            clinical_notes: o.clinical_notes || null,
            pdf_path: null,
            results: (o.results || []).filter(r => r.test_name),
          });
        }
      }
    }

    // Merge and sort by date
    const all = [...formalReports, ...virtualReports].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
    res.json(all);
  } catch (err) {
    console.error('Lab reports error:', err);
    res.status(500).json({ error: err.message });
  }
});

// R2-006: authenticated file download â€” medical documents require valid EMR JWT
router.get('/uploads/:filename', (req, res) => {
  const fs        = require('fs');
  const pathMod   = require('path');
  const filename  = pathMod.basename(req.params.filename); // prevent path traversal
  const filePath  = pathMod.join(__dirname, '../../uploads', filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// â”€â”€ Audit log viewer (OWASP A10 / ABDM mandatory trail) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/audit-logs', async (req, res) => {
  const audit = require('../services/auditLogger');
  const { eventType, status, severity, ip, limit = 100, offset = 0 } = req.query;
  const rows = await audit.getRecentLogs({
    clinicId:  req.emrUser.clinic_id,
    eventType, status, severity,
    ipAddress: ip,
    limit:     Math.min(parseInt(limit) || 100, 500),
    offset:    parseInt(offset) || 0,
  });
  res.json(rows);
});

// Analytics dashboards
router.get('/analytics/appointments',   analytics.getAppointmentDashboard);
router.get('/analytics/patients',       analytics.getPatientsDashboard);
router.get('/analytics/realtime',       analytics.getRealtimeDashboard);
router.get('/analytics/prescriptions',  analytics.getPrescriptionAnalytics);
router.get('/analytics/form25',         analytics.getForm25);
router.get('/analytics/form25/summary', analytics.getForm25Summary);

// Inbound automated appointment booking (Telnyx + Gemini)
router.use('/inbound', inbound);

// Diet charts + food library
router.use('/diet', require('../routes/diet.routes'));

// POST /ai/lab-summary â€” AI-driven clinical interpretation of lab results
router.post('/ai/lab-summary', async (req, res) => {
  try {
    const axios = require('axios');
    const { results, patient_name, patient_age, patient_gender, order_number } = req.body;
    if (!Array.isArray(results) || results.length === 0) return res.status(400).json({ error: 'results array required' });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'AI not configured (GEMINI_API_KEY missing)' });

    const resultLines = results
      .filter(r => r.result_value != null)
      .map(r => {
        const flag = r.is_critical_value ? 'CRITICAL'
          : (r.result_value > r.reference_range_high) ? 'HIGH'
          : (r.result_value < r.reference_range_low) ? 'LOW' : 'Normal';
        const range = r.reference_range_low != null && r.reference_range_high != null
          ? ` (ref: ${r.reference_range_low}â€“${r.reference_range_high} ${r.result_unit || ''})` : '';
        return `- ${r.test_name}: ${r.result_value} ${r.result_unit || ''}${range} [${flag}]`;
      }).join('\n');

    const prompt = `You are a clinical lab specialist. Provide a concise, doctor-readable interpretation of these lab results.

Patient: ${patient_name || 'Unknown'}${patient_age ? `, ${patient_age}y` : ''}${patient_gender ? `, ${patient_gender}` : ''}
Order: ${order_number || 'N/A'}

Lab Results:
${resultLines}

Instructions:
1. Write 2-4 sentences interpreting the key findings clinically
2. Highlight any critical or abnormal values and their clinical significance
3. Suggest any follow-up tests or clinical actions if warranted
4. Keep language concise and suitable for a doctor's notes
5. Do NOT diagnose â€” interpret findings only`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 512, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
    };

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      body,
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(500).json({ error: 'Empty AI response' });
    return res.json({ success: true, summary: text.trim() });
  } catch (err) {
    return res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

module.exports = router;

