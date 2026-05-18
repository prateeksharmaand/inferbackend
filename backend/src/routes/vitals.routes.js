const router = require('express').Router();
const { getVitals, getLatestVitals, getAllLatestVitals, addVital, deleteVital, getVitalStats } = require('../controllers/vitals.controller');
router.get('/', getVitals);
router.get('/latest', getLatestVitals);
router.get('/all-latest', getAllLatestVitals);
router.get('/stats', getVitalStats);
router.post('/', addVital);
router.delete('/:id', deleteVital);
module.exports = router;
