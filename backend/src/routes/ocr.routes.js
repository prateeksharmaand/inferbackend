const router = require('express').Router();
const { analyzeDocumentText, extractVitalsFromText } = require('../services/vitals-extractor.service');

router.post('/analyze', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });
  const result = analyzeDocumentText(text);
  const vitals = extractVitalsFromText(text);
  res.json({ ...result, vitals });
});

module.exports = router;
