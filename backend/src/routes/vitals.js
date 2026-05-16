const express = require('express');
const router = express.Router();
const { addVital, getVitals, getVitalStats, getLatestVitals, deleteVital } = require('../controllers/vitalsController');
const { authenticate, authorizeProfile } = require('../middleware/auth');

router.use(authenticate);

router.post('/', addVital);
router.get('/profile/:profileId', authorizeProfile, getVitals);
router.get('/profile/:profileId/latest', authorizeProfile, getLatestVitals);
router.get('/profile/:profileId/stats', authorizeProfile, getVitalStats);
router.delete('/:vitalId', deleteVital);

module.exports = router;
