const express = require('express');
const router = express.Router();
const { getMedicines, addMedicine, updateMedicine, deleteMedicine, logMedicineTaken, checkInteractions, getDrugInformation, getReminders } = require('../controllers/medicinesController');
const { authenticate, authorizeProfile } = require('../middleware/auth');

router.use(authenticate);

router.get('/profile/:profileId', authorizeProfile, getMedicines);
router.get('/profile/:profileId/reminders', authorizeProfile, getReminders);
router.get('/profile/:profileId/interactions', authorizeProfile, checkInteractions);
router.get('/drug-info/:drugName', getDrugInformation);
router.post('/', addMedicine);
router.post('/log', logMedicineTaken);
router.put('/:medicineId', updateMedicine);
router.delete('/:medicineId', deleteMedicine);

module.exports = router;
