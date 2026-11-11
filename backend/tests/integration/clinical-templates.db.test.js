/**
 * Clinical templates against a real PostgreSQL database (migration 033 applied).
 * Everything runs inside one transaction that is always rolled back — no data is left behind.
 *
 * Runs only when CT_DB_TEST=1 (and DB_* / DATABASE_URL env vars point at the database):
 *   CT_DB_TEST=1 npx jest tests/integration/clinical-templates.db.test.js
 */
const RUN = process.env.CT_DB_TEST === '1';
const maybe = RUN ? describe : describe.skip;

maybe('clinical templates (database)', () => {
  const { pool } = require('../../src/config/database');
  const svc = require('../../src/emr/clinicalTemplates/service');
  const C = require('../../src/emr/clinicalTemplates/catalog');
  const D = require('../../src/emr/clinicalTemplates/definition');
  let db;

  beforeAll(async () => { db = await pool.connect(); await db.query('BEGIN'); });
  afterAll(async () => { await db.query('ROLLBACK'); db.release(); await pool.end(); });

  const sp = name => db.query(`SAVEPOINT ${name}`);
  const rollbackTo = name => db.query(`ROLLBACK TO SAVEPOINT ${name}`);

  test('full lifecycle: seed → clinic override → doctor override → snapshot → new version keeps history', async () => {
    const { rows: [c1] } = await db.query(`INSERT INTO emr_clinics (name) VALUES ('CT test clinic A') RETURNING id`);
    const { rows: [c2] } = await db.query(`INSERT INTO emr_clinics (name) VALUES ('CT test clinic B') RETURNING id`);
    const { rows: [doc] } = await db.query(
      `INSERT INTO emr_clinic_staff (clinic_id, name, email, password_hash, role) VALUES ($1,'Dr Test','ct-test-${Date.now()}@example.invalid','x','doctor') RETURNING id`, [c1.id]);

    // System template (created inside the transaction under a unique speciality key)
    const sys = await svc.createTemplate(db, {
      clinicId: null, name: `CT Cardio ${Date.now()}`, specialtyKey: `ct_cardio_${Date.now()}`,
      definition: C.buildSpecialtyDefinition('cardiology'), actor: {},
    });
    expect(sys.published_version_id).toBeTruthy();

    // Not adopted yet → legacy behaviour
    expect(await svc.chooseTemplate(db, c1.id, doc.id)).toBeNull();
    await db.query(`INSERT INTO clinic_template_selections (clinic_id, template_id, is_default) VALUES ($1,$2,true)`, [c1.id, sys.id]);

    // Clinic makes murmur required and adds a field; doctor hides notes
    await svc.replaceOverrides(db, { clinicId: c1.id, staffId: null, templateId: sys.id, actor: { staffId: doc.id }, rows: [
      { section_key: 'examination_findings', field_key: 'murmur', kind: 'modify', props: { required: true } },
      { section_key: 'examination_findings', field_key: 'jvp', kind: 'add', props: { label: 'JVP', type: 'measurement', unit: 'cm' } },
    ] });
    await svc.replaceOverrides(db, { clinicId: c1.id, staffId: doc.id, templateId: sys.id, actor: { staffId: doc.id }, rows: [
      { section_key: 'notes', field_key: '', kind: 'modify', props: { enabled: false } },
    ] });
    const tpl = await svc.chooseTemplate(db, c1.id, doc.id);
    const eff = await svc.effective(db, { clinicId: c1.id, staffId: doc.id, tpl });
    const ex = eff.definition.sections.find(s => s.key === 'examination_findings');
    expect(ex.fields.find(f => f.key === 'murmur').required).toBe(true);
    expect(ex.fields.find(f => f.key === 'jvp')).toBeTruthy();
    expect(eff.definition.sections.find(s => s.key === 'notes').enabled).toBe(false);

    // Clinic B sees none of clinic A's customisations
    const effB = await svc.effective(db, { clinicId: c2.id, staffId: null, tpl });
    expect(effB.definition.sections.find(s => s.key === 'examination_findings').fields.find(f => f.key === 'jvp')).toBeUndefined();
    // …and cannot read clinic A's own templates
    const own = await svc.duplicateTemplate(db, sys, { clinicId: c1.id, name: 'A copy', actor: {} });
    expect(() => svc.assertAccess(own, { clinicId: c2.id })).toThrow('Template not found');

    // A consultation: missing required murmur blocks, allow_incomplete passes (murmur not locked)
    const appt = { patient_gender: 'M', patient_dob: '1980-01-01' };
    const blocked = await svc.prepareConsultationSave(db, { clinicId: c1.id, staffId: doc.id, appointment: appt, body: {} });
    expect(blocked.blocked).toBe(true);
    const ok = await svc.prepareConsultationSave(db, { clinicId: c1.id, staffId: doc.id, appointment: appt, body: {
      template_values: { examination_findings: { murmur: 'absent', jvp: 4 } },
    } });
    expect(ok.blocked).toBe(false);
    expect(ok.values).toEqual({ examination_findings: { murmur: 'absent', jvp: 4 } });
    const snap1 = await svc.getSnapshot(db, ok.snapshotId);

    // Same effective template → same snapshot row (no duplication)
    const again = await svc.prepareConsultationSave(db, { clinicId: c1.id, staffId: doc.id, appointment: appt, body: {
      template_values: { examination_findings: { murmur: 'present' } },
    } });
    expect(again.snapshotId).toBe(ok.snapshotId);

    // Publish v2 renaming a field: the old snapshot is untouched
    const draftDef = D.normalizeDefinition((await svc.publishedDefinition(db, sys)).definition);
    draftDef.sections.find(s => s.key === 'examination_findings').fields.find(f => f.key === 'murmur').label = 'Cardiac murmur';
    await svc.saveDraft(db, sys, draftDef, {});
    const v2 = await svc.publish(db, await svc.getTemplate(db, sys.id), {}, 'rename');
    expect(v2.versionNo).toBe(2);
    const snapAfter = await svc.getSnapshot(db, ok.snapshotId);
    expect(snapAfter.definition).toEqual(snap1.definition);
    const effV2 = await svc.effective(db, { clinicId: c1.id, staffId: doc.id, tpl: await svc.getTemplate(db, sys.id) });
    expect(effV2.definition.sections.find(s => s.key === 'examination_findings').fields.find(f => f.key === 'murmur').label).toBe('Cardiac murmur');

    // Published versions are immutable at the database level
    await sp('immut');
    await expect(db.query(`UPDATE clinical_template_sections SET label = 'x' WHERE version_id = $1`, [v2.versionId])).rejects.toThrow(/cannot be modified/);
    await rollbackTo('immut');

    // Audit trail recorded
    const { rows: audit } = await db.query(`SELECT action FROM clinical_template_audit WHERE template_id = $1`, [sys.id]);
    expect(audit.map(a => a.action)).toEqual(expect.arrayContaining(['created', 'published', 'clinic_overrides_saved', 'doctor_overrides_saved', 'draft_saved']));
  });

  test('every seeded system template is published and valid', async () => {
    const { rows } = await db.query(`SELECT specialty_key FROM clinical_templates WHERE clinic_id IS NULL AND NOT is_archived`);
    const keys = rows.map(r => r.specialty_key);
    for (const k of Object.keys(C.SPECIALTIES)) expect(keys).toContain(k);
  });
});
