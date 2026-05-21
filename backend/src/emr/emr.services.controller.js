const { pool } = require('../config/database');

const ensureTable = () => pool.query(`
  CREATE TABLE IF NOT EXISTS emr_services (
    id         SERIAL PRIMARY KEY,
    clinic_id  INTEGER NOT NULL,
    name       VARCHAR(200) NOT NULL,
    price      NUMERIC(10,2) NOT NULL DEFAULT 0,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);

// GET /api/emr/services?search=&is_active=
const listServices = async (req, res) => {
  await ensureTable();
  const { search, is_active } = req.query;
  let sql = `SELECT * FROM emr_services WHERE clinic_id = $1`;
  const params = [req.emrUser.clinic_id];
  let idx = 2;

  if (search)                  { sql += ` AND name ILIKE $${idx++}`; params.push(`%${search}%`); }
  if (is_active !== undefined) { sql += ` AND is_active = $${idx++}`; params.push(is_active === 'true'); }

  sql += ` ORDER BY name`;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
};

// POST /api/emr/services
const createService = async (req, res) => {
  await ensureTable();
  const { name, price } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const { rows } = await pool.query(
    `INSERT INTO emr_services (clinic_id, name, price) VALUES ($1,$2,$3) RETURNING *`,
    [req.emrUser.clinic_id, name.trim(), parseFloat(price) || 0]
  );
  res.status(201).json(rows[0]);
};

// PATCH /api/emr/services/:id
const updateService = async (req, res) => {
  const { name, price, is_active } = req.body;
  const setClauses = [];
  const params = [];
  let idx = 1;

  if (name      !== undefined) { setClauses.push(`name=$${idx++}`);      params.push(name.trim()); }
  if (price     !== undefined) { setClauses.push(`price=$${idx++}`);     params.push(parseFloat(price) || 0); }
  if (is_active !== undefined) { setClauses.push(`is_active=$${idx++}`); params.push(is_active); }
  setClauses.push(`updated_at=NOW()`);

  params.push(req.params.id, req.emrUser.clinic_id);
  const { rows } = await pool.query(
    `UPDATE emr_services SET ${setClauses.join(', ')}
     WHERE id=$${idx++} AND clinic_id=$${idx++} RETURNING *`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'Service not found' });
  res.json(rows[0]);
};

// DELETE /api/emr/services/:id
const deleteService = async (req, res) => {
  const { rows } = await pool.query(
    `DELETE FROM emr_services WHERE id=$1 AND clinic_id=$2 RETURNING id`,
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Service not found' });
  res.json({ ok: true });
};

module.exports = { listServices, createService, updateService, deleteService };
