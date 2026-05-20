const router  = require('express').Router();
const { emrAuth } = require('./emr.middleware');
const auth    = require('./emr.auth.controller');
const emr     = require('./emr.controller');
const queue   = require('./emr.queue.controller');
const appt    = require('./emr.appointment.controller');
const tags    = require('./emr.tags.controller');

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/auth/login',           auth.login);
router.post('/auth/register-clinic', auth.registerClinic);

// ── Protected (all routes below require EMR JWT) ───────────────────────────
router.use(emrAuth);

// Auth helpers
router.post('/auth/add-doctor', auth.addDoctor);
router.get ('/auth/doctors',    auth.listDoctors);

// Patients (existing EMR patient store)
router.get   ('/patients',                         emr.listPatients);
router.post  ('/patients',                         emr.createPatient);
router.get   ('/patients/:id',                     emr.getPatient);
router.patch ('/patients/:id',                     emr.updatePatient);
router.delete('/patients/:id',                     emr.deletePatient);
router.post  ('/patients/:id/care-contexts',       emr.addCareContext);
router.delete('/patients/:id/care-contexts/:ctxId',emr.deleteCareContext);

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

// Tags (Custom Attribute Values)
router.get   ('/tags',     tags.listTags);
router.post  ('/tags',     tags.createTag);
router.patch ('/tags/:id', tags.updateTag);
router.delete('/tags/:id', tags.deleteTag);

// ABDM / HIP activity
router.get('/pending-otps',    emr.pendingOtps);
router.get('/health-requests', emr.healthRequests);
router.get('/activity',        emr.activityLog);

module.exports = router;
