/**
 * Idempotent startup seed: makes sure every speciality in the catalogue has a published system
 * template. Existing system templates are never overwritten (the super admin may have edited
 * them); only missing specialities are created.
 */
const { SPECIALTIES, buildSpecialtyDefinition } = require('./catalog');
const svc = require('./service');

async function ensureSystemTemplates(pool, logger) {
  let created = 0;
  try {
    const { rows } = await pool.query(`SELECT specialty_key FROM clinical_templates WHERE clinic_id IS NULL`);
    const have = new Set(rows.map(r => r.specialty_key));
    for (const [key, spec] of Object.entries(SPECIALTIES)) {
      if (have.has(key)) continue;
      await svc.tx(db => svc.createTemplate(db, {
        clinicId: null, name: spec.name, specialtyKey: key, scribeSpecialty: spec.scribe,
        description: `Default ${spec.name} consultation template`,
        definition: buildSpecialtyDefinition(key), actor: { adminId: null },
      }));
      created += 1;
    }
    if (created) logger.info(`Clinical templates: seeded ${created} system template(s)`);
  } catch (err) {
    // Never block startup — the feature is opt-in per clinic.
    logger.error('Clinical templates: seed failed', { error: err.message });
  }
  return created;
}

module.exports = { ensureSystemTemplates };
