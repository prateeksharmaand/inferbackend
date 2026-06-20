const { pool } = require('../config/database');

// 30-second cache to avoid a DB round-trip on every ABDM request
const _cache = new Map(); // key → { data, expiresAt }
const CACHE_TTL = 30_000;

function _fromRow(c) {
  return {
    clinicId:    c.id,
    clinicName:  c.name,
    hipId:       c.hip_id,
    hipName:     c.hip_name || c.name,
    hiuId:       c.hiu_id  || c.hip_id,
    hiuName:     c.hiu_name || c.hip_name || c.name,
    abdmEnabled: c.abdm_enabled,
    abdmStatus:  c.abdm_status,
  };
}

// Primary resolver: clinic staff flow (req.emrUser.clinic_id available)
async function getClinicAbdmConfig(clinicId) {
  const key = `clinic:${clinicId}`;
  const hit = _cache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.data;

  const { rows } = await pool.query(
    `SELECT id, name, hip_id, hip_name, hiu_id, hiu_name, abdm_enabled, abdm_status
     FROM emr_clinics WHERE id = $1`,
    [clinicId]
  );
  if (!rows.length) throw Object.assign(new Error(`Clinic ${clinicId} not found`), { status: 404 });

  const c = rows[0];
  if (!c.abdm_enabled)
    throw Object.assign(new Error(`ABDM not enabled for clinic ${clinicId}`), { status: 422, code: 'ABDM_DISABLED' });
  if (!c.hip_id)
    throw Object.assign(new Error(`HIP ID not configured for clinic ${clinicId}`), { status: 422, code: 'HIP_NOT_CONFIGURED' });

  const data = _fromRow(c);
  _cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
  return data;
}

// Callback resolver: when we know the hipId but not the clinicId
async function getClinicByHipId(hipId) {
  const key = `hip:${hipId}`;
  const hit = _cache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.data;

  const { rows } = await pool.query(
    `SELECT id, name, hip_id, hip_name, hiu_id, hiu_name, abdm_enabled, abdm_status
     FROM emr_clinics WHERE hip_id = $1 AND abdm_enabled = true LIMIT 1`,
    [hipId]
  );
  if (!rows.length) return null;

  const data = _fromRow(rows[0]);
  _cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
  return data;
}

// PHR user flow (req.user.id): resolve clinic via patient's ABHA linkage
async function getClinicAbdmConfigForPhrUser(userId) {
  const { rows } = await pool.query(
    `SELECT ec.id, ec.name, ec.hip_id, ec.hip_name, ec.hiu_id, ec.hiu_name, ec.abdm_enabled, ec.abdm_status
     FROM emr_clinics ec
     JOIN emr_patients ep ON ep.clinic_id = ec.id
     JOIN abha_accounts aa ON aa.user_id = $1
     WHERE (ep.abha_address = aa.abha_address OR ep.abha_number = aa.abha_number)
       AND ec.abdm_enabled = true
       AND ec.hiu_id IS NOT NULL
     ORDER BY ec.id ASC
     LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  return _fromRow(rows[0]);
}

// Invalidate cache after a clinic's ABDM config changes
function invalidateCache(clinicId) {
  // Evict all keys that reference this clinic (by clinicId or any hipId it owns)
  for (const key of _cache.keys()) {
    if (key === `clinic:${clinicId}`) _cache.delete(key);
  }
  // Also flush hip: entries since we don't know the old hipId here
  for (const key of _cache.keys()) {
    if (key.startsWith('hip:')) _cache.delete(key);
  }
}

module.exports = {
  getClinicAbdmConfig,
  getClinicByHipId,
  getClinicAbdmConfigForPhrUser,
  invalidateCache,
};
