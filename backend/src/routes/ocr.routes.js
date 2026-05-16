const router = require('express').Router();
const { analyzeDocumentText } = require('../services/vitals-extractor.service');

router.post('/analyze', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });
  const result = analyzeDocumentText(text);
  res.json(result);
});

module.exports = router;
