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

const GROQ_MODEL    = 'llama-3.3-70b-versatile';
const GROQ_BASE     = 'https://api.groq.com/openai/v1/chat/completions';

const generateAIMealPlan = async (req, res) => {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });

  const {
    preference = 'vegetarian',
    conditions = [],
    age, gender, weight, height,
    calories_target,
    days = 1,
  } = req.body;

  const patientInfo = [
    age    ? `Age: ${age}`         : null,
    gender ? `Gender: ${gender}`   : null,
    weight ? `Weight: ${weight}kg` : null,
    height ? `Height: ${height}cm` : null,
  ].filter(Boolean).join(', ');

  const conditionStr = conditions.length ? conditions.join(', ') : 'general wellness';
  const calorieNote  = calories_target   ? `exactly ${calories_target} kcal/day` : 'appropriate calories';
  const dietRule     = (preference === 'vegetarian' || preference === 'vegan')
    ? 'strictly vegetarian — NO meat, fish, eggs'
    : preference === 'eggetarian' ? 'vegetarian + eggs OK — NO meat or fish'
    : 'non-vegetarian — include chicken/fish/eggs, NO beef/pork';

  const numDays = 1; // keep to 1 day to stay within token budget; doctors can duplicate

  const prompt = `You are a clinical dietitian creating an Indian diet plan.

PATIENT: ${patientInfo || 'adult'} | CONDITIONS: ${conditionStr} | DIET TYPE: ${dietRule} | TARGET: ${calorieNote}

Create a ${numDays}-day Indian meal plan. Each day must have 5 meals: Breakfast, Mid-Morning Snack, Lunch, Evening Snack, Dinner. Use 3-4 food items per meal. Use realistic calorie values.

Respond with ONLY a JSON object. No markdown. No explanation. No code blocks. Just the JSON:

{
  "plan_name": "short descriptive name",
  "description": "one sentence about this plan",
  "theme": "e.g. South Indian or North Indian or High Protein",
  "nutrition_targets": { "energy": ${calories_target || 1800}, "protein": 60, "total_fat": 50, "carbohydrates": 220, "dietary_fibre": 25 },
  "day_plans": [
    {
      "name": "Day 1",
      "meals": [
        { "name": "Breakfast", "time": "8:00 AM", "instructions": null, "food_items": [
          { "name": "Idli", "serving_size": "2 pieces", "group_name": "Cereals & Millets", "nutrition": { "energy": 130, "protein": 4, "total_fat": 0.5, "carbohydrates": 27, "dietary_fibre": 1.5 } }
        ]},
        { "name": "Mid-Morning Snack", "time": "10:30 AM", "instructions": null, "food_items": [] },
        { "name": "Lunch", "time": "1:00 PM", "instructions": null, "food_items": [] },
        { "name": "Evening Snack", "time": "4:30 PM", "instructions": null, "food_items": [] },
        { "name": "Dinner", "time": "8:00 PM", "instructions": null, "food_items": [] }
      ]
    }
  ]
}

Fill ALL meals with appropriate Indian foods for the patient's conditions. Replace the example Breakfast item with real food. Add ${numDays > 1 ? numDays + ' day_plans entries' : '1 day_plan entry'} total.`;

  try {
    const body = {
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 8192,
    };
    const groqRes = await axios.post(GROQ_BASE, body, {
      headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      timeout: 60_000,
    });
    const raw = groqRes.data?.choices?.[0]?.message?.content || '[]';

    console.log('[diet] raw groq response (first 800):', raw.slice(0, 800));

    // Extract JSON regardless of preamble/fences
    function extractJSON(text) {
      // 1. Try content inside ```json ... ``` or ``` ... ``` blocks
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        try { return JSON.parse(fenceMatch[1].trim()); } catch {}
      }
      // 2. Try raw parse
      try { return JSON.parse(text.trim()); } catch {}
      // 3. Extract first { ... } block containing day_plans
      const objStart = text.indexOf('{');
      const objEnd   = text.lastIndexOf('}');
      if (objStart !== -1 && objEnd > objStart) {
        try { return JSON.parse(text.slice(objStart, objEnd + 1)); } catch {}
      }
      return null;
    }

    const parsed = extractJSON(raw);
    let plans = parsed
      ? (Array.isArray(parsed) ? parsed : [parsed])
      : [];

    if (!plans.length || !plans[0]?.day_plans) {
      console.error('[diet] FULL raw response:', raw);
      return res.status(502).json({
        error: 'AI returned no valid plan. Please try again.',
        detail: raw.slice(0, 400),
      });
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
    console.error('[diet] Groq meal plan failed — status:', status, '| detail:', JSON.stringify(detail));
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
