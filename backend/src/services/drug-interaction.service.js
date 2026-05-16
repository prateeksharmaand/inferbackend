const axios = require('axios');

const KNOWN_INTERACTIONS = {
  'metformin+aspirin': { severity: 'minor', description: 'Aspirin may slightly increase metformin levels.', recommendation: 'Monitor blood glucose. Generally safe to use together.' },
  'warfarin+aspirin': { severity: 'major', description: 'Combined use significantly increases bleeding risk.', recommendation: 'Avoid combination unless specifically prescribed. Monitor INR closely.' },
  'metformin+ibuprofen': { severity: 'moderate', description: 'NSAIDs can reduce kidney function, affecting metformin clearance.', recommendation: 'Use with caution. Stay well-hydrated. Monitor kidney function.' },
  'lisinopril+potassium': { severity: 'moderate', description: 'ACE inhibitors can increase potassium levels. Combined use may cause hyperkalemia.', recommendation: 'Monitor potassium levels regularly.' },
  'atorvastatin+clarithromycin': { severity: 'major', description: 'Clarithromycin can significantly increase statin levels, raising myopathy risk.', recommendation: 'Avoid combination or temporarily stop statin during antibiotic course.' },
  'amoxicillin+warfarin': { severity: 'moderate', description: 'Antibiotics may disrupt gut bacteria, affecting vitamin K production and INR.', recommendation: 'Monitor INR more frequently during antibiotic treatment.' },
};

async function checkDrugInteractions(drugs) {
  const interactions = [];
  const normalizedDrugs = drugs.map(d => d.toLowerCase().trim());

  // Check known interactions first
  for (let i = 0; i < normalizedDrugs.length; i++) {
    for (let j = i + 1; j < normalizedDrugs.length; j++) {
      const key1 = `${normalizedDrugs[i]}+${normalizedDrugs[j]}`;
      const key2 = `${normalizedDrugs[j]}+${normalizedDrugs[i]}`;
      const found = KNOWN_INTERACTIONS[key1] || KNOWN_INTERACTIONS[key2];
      if (found) {
        interactions.push({ drug1: drugs[i], drug2: drugs[j], ...found });
      }
    }
  }

  // Try OpenFDA if no known interactions found and API key is set
  if (interactions.length === 0 && process.env.OPENFDA_API_KEY) {
    try {
      for (let i = 0; i < normalizedDrugs.length; i++) {
        for (let j = i + 1; j < normalizedDrugs.length; j++) {
          const fdaResult = await _checkOpenFDA(normalizedDrugs[i], normalizedDrugs[j]);
          if (fdaResult) interactions.push({ drug1: drugs[i], drug2: drugs[j], ...fdaResult });
        }
      }
    } catch (e) {}
  }

  // AI-based check for remaining pairs
  if (interactions.length === 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const { analyzeWithAI } = require('./ai.service');
      const prompt = `Check drug interactions between: ${drugs.join(' and ')}. If there is an interaction, respond in JSON format: {"severity": "major/moderate/minor/none", "description": "...", "recommendation": "..."}. If no interaction, respond: {"severity": "none", "description": "No known significant interaction found.", "recommendation": "Generally safe, but consult your pharmacist."}`;
      const response = await analyzeWithAI(prompt, [], '');
      const jsonMatch = response.match(/\{[\s\S]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.severity !== 'none') {
          interactions.push({ drug1: drugs[0], drug2: drugs[1], ...parsed });
        }
      }
    } catch (e) {}
  }

  if (interactions.length === 0) {
    interactions.push({
      drug1: drugs[0], drug2: drugs[1] || drugs[0],
      severity: 'none',
      description: 'No known significant interaction found between these medicines.',
      recommendation: 'Generally considered safe to use together. Always confirm with your pharmacist or doctor.',
    });
  }

  return interactions;
}

async function _checkOpenFDA(drug1, drug2) {
  const url = `https://api.fda.gov/drug/label.json?search=drug_interactions:${encodeURIComponent(drug1)}+AND+${encodeURIComponent(drug2)}&limit=1&api_key=${process.env.OPENFDA_API_KEY}`;
  const response = await axios.get(url, { timeout: 5000 });
  if (response.data?.results?.[0]?.drug_interactions?.[0]) {
    const text = response.data.results[0].drug_interactions[0];
    return { severity: 'moderate', description: text.substring(0, 300), recommendation: 'Consult your doctor before combining these medications.' };
  }
  return null;
}

module.exports = { checkDrugInteractions };
