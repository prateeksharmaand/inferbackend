const axios = require('axios');

const NLM    = 'https://clinicaltables.nlm.nih.gov/api';
const EKACARE = 'https://mdb.eka.care/v1/drugs-and-labs';

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

// ── Drug search: eka.care first, NLM RxTerms fallback ────────────────────────
// GET /api/emr/autocomplete/drugs?q=amox
// Normalised response: [{ name, strength, type, source }]

async function _searchEkaCare(q) {
  const { data } = await axios.get(EKACARE, {
    params: { q },
    timeout: 5000,
    headers: {
      // Identify ourselves as a legitimate healthcare platform
      'User-Agent': 'InferEMR/1.0 (healthcare platform; contact@inferapp.online)',
      'Accept': 'application/json',
    },
  });

  // eka.care returns: { data: [{ name, type, composition, ... }] }
  const items = data?.data ?? data?.results ?? (Array.isArray(data) ? data : []);
  return items.slice(0, 15).map(d => ({
    name:       d.name       ?? d.drug_name  ?? d.label ?? '',
    strength:   d.composition ?? d.strength  ?? '',
    type:       d.type       ?? d.drug_type  ?? '',
    manufacturer: d.manufacturer ?? d.company ?? '',
    source:     'ekacare',
  })).filter(d => d.name);
}

async function _searchRxTermsFallback(q) {
  const { data } = await axios.get(`${NLM}/rxterms/v3/search`, {
    params: { terms: q, ef: 'STRENGTHS_AND_FORMS', maxList: 15 },
    timeout: 8000,
  });
  const rows      = data[3] || [];
  const strengths = (data[2]?.STRENGTHS_AND_FORMS) || [];
  return rows.map((row, i) => ({
    name:     row[0],
    strength: (strengths[i] || []).join(', '),
    type:     '',
    manufacturer: '',
    source:   'rxterms',
  }));
}

const searchDrugs = async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  // 1. Try eka.care
  try {
    const results = await _searchEkaCare(q);
    if (results.length > 0) return res.json(results);
  } catch (err) {
    // eka.care unavailable or returned error — fall through to NLM
    console.warn('[autocomplete/drugs] eka.care failed, trying NLM fallback:', err.message);
  }

  // 2. Fallback: NLM RxTerms (US drug database — covers generics well)
  try {
    const results = await _searchRxTermsFallback(q);
    return res.json(results);
  } catch (err) {
    console.error('[autocomplete/drugs] NLM fallback also failed:', err.message);
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
