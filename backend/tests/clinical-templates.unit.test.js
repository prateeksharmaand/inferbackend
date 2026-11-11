/**
 * Clinical Template Builder — pure logic: catalogue seeds, inheritance, diffing, hashing, validation.
 */
const C = require('../src/emr/clinicalTemplates/catalog');
const D = require('../src/emr/clinicalTemplates/definition');
const V = require('../src/emr/clinicalTemplates/validator');

const spec = key => C.buildSpecialtyDefinition(key);
const section = (def, key) => def.sections.find(s => s.key === key);
const field = (def, s, f) => section(def, s).fields.find(x => x.key === f);

describe('catalogue seeds', () => {
  const keys = Object.keys(C.SPECIALTIES);

  test('all 15 specialities plus General are defined', () => {
    for (const k of ['cardiology', 'dermatology', 'emergency', 'endocrinology', 'ent', 'gastroenterology', 'gynecology',
      'nephrology', 'neurology', 'oncology', 'ophthalmology', 'orthopedics', 'pediatrics', 'psychiatry', 'pulmonology', 'general']) {
      expect(keys).toContain(k);
    }
    expect(keys).toHaveLength(16);
  });

  test.each(keys)('%s builds a structurally valid definition', key => {
    const def = spec(key);
    expect(V.validateDefinition(def)).toEqual([]);
    expect(def.sections.map(s => s.key)).toEqual(C.SECTIONS.map(s => s.key)); // every section present
  });

  test('section enablement mirrors the existing speciality map', () => {
    expect(section(spec('psychiatry'), 'vitals').enabled).toBe(false);
    expect(section(spec('ophthalmology'), 'ophtho_iop').enabled).toBe(true);
    expect(section(spec('cardiology'), 'ophtho_iop').enabled).toBe(false);
    expect(section(spec('pediatrics'), 'growth_chart').enabled).toBe(true);
    expect(section(spec('ent'), 'ent_ear_exam').enabled).toBe(true);
  });

  test('specialities do not share identical clinical fields', () => {
    expect(field(spec('cardiology'), 'examination_findings', 'heart_sounds')).toBeTruthy();
    expect(field(spec('dermatology'), 'examination_findings', 'lesion_morphology')).toBeTruthy();
    expect(field(spec('orthopedics'), 'examination_findings', 'range_of_motion')).toBeTruthy();
    expect(field(spec('pediatrics'), 'medical_history', 'immunisation_status')).toBeTruthy();
    expect(field(spec('gynecology'), 'vitals', 'lmp')).toBeTruthy();
    expect(field(spec('general'), 'examination_findings', 'heart_sounds')).toBeUndefined();
  });

  test('vitals and row columns are core fields mapped to existing encounter data', () => {
    const v = field(spec('general'), 'vitals', 'bp_systolic');
    expect(v).toMatchObject({ storage: 'core', core_path: 'vitals.bp_systolic', unit: 'mmHg' });
    expect(v.validation.ref_ranges[0]).toEqual({ low: 100, high: 140 });
    const route = field(spec('general'), 'medications', 'route');
    expect(route).toMatchObject({ storage: 'core', core_path: 'medications[].route', enabled: false });
  });
});

describe('inheritance (system → clinic → doctor)', () => {
  const base = spec('cardiology');

  test('clinic can rename, require and add a field; template stays untouched', () => {
    const { definition, ignored } = D.applyOverrides(base, [
      { section_key: 'examination_findings', field_key: 'heart_sounds', kind: 'modify', props: { label: 'Heart sounds (auscultation)', required: true } },
      { section_key: 'examination_findings', field_key: 'jvp', kind: 'add', props: { label: 'JVP', type: 'measurement', unit: 'cm' } },
    ], 'clinic');
    expect(ignored).toEqual([]);
    expect(field(definition, 'examination_findings', 'heart_sounds')).toMatchObject({ label: 'Heart sounds (auscultation)', required: true });
    expect(field(definition, 'examination_findings', 'jvp')).toMatchObject({ origin: 'clinic', storage: 'custom' });
    expect(field(base, 'examination_findings', 'heart_sounds').required).toBeFalsy(); // input not mutated
  });

  test('a locked item cannot be disabled, relaxed or have its rules changed below', () => {
    const locked = D.applyOverrides(base, [
      { section_key: 'vitals', field_key: 'bp_systolic', kind: 'modify', props: { locked: true, required: true } },
    ], 'clinic').definition;
    const r = D.applyOverrides(locked, [
      { section_key: 'vitals', field_key: 'bp_systolic', kind: 'modify', props: { enabled: false, required: false, validation: null, order: 0 } },
    ], 'doctor');
    const f = field(r.definition, 'vitals', 'bp_systolic');
    expect(f.enabled).toBe(true);
    expect(f.required).toBe(true);
    expect(r.ignored.map(i => i.prop).sort()).toEqual(['enabled', 'required', 'validation']);
  });

  test('doctor can hide and reorder optional items and set defaults, but not relax required ones', () => {
    const clinic = D.applyOverrides(base, [
      { section_key: 'diagnosis', field_key: '', kind: 'modify', props: { required: true } },
    ], 'clinic').definition;
    const r = D.applyOverrides(clinic, [
      { section_key: 'notes', field_key: '', kind: 'modify', props: { enabled: false } },
      { section_key: 'diagnosis', field_key: '', kind: 'modify', props: { enabled: false, required: false } },
      { section_key: 'advices', field_key: '', kind: 'modify', props: { default_value: 'Low-salt diet', order: 1 } },
      { section_key: 'examination_findings', field_key: 'heart_sounds', kind: 'modify', props: { label: 'renamed' } },
    ], 'doctor');
    expect(section(r.definition, 'notes').enabled).toBe(false);
    expect(section(r.definition, 'diagnosis')).toMatchObject({ enabled: true, required: true });
    expect(section(r.definition, 'advices').default_value).toBe('Low-salt diet');
    expect(field(r.definition, 'examination_findings', 'heart_sounds').label).toBe('Heart sounds');
    expect(r.ignored.map(i => `${i.section_key}.${i.prop}:${i.reason}`).sort()).toEqual([
      'diagnosis.enabled:required', 'diagnosis.required:not_permitted', 'examination_findings.label:not_permitted',
    ]);
  });

  test('doctor has full control of fields they added', () => {
    const r = D.applyOverrides(base, [
      { section_key: 'notes', field_key: 'smoking_advice', kind: 'add', props: { label: 'Smoking advice', type: 'textarea' } },
      { section_key: 'notes', field_key: 'smoking_advice', kind: 'modify', props: { label: 'Tobacco cessation', required: true } },
    ], 'doctor');
    expect(field(r.definition, 'notes', 'smoking_advice')).toMatchObject({ label: 'Tobacco cessation', required: true, origin: 'doctor' });
  });

  test('diffDefinitions round-trips a clinic edit into minimal overrides', () => {
    const desired = D.normalizeDefinition(base);
    field(desired, 'examination_findings', 'murmur').required = true;
    section(desired, 'injections').enabled = false;
    section(desired, 'examination_findings').fields.push(D.normalizeField({ key: 'carotid_bruit', label: 'Carotid bruit', type: 'boolean', order: 99, origin: 'clinic' }));
    const rows = D.diffDefinitions(base, desired, 'clinic');
    expect(rows).toHaveLength(3);
    const applied = D.applyOverrides(base, rows, 'clinic').definition;
    expect(D.hashDefinition(applied)).toBe(D.hashDefinition(desired));
  });

  test('removing an inherited field at a lower level disables it (never deletes it)', () => {
    const desired = D.normalizeDefinition(base);
    const ex = section(desired, 'examination_findings');
    ex.fields = ex.fields.filter(f => f.key !== 'pedal_oedema');
    const rows = D.diffDefinitions(base, desired, 'clinic');
    expect(rows).toEqual([{ section_key: 'examination_findings', field_key: 'pedal_oedema', kind: 'modify', props: { enabled: false } }]);
  });

  test('hash is stable regardless of key order and ignores database ids', () => {
    const a = spec('neurology');
    const b = JSON.parse(JSON.stringify(a));
    b.sections[0] = Object.fromEntries(Object.entries(b.sections[0]).reverse());
    b.sections[0].id = 123;
    expect(D.hashDefinition(a)).toBe(D.hashDefinition(b));
  });
});

describe('consultation validation', () => {
  const def = D.applyOverrides(spec('cardiology'), [
    { section_key: 'examination_findings', field_key: 'murmur', kind: 'modify', props: { required: true } },
    { section_key: 'diagnosis', field_key: '', kind: 'modify', props: { required: true, locked: true } },
    { section_key: 'medications', field_key: 'frequency', kind: 'modify', props: { required: true } },
  ], 'clinic').definition;

  test('reports required sections and fields, marking locked ones', () => {
    const { errors } = V.validateConsultation(def, {});
    const keys = errors.map(e => `${e.section_key}.${e.field_key}`).sort();
    expect(keys).toEqual(['diagnosis.', 'examination_findings.murmur']);
    expect(errors.find(e => e.section_key === 'diagnosis').locked).toBe(true);
  });

  test('accepts a complete consultation', () => {
    const { errors } = V.validateConsultation(def, {
      diagnosis: [{ display: 'Hypertension' }],
      template_values: { examination_findings: { murmur: 'absent' } },
    });
    expect(errors).toEqual([]);
  });

  test('conditional visibility: a hidden field is not validated', () => {
    const d = D.applyOverrides(spec('cardiology'), [
      { section_key: 'examination_findings', field_key: 'murmur_details', kind: 'modify', props: { required: true } },
    ], 'clinic').definition;
    const base = { template_values: { examination_findings: { murmur: 'absent' } } };
    expect(V.validateConsultation(d, base).errors).toEqual([]);
    const shown = { template_values: { examination_findings: { murmur: 'present' } } };
    expect(V.validateConsultation(d, shown).errors.map(e => e.field_key)).toEqual(['murmur_details']);
  });

  test('type, option and limit checks', () => {
    const { errors } = V.validateConsultation(spec('cardiology'), {
      template_values: {
        examination_findings: { heart_sounds: 'not-an-option', pedal_oedema: '+' },
        lab_results: { echo_ef: 120 },
        medical_history: { cardiac_risk_factors: ['smoking', 'unknown'] },
      },
    });
    expect(errors.map(e => `${e.field_key}:${e.code}`).sort()).toEqual([
      'cardiac_risk_factors:invalid', 'echo_ef:invalid', 'heart_sounds:invalid',
    ]);
  });

  test('required row columns apply to every started medicine row', () => {
    const { errors } = V.validateConsultation(def, {
      diagnosis: [{ display: 'x' }], template_values: { examination_findings: { murmur: 'absent' } },
      medications: [{ name: 'Amlodipine', frequency: '1-0-0' }, { name: 'Atorvastatin' }, {}],
    });
    expect(errors.map(e => e.message)).toEqual(['Frequency is required (row 2)']);
  });

  test('reference ranges warn but never block', () => {
    const r = V.validateConsultation(spec('general'), { vitals: { bp_systolic: '165' } });
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toMatchObject({ field_key: 'bp_systolic', code: 'above_range' });
  });

  test('age- and sex-specific reference ranges pick the most specific match', () => {
    const f = { validation: { ref_ranges: [{ low: 13, high: 17 }, { sex: 'F', low: 12, high: 15.5 }, { age_max: 12, low: 11, high: 14.5 }] } };
    expect(V.pickRange(f, { sex: 'F', age: 30 })).toEqual({ sex: 'F', low: 12, high: 15.5 });
    expect(V.pickRange(f, { sex: 'M', age: 8 })).toEqual({ age_max: 12, low: 11, high: 14.5 });
    expect(V.pickRange(f, {})).toEqual({ low: 13, high: 17 });
  });

  test('sanitizeValues keeps only enabled custom fields', () => {
    const out = V.sanitizeValues(spec('cardiology'), {
      examination_findings: { murmur: 'absent', not_a_field: 'x', heart_sounds: '' },
      vitals: { bp_systolic: '120' },              // core field — stored in the encounter, not here
      unknown_section: { a: 1 },
    });
    expect(out).toEqual({ examination_findings: { murmur: 'absent' } });
  });

  test('definition validation catches broken templates', () => {
    const bad = D.normalizeDefinition(spec('general'));
    section(bad, 'notes').fields.push(
      D.normalizeField({ key: 'Bad Key', label: 'x', type: 'text' }),
      D.normalizeField({ key: 'pick', label: 'Pick', type: 'dropdown', options: [] }),
      D.normalizeField({ key: 'n', label: 'N', type: 'number', min: 10, max: 1 }),
      D.normalizeField({ key: 'v', label: 'V', type: 'text', visibility: { field: 'missing', op: 'eq', value: 1 } }),
    );
    const msgs = V.validateDefinition(bad).map(e => e.message);
    expect(msgs).toEqual(expect.arrayContaining([
      expect.stringMatching(/Field key/), 'Add at least one option', 'Minimum is greater than maximum',
      'Visibility condition must refer to another field in this section',
    ]));
  });
});
