const { predictRisk, getCachedRisk } = require('../services/risk.service');
const { addTimelineEvent } = require('../services/timeline.service');

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
  const formatted = _format(risk);
  const label = formatted.level.charAt(0).toUpperCase() + formatted.level.slice(1);
  await addTimelineEvent(
    userId, 'risk',
    `Risk Assessment: ${label} (${formatted.score}/100)`,
    formatted.recommendation?.summary?.slice(0, 120) || null,
    { score: formatted.score, level: formatted.level, factors: formatted.factors?.length ?? 0 },
    new Date(), risk.id, 'risk_prediction'
  ).catch(() => {});
  res.json({ risk: formatted, cached: false });
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
