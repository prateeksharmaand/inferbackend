const router = require('express').Router();
const { chat, checkInteractions, symptomCheck, getMedicineInfo } = require('../controllers/healthbot.controller');
router.post('/chat', chat);
router.post('/drug-interactions', checkInteractions);
router.post('/symptom-check', symptomCheck);
router.get('/medicine-info', getMedicineInfo);
module.exports = router;
