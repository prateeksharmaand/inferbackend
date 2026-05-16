const axios = require('axios');
const { query } = require('../config/database');
const logger = require('../config/logger');

const OPENFDA_BASE = process.env.OPENFDA_API_URL || 'https://api.fda.gov/drug';

async function checkInteraction(drug1, drug2) {
  const d1 = drug1.toLowerCase().trim();
  const d2 = drug2.toLowerCase().trim();

  // Check cache first
  const cached = await query(
    `SELECT * FROM drug_interactions
     WHERE (drug_1 = $1 AND drug_2 = $2) OR (drug_1 = $2 AND drug_2 = $1)
     AND cached_at > NOW() - INTERVAL '7 days'`,
    [d1, d2]
  );

  if (cached.rows.length) {
    return cached.rows[0];
  }

  try {
    // Query OpenFDA for drug interaction info
    const response = await axios.get(`${OPENFDA_BASE}/label.json`, {
      params: {
        search: `drug_interactions:"${d2}"&openfda.generic_name:"${d1}"`,
        limit: 1,
      },
      timeout: 5000,
    });

    if (response.data.results && response.data.results.length > 0) {
      const result = response.data.results[0];
      const interactionText = result.drug_interactions?.[0] || '';

      const severity = determineSeverity(interactionText);
      const interaction = {
        drug_1: d1,
        drug_2: d2,
        severity,
        description: interactionText.substring(0, 1000),
      };

      // Cache it
      await query(
        `INSERT INTO drug_interactions (drug_1, drug_2, severity, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (drug_1, drug_2) DO UPDATE
         SET severity = $3, description = $4, cached_at = NOW()`,
        [d1, d2, severity, interaction.description]
      );

      return interaction;
    }

    return { drug_1: d1, drug_2: d2, severity: 'none', description: 'No known interaction found' };
  } catch (err) {
    logger.error('Drug interaction check failed:', err.message);
    return { drug_1: d1, drug_2: d2, severity: 'unknown', description: 'Could not check interaction at this time' };
  }
}

async function checkMultipleInteractions(drugs) {
  const interactions = [];
  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) {
      const result = await checkInteraction(drugs[i], drugs[j]);
      if (result.severity !== 'none') {
        interactions.push(result);
      }
    }
  }
  return interactions;
}

function determineSeverity(text) {
  const lower = text.toLowerCase();
  if (/contraindicated|avoid|do not use|fatal|life.threatening/i.test(lower)) return 'major';
  if (/caution|monitor|may increase|may decrease|clinical significance/i.test(lower)) return 'moderate';
  if (/minor|minimal|unlikely/i.test(lower)) return 'minor';
  return 'moderate';
}

async function getDrugInfo(drugName) {
  try {
    const response = await axios.get(`${OPENFDA_BASE}/label.json`, {
      params: {
        search: `openfda.generic_name:"${drugName}"`,
        limit: 1,
      },
      timeout: 5000,
    });

    if (response.data.results && response.data.results.length > 0) {
      const r = response.data.results[0];
      return {
        name: drugName,
        indications: r.indications_and_usage?.[0]?.substring(0, 500),
        warnings: r.warnings?.[0]?.substring(0, 500),
        dosage: r.dosage_and_administration?.[0]?.substring(0, 500),
        side_effects: r.adverse_reactions?.[0]?.substring(0, 500),
      };
    }

    return null;
  } catch (err) {
    logger.error('Drug info fetch failed:', err.message);
    return null;
  }
}

module.exports = { checkInteraction, checkMultipleInteractions, getDrugInfo };
