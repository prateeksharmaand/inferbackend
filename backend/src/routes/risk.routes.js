const router = require('express').Router();
const { getRiskPrediction } = require('../controllers/risk.controller');

router.get('/', getRiskPrediction);

module.exports = router;
