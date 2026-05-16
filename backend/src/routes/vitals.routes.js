const router = require('express').Router();
const { getVitals, getLatestVitals, addVital, deleteVital, getVitalStats } = require('../controllers/vitals.controller');
router.get('/', getVitals);
router.get('/latest', getLatestVitals);
router.get('/stats', getVitalStats);
router.post('/', addVital);
router.delete('/:id', deleteVital);
module.exports = router;
