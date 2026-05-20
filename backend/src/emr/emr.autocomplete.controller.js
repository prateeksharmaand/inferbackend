const axios = require('axios');

const NLM = 'https://clinicaltables.nlm.nih.gov/api';

// GET /api/emr/autocomplete/icd10?q=fever
const searchICD10 = async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const { data } = await axios.get(`${NLM}/icd10cm/v3/search`, {
      params: { terms: q, maxList: 12 },
      timeout: 5000,
    });
    const rows = data[3] || [];
    res.json(rows.map(([code, name]) => ({ code, name })));
  } catch {
    res.json([]);
  }
};

// GET /api/emr/autocomplete/rxterms?q=amox
const searchRxTerms = async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const { data } = await axios.get(`${NLM}/rxterms/v3/search`, {
      params: { terms: q, maxList: 12 },
      timeout: 5000,
    });
    const rows = data[3] || [];
    res.json(rows.map(row => ({ name: row[0], strength: row[3] || '' })));
  } catch {
    res.json([]);
  }
};

module.exports = { searchICD10, searchRxTerms };
