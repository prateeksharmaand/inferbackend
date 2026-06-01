const { pool } = require('../config/database');

// ── ensure tables exist ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS diet_charts (
      id           SERIAL PRIMARY KEY,
      clinic_id    TEXT NOT NULL,
      patient_mobile TEXT,
      doctor_id    TEXT,
      title        TEXT,
      start_date   DATE,
      duration     TEXT,
      end_date     DATE,
      nutrition_targets JSONB DEFAULT '{}',
      day_plans    JSONB DEFAULT '[]',
      food_groups  JSONB DEFAULT '[]',
      is_template  BOOLEAN DEFAULT FALSE,
      template_name TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS diet_food_items (
      id           SERIAL PRIMARY KEY,
      clinic_id    TEXT NOT NULL,
      group_name   TEXT,
      name         TEXT NOT NULL,
      serving_size TEXT,
      nutrition    JSONB DEFAULT '{}',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS diet_food_groups (
      id           SERIAL PRIMARY KEY,
      clinic_id    TEXT NOT NULL,
      name         TEXT NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
ensureTables().catch(console.error);

// ── Diet Charts ───────────────────────────────────────────────────────────────

const listCharts = async (req, res) => {
  const { patient_mobile } = req.query;
  const { clinic_id } = req.emrUser;
  try {
    const q = patient_mobile
      ? `SELECT * FROM diet_charts WHERE clinic_id=$1 AND patient_mobile=$2 AND is_template=FALSE ORDER BY created_at DESC`
      : `SELECT * FROM diet_charts WHERE clinic_id=$1 AND is_template=FALSE ORDER BY created_at DESC`;
    const params = patient_mobile ? [clinic_id, patient_mobile] : [clinic_id];
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const createChart = async (req, res) => {
  const { clinic_id } = req.emrUser;
  const { patient_mobile, doctor_id, title, start_date, duration, end_date,
          nutrition_targets, day_plans, food_groups } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO diet_charts (clinic_id, patient_mobile, doctor_id, title, start_date, duration, end_date, nutrition_targets, day_plans, food_groups)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [clinic_id, patient_mobile, doctor_id, title, start_date || null, duration || null,
       end_date || null, JSON.stringify(nutrition_targets || {}),
       JSON.stringify(day_plans || []), JSON.stringify(food_groups || [])]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const updateChart = async (req, res) => {
  const { clinic_id } = req.emrUser;
  const { id } = req.params;
  const { title, start_date, duration, end_date, nutrition_targets, day_plans, food_groups } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE diet_charts SET title=$1, start_date=$2, duration=$3, end_date=$4,
       nutrition_targets=$5, day_plans=$6, food_groups=$7, updated_at=NOW()
       WHERE id=$8 AND clinic_id=$9 RETURNING *`,
      [title, start_date || null, duration || null, end_date || null,
       JSON.stringify(nutrition_targets || {}), JSON.stringify(day_plans || []),
       JSON.stringify(food_groups || []), id, clinic_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const deleteChart = async (req, res) => {
  const { clinic_id } = req.emrUser;
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM diet_charts WHERE id=$1 AND clinic_id=$2`, [id, clinic_id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── Templates ─────────────────────────────────────────────────────────────────

const listTemplates = async (req, res) => {
  const { clinic_id } = req.emrUser;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM diet_charts WHERE clinic_id=$1 AND is_template=TRUE ORDER BY created_at DESC`,
      [clinic_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const saveTemplate = async (req, res) => {
  const { clinic_id } = req.emrUser;
  const { template_name, day_plans, nutrition_targets, food_groups } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO diet_charts (clinic_id, title, template_name, is_template, nutrition_targets, day_plans, food_groups)
       VALUES ($1,$2,$2,TRUE,$3,$4,$5) RETURNING *`,
      [clinic_id, template_name, JSON.stringify(nutrition_targets || {}),
       JSON.stringify(day_plans || []), JSON.stringify(food_groups || [])]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── Custom Food Items ─────────────────────────────────────────────────────────

const listFoodItems = async (req, res) => {
  const { clinic_id } = req.emrUser;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM diet_food_items WHERE clinic_id=$1 ORDER BY group_name, name`,
      [clinic_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const createFoodItem = async (req, res) => {
  const { clinic_id } = req.emrUser;
  const { group_name, name, serving_size, nutrition } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO diet_food_items (clinic_id, group_name, name, serving_size, nutrition)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [clinic_id, group_name, name, serving_size, JSON.stringify(nutrition || {})]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const updateFoodItem = async (req, res) => {
  const { clinic_id } = req.emrUser;
  const { id } = req.params;
  const { group_name, name, serving_size, nutrition } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE diet_food_items SET group_name=$1, name=$2, serving_size=$3, nutrition=$4
       WHERE id=$5 AND clinic_id=$6 RETURNING *`,
      [group_name, name, serving_size, JSON.stringify(nutrition || {}), id, clinic_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const deleteFoodItem = async (req, res) => {
  const { clinic_id } = req.emrUser;
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM diet_food_items WHERE id=$1 AND clinic_id=$2`, [id, clinic_id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── Custom Food Groups ────────────────────────────────────────────────────────

const listFoodGroups = async (req, res) => {
  const { clinic_id } = req.emrUser;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM diet_food_groups WHERE clinic_id=$1 ORDER BY name`,
      [clinic_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const createFoodGroup = async (req, res) => {
  const { clinic_id } = req.emrUser;
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO diet_food_groups (clinic_id, name) VALUES ($1,$2) RETURNING *`,
      [clinic_id, name.trim()]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const deleteFoodGroup = async (req, res) => {
  const { clinic_id } = req.emrUser;
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM diet_food_groups WHERE id=$1 AND clinic_id=$2`, [id, clinic_id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = {
  listCharts, createChart, updateChart, deleteChart,
  listTemplates, saveTemplate,
  listFoodItems, createFoodItem, updateFoodItem, deleteFoodItem,
  listFoodGroups, createFoodGroup, deleteFoodGroup,
};
