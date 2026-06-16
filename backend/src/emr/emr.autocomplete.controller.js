const axios = require('axios');

const NLM = 'https://clinicaltables.nlm.nih.gov/api';
// eka.care is called directly from the browser (server-side gets 403)
// /api/emr/autocomplete/drugs is the NLM fallback only

// GET /api/emr/autocomplete/icd10?q=fever
const searchICD10 = async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const { data } = await axios.get(`${NLM}/icd10cm/v3/search`, {
      params: { terms: q, sf: 'code,name', maxList: 12 },
      timeout: 8000,
    });
    const rows = data[3] || [];
    res.json(rows.map(([code, name]) => ({ code, name })));
  } catch (err) {
    console.error('[autocomplete/icd10] NLM fetch error:', err.code, err.message);
    res.json([]);
  }
};

// GET /api/emr/autocomplete/rxterms?q=amox
const searchRxTerms = async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const { data } = await axios.get(`${NLM}/rxterms/v3/search`, {
      params: { terms: q, ef: 'STRENGTHS_AND_FORMS', maxList: 12 },
      timeout: 8000,
    });
    const rows = data[3] || [];
    const strengths = (data[2] && data[2].STRENGTHS_AND_FORMS) || [];
    res.json(rows.map((row, i) => ({
      name: row[0],
      strength: (strengths[i] || []).join(', '),
    })));
  } catch (err) {
    console.error('[autocomplete/rxterms] NLM fetch error:', err.code, err.message);
    res.json([]);
  }
};

// ── Drug search: NLM RxTerms (used as fallback when eka.care fails client-side)
// GET /api/emr/autocomplete/drugs?q=amox
// eka.care is called directly from the browser — server-side calls get 403.
const searchDrugs = async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  try {
    const { data } = await axios.get(`${NLM}/rxterms/v3/search`, {
      params: { terms: q, ef: 'STRENGTHS_AND_FORMS', maxList: 15 },
      timeout: 8000,
    });
    const rows      = data[3] || [];
    const strengths = (data[2]?.STRENGTHS_AND_FORMS) || [];
    return res.json(rows.map((row, i) => ({
      name:         row[0],
      strength:     (strengths[i] || []).join(', '),
      type:         '',
      manufacturer: '',
      source:       'rxterms',
    })));
  } catch (err) {
    console.error('[autocomplete/drugs] NLM fetch failed:', err.message);
    return res.json([]);
  }
};

// GET /api/emr/autocomplete/ping — connectivity test
const ping = async (req, res) => {
  try {
    const { data } = await axios.get(`${NLM}/icd10cm/v3/search`, {
      params: { terms: 'fever', sf: 'code,name', maxList: 3 },
      timeout: 8000,
    });
    res.json({ ok: true, sample: data[3] || [] });
  } catch (err) {
    res.json({ ok: false, error: err.message, code: err.code });
  }
};

module.exports = { searchICD10, searchRxTerms, searchDrugs, ping };
