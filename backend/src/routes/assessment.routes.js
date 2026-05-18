const router = require('express').Router();
const { generateQuestions, analyzeAnswers } = require('../controllers/assessment.controller');

router.post('/questions', generateQuestions);
router.post('/analyze',   analyzeAnswers);

module.exports = router;
