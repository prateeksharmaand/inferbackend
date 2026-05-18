const { predictRisk, getCachedRisk } = require('../services/risk.service');

const CACHE_TTL_MINUTES = 30;

async function getRiskPrediction(req, res) {
  const userId = req.user.id;
  const forceRefresh = req.query.refresh === 'true';

  if (!forceRefresh) {
    const cached = await getCachedRisk(userId);
    if (cached) {
      const ageMinutes = (Date.now() - new Date(cached.computed_at)) / 60_000;
      if (ageMinutes < CACHE_TTL_MINUTES) {
        return res.json({ risk: _format(cached), cached: true });
      }
    }
  }

  const risk = await predictRisk(userId);
  res.json({ risk: _format(risk), cached: false });
}

function _format(row) {
  return {
    id:             row.id,
    score:          row.score,
    level:          row.level,
    factors:        typeof row.factors === 'string' ? JSON.parse(row.factors) : row.factors,
    recommendation: typeof row.recommendation === 'string'
      ? (() => { try { return JSON.parse(row.recommendation); } catch { return { summary: row.recommendation, recommendations: [], urgent: false }; } })()
      : row.recommendation,
    computedAt:     row.computed_at,
  };
}

module.exports = { getRiskPrediction };
