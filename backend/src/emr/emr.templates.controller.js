const { pool } = require('../config/database');
const { getPredefinedTemplates } = require('../services/scribe.templates');

// GET /api/emr/scribe/templates
// Returns predefined templates + this clinic's custom templates
const listTemplates = async (req, res) => {
  let custom = [];
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, focus_prompt, specialty, false AS is_predefined, created_at
       FROM scribe_templates WHERE clinic_id=$1 ORDER BY name`,
      [req.emrUser.clinic_id]
    );
    custom = rows;
  } catch (err) {
    // Table may not exist yet (migration pending) — still return predefined templates
    console.warn('[templates] DB query failed (migration pending?):', err.message);
  }
  res.json({
    predefined: getPredefinedTemplates(),
    custom,
  });
};

// POST /api/emr/scribe/templates
const createTemplate = async (req, res) => {
  const { name, description, focus_prompt, specialty } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const { rows } = await pool.query(
    `INSERT INTO scribe_templates (clinic_id, name, description, focus_prompt, specialty)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.emrUser.clinic_id, name.trim(), description?.trim() || '', focus_prompt?.trim() || '', specialty?.trim() || null]
  );
  res.status(201).json({ ...rows[0], is_predefined: false });
};

// PUT /api/emr/scribe/templates/:id
const updateTemplate = async (req, res) => {
  const { name, description, focus_prompt, specialty } = req.body;
  const { rows } = await pool.query(
    `UPDATE scribe_templates
     SET name=$1, description=$2, focus_prompt=$3, specialty=$4, updated_at=NOW()
     WHERE id=$5 AND clinic_id=$6 RETURNING *`,
    [
      name?.trim() || null,
      description?.trim() ?? null,
      focus_prompt?.trim() ?? null,
      specialty?.trim() ?? null,
      req.params.id,
      req.emrUser.clinic_id,
    ]
  );
  if (!rows.length) return res.status(404).json({ error: 'Template not found' });
  res.json({ ...rows[0], is_predefined: false });
};

// DELETE /api/emr/scribe/templates/:id
const deleteTemplate = async (req, res) => {
  await pool.query(
    `DELETE FROM scribe_templates WHERE id=$1 AND clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]
  );
  res.json({ message: 'Deleted' });
};

// GET /api/emr/scribe/active-template — returns doctor's currently active template
// GET /api/emr/scribe/active-template — per-doctor, saved in emr_clinic_staff
const getActiveTemplate = async (req, res) => {
  if (req.emrUser.role !== 'doctor') return res.json({ template: null });
  const { rows: [staff] } = await pool.query(
    `SELECT active_template_id, active_template_slug FROM emr_clinic_staff WHERE id=$1`,
    [req.emrUser.id]
  );
  if (!staff) return res.json({ template: null });

  if (staff.active_template_slug) {
    const preds = getPredefinedTemplates();
    const tpl   = preds.find(t => t.id === staff.active_template_slug);
    return res.json({ template: tpl || null });
  }
  if (staff.active_template_id) {
    const { rows: [tpl] } = await pool.query(
      `SELECT id, name, description, specialty, focus_prompt, false AS is_predefined, updated_at
       FROM scribe_templates WHERE id=$1`,
      [staff.active_template_id]
    );
    return res.json({ template: tpl || null });
  }
  return res.json({ template: null });
};

// PATCH /api/emr/scribe/active-template  { template_id, is_predefined }
// Saved per individual doctor in emr_clinic_staff — each doctor has their own
const setActiveTemplate = async (req, res) => {
  if (req.emrUser.role !== 'doctor') return res.status(403).json({ error: 'Only doctors can set their active template' });
  const { template_id, is_predefined } = req.body;

  if (!template_id) {
    await pool.query(
      `UPDATE emr_clinic_staff SET active_template_id=NULL, active_template_slug=NULL WHERE id=$1`,
      [req.emrUser.id]
    );
    return res.json({ ok: true });
  }

  if (is_predefined) {
    await pool.query(
      `UPDATE emr_clinic_staff SET active_template_slug=$1, active_template_id=NULL WHERE id=$2`,
      [String(template_id), req.emrUser.id]
    );
  } else {
    await pool.query(
      `UPDATE emr_clinic_staff SET active_template_id=$1, active_template_slug=NULL WHERE id=$2`,
      [parseInt(template_id), req.emrUser.id]
    );
  }
  res.json({ ok: true });
};

module.exports = { listTemplates, createTemplate, updateTemplate, deleteTemplate, getActiveTemplate, setActiveTemplate };
