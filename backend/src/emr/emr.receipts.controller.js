const { pool } = require('../config/database');

const ensureTable = () => pool.query(`
  CREATE TABLE IF NOT EXISTS emr_receipts (
    id                  SERIAL PRIMARY KEY,
    clinic_id           INTEGER NOT NULL,
    appointment_id      INTEGER NOT NULL,
    patient_name        VARCHAR(200),
    uhid                VARCHAR(100),
    phone               VARCHAR(20),
    payment_status      VARCHAR(50) NOT NULL DEFAULT 'unbilled',
    items               JSONB NOT NULL DEFAULT '[]',
    additional_discount NUMERIC(10,2) NOT NULL DEFAULT 0,
    paymode             VARCHAR(50) NOT NULL DEFAULT 'Cash',
    payment_id          VARCHAR(200),
    amount_paid         NUMERIC(10,2) NOT NULL DEFAULT 0,
    remarks             TEXT,
    total_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_discount      NUMERIC(10,2) NOT NULL DEFAULT 0,
    grand_total         NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
  )
`);

// GET /api/emr/receipts?appointment_id=
const listReceipts = async (req, res) => {
  await ensureTable();
  const { appointment_id, phone } = req.query;
  let sql = `SELECT * FROM emr_receipts WHERE clinic_id=$1`;
  const params = [req.emrUser.clinic_id];
  if (appointment_id) { sql += ` AND appointment_id=$${params.length+1}`; params.push(appointment_id); }
  if (phone)          { sql += ` AND phone=$${params.length+1}`;          params.push(phone); }
  sql += ` ORDER BY created_at DESC`;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
};

// POST /api/emr/receipts
const createReceipt = async (req, res) => {
  await ensureTable();
  const {
    appointment_id, patient_name, uhid, phone,
    payment_status, items, additional_discount,
    paymode, payment_id, amount_paid, remarks,
  } = req.body;

  if (!appointment_id) return res.status(400).json({ error: 'appointment_id required' });

  const parsedItems = items || [];
  const totalAmount   = parsedItems.reduce((s, i) => s + (parseFloat(i.amount) || 0) * (parseInt(i.qty) || 1), 0);
  const lineDiscount  = parsedItems.reduce((s, i) => s + (parseFloat(i.discount) || 0), 0);
  const addlDiscount  = parseFloat(additional_discount) || 0;
  const totalDiscount = lineDiscount + addlDiscount;
  const grandTotal    = Math.max(0, totalAmount - totalDiscount);

  const { rows } = await pool.query(
    `INSERT INTO emr_receipts
       (clinic_id, appointment_id, patient_name, uhid, phone,
        payment_status, items, additional_discount, paymode, payment_id,
        amount_paid, remarks, total_amount, total_discount, grand_total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [
      req.emrUser.clinic_id, appointment_id,
      patient_name || null, uhid || null, phone || null,
      payment_status || 'unbilled',
      JSON.stringify(parsedItems),
      addlDiscount,
      paymode || 'Cash',
      payment_id || null,
      parseFloat(amount_paid) || 0,
      remarks || null,
      totalAmount, totalDiscount, grandTotal,
    ]
  );
  res.status(201).json(rows[0]);
};

// GET /api/emr/receipts/:id
const getReceipt = async (req, res) => {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT * FROM emr_receipts WHERE id=$1 AND clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Receipt not found' });
  res.json(rows[0]);
};

// PATCH /api/emr/receipts/:id
const updateReceipt = async (req, res) => {
  const {
    payment_status, items, additional_discount,
    paymode, payment_id, amount_paid, remarks,
  } = req.body;

  const setClauses = ['updated_at=NOW()'];
  const params = [];
  let idx = 1;

  if (payment_status    !== undefined) { setClauses.push(`payment_status=$${idx++}`);    params.push(payment_status); }
  if (paymode           !== undefined) { setClauses.push(`paymode=$${idx++}`);           params.push(paymode); }
  if (payment_id        !== undefined) { setClauses.push(`payment_id=$${idx++}`);        params.push(payment_id); }
  if (amount_paid       !== undefined) { setClauses.push(`amount_paid=$${idx++}`);       params.push(parseFloat(amount_paid) || 0); }
  if (remarks           !== undefined) { setClauses.push(`remarks=$${idx++}`);           params.push(remarks); }
  if (additional_discount !== undefined || items !== undefined) {
    const parsedItems  = items || [];
    const addlDiscount = parseFloat(additional_discount) || 0;
    const totalAmount  = parsedItems.reduce((s, i) => s + (parseFloat(i.amount) || 0) * (parseInt(i.qty) || 1), 0);
    const lineDiscount = parsedItems.reduce((s, i) => s + (parseFloat(i.discount) || 0), 0);
    const totalDiscount = lineDiscount + addlDiscount;
    const grandTotal   = Math.max(0, totalAmount - totalDiscount);
    setClauses.push(`items=$${idx++}`, `additional_discount=$${idx++}`, `total_amount=$${idx++}`, `total_discount=$${idx++}`, `grand_total=$${idx++}`);
    params.push(JSON.stringify(parsedItems), addlDiscount, totalAmount, totalDiscount, grandTotal);
  }

  params.push(req.params.id, req.emrUser.clinic_id);
  const { rows } = await pool.query(
    `UPDATE emr_receipts SET ${setClauses.join(', ')} WHERE id=$${idx++} AND clinic_id=$${idx++} RETURNING *`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'Receipt not found' });
  res.json(rows[0]);
};

module.exports = { listReceipts, createReceipt, getReceipt, updateReceipt };
