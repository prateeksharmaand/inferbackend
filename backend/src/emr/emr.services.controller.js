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

// GET /api/emr/services/bulk-template  — download sample Excel
const bulkTemplate = (req, res) => {
  const XLSX = require('xlsx');
  const data = [
    ['Service Name',        'Price', 'Status'],
    ['Consultation',        500,     'Active'],
    ['ECG',                 300,     'Active'],
    ['2D Echocardiography', 2500,    'Active'],
    ['X-Ray Chest',         800,     'Inactive'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Services');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="services_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

// POST /api/emr/services/bulk-upload  multipart: file
const bulkUpload = async (req, res) => {
  const XLSX = require('xlsx');
  await ensureTable();

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let rows;
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  } catch {
    return res.status(400).json({ error: 'Could not parse Excel file. Ensure it is a valid .xlsx or .xls file.' });
  }

  if (rows.length < 2) return res.status(400).json({ error: 'File is empty or has only headers.' });

  // Find header row (first row)
  const header = rows[0].map(h => String(h || '').trim().toLowerCase());
  const nameIdx   = header.findIndex(h => h.includes('service') || h === 'name');
  const priceIdx  = header.findIndex(h => h.includes('price'));
  const statusIdx = header.findIndex(h => h.includes('status'));

  if (nameIdx === -1 || priceIdx === -1)
    return res.status(400).json({ error: 'Could not find required columns. Use the template: Service Name, Price, Status.' });

  // Fetch existing service names for duplicate check
  const { rows: existing } = await pool.query(
    `SELECT LOWER(name) AS name FROM emr_services WHERE clinic_id = $1`, [req.emrUser.clinic_id]
  );
  const existingNames = new Set(existing.map(r => r.name));

  const errors   = [];
  const valid    = [];
  const preview  = [];

  for (let i = 1; i < rows.length; i++) {
    const row    = rows[i];
    const rowNum = i + 1;
    const name   = String(row[nameIdx]  || '').trim();
    const price  = String(row[priceIdx] || '').trim();
    const status = statusIdx !== -1 ? String(row[statusIdx] || 'Active').trim() : 'Active';

    const rowErrors = [];
    if (!name) rowErrors.push('Service Name is required');
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0)
      rowErrors.push('Price must be a valid number ≥ 0');
    if (status && !['active', 'inactive'].includes(status.toLowerCase()))
      rowErrors.push('Status must be Active or Inactive');
    if (name && existingNames.has(name.toLowerCase()))
      rowErrors.push(`Service "${name}" already exists`);

    // Skip completely blank rows silently
    if (!name && !price) continue;

    if (rowErrors.length) {
      errors.push({ row: rowNum, message: rowErrors.join('; ') });
      preview.push({ row: rowNum, name, price, status, ok: false, error: rowErrors.join('; ') });
    } else {
      valid.push({ name, price: parseFloat(price), is_active: status.toLowerCase() !== 'inactive' });
      preview.push({ row: rowNum, name, price: parseFloat(price), status, ok: true });
    }
  }

  // If caller only wants preview (dry-run), return without inserting
  if (req.query.preview === '1') {
    return res.json({ preview, errorCount: errors.length, validCount: valid.length });
  }

  // Bulk insert valid rows
  let imported = 0;
  if (valid.length) {
    const values = valid.map((_, idx) =>
      `($1, $${idx * 3 + 2}, $${idx * 3 + 3}, $${idx * 3 + 4})`
    ).join(', ');
    const params = [req.emrUser.clinic_id];
    valid.forEach(v => params.push(v.name, v.price, v.is_active));
    await pool.query(
      `INSERT INTO emr_services (clinic_id, name, price, is_active) VALUES ${values}
       ON CONFLICT DO NOTHING`,
      params
    );
    imported = valid.length;
  }

  res.json({ success: true, imported, failed: errors.length, errors, preview });
};

module.exports = { listServices, createService, updateService, deleteService, bulkTemplate, bulkUpload };
