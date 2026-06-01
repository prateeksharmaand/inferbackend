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
// exported so routes can call it explicitly after mount

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

// ── AI Meal Plan Generator ────────────────────────────────────────────────────

const axios = require('axios');

const GEMINI_AI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE  = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_AI_MODEL}:generateContent`;

const generateAIMealPlan = async (req, res) => {
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const {
    preference = 'vegetarian',
    conditions = [],
    age, gender, weight, height,
    calories_target,
  } = req.body;

  const patientInfo = [
    age    ? `Age: ${age}`         : null,
    gender ? `Gender: ${gender}`   : null,
    weight ? `Weight: ${weight}kg` : null,
    height ? `Height: ${height}cm` : null,
  ].filter(Boolean).join(', ');

  const conditionStr = conditions.length
    ? conditions.join(', ')
    : 'general wellness';

  const calorieNote = calories_target ? `~${calories_target} kcal/day` : 'appropriate calories';
  const dietRule    = (preference === 'vegetarian' || preference === 'vegan')
    ? 'strictly vegetarian, no meat/fish/eggs'
    : preference === 'eggetarian' ? 'vegetarian + eggs allowed, no meat/fish'
    : 'non-vegetarian, include chicken/fish/eggs, no beef/pork';

  const prompt = `You are a clinical dietitian. Create 1 Indian one-day meal plan.
Patient: ${patientInfo || 'adult'} | Conditions: ${conditionStr} | Diet: ${dietRule} | Target: ${calorieNote}
Include 5 meals: Breakfast, Mid-Morning, Lunch, Evening Snack, Dinner. Max 4 food items per meal.
Return ONLY valid JSON (no markdown):
{"plan_name":"...","description":"...","theme":"...","nutrition_targets":{"energy":0,"protein":0,"total_fat":0,"carbohydrates":0,"dietary_fibre":0},"day_plans":[{"name":"Day Plan 1","meals":[{"name":"Breakfast","time":"8:00 AM","instructions":null,"food_items":[{"name":"...","serving_size":"...","group_name":"...","nutrition":{"energy":0,"protein":0,"total_fat":0,"carbohydrates":0,"dietary_fibre":0}}]}]}]}`;

  try {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 4096,
      },
    };
    const geminiRes = await axios.post(`${GEMINI_BASE}?key=${GEMINI_KEY}`, body, { timeout: 45_000 });
    const raw = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    let plans;
    try {
      const parsed = JSON.parse(raw);
      plans = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Strip markdown fences if present
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      try {
        const parsed = JSON.parse(cleaned);
        plans = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // Extract first JSON object from text
        const match = cleaned.match(/\{[\s\S]*"day_plans"[\s\S]*\}/);
        if (match) {
          try { plans = [JSON.parse(match[0])]; } catch { plans = []; }
        } else { plans = []; }
      }
    }

    if (!plans.length || !plans[0]?.day_plans) {
      console.error('[diet] AI returned unparseable response:', raw.slice(0, 300));
      return res.status(502).json({ error: 'AI returned no valid plan. Please try again.' });
    }

    // Stamp each food item with a _key for frontend rendering
    plans = plans.map(plan => ({
      ...plan,
      day_plans: (plan.day_plans || []).map(dp => ({
        ...dp,
        id: Math.random().toString(36).slice(2),
        meals: (dp.meals || []).map(meal => ({
          ...meal,
          id: Math.random().toString(36).slice(2),
          food_items: (meal.food_items || []).map(fi => ({
            ...fi,
            _key: Math.random().toString(36).slice(2),
          })),
        })),
      })),
    }));

    res.json({ plans });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data || err.message;
    console.error('[diet] AI meal plan failed — status:', status, '| detail:', JSON.stringify(detail));
    res.status(502).json({ error: 'AI meal plan generation failed', detail, status });
  }
};

module.exports = {
  ensureTables,
  listCharts, createChart, updateChart, deleteChart,
  listTemplates, saveTemplate,
  listFoodItems, createFoodItem, updateFoodItem, deleteFoodItem,
  listFoodGroups, createFoodGroup, deleteFoodGroup,
  generateAIMealPlan,
};
