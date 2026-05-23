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

module.exports = { listTemplates, createTemplate, updateTemplate, deleteTemplate };
