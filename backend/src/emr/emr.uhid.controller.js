const { pool } = require('../config/database');

const getSettings = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT uhid_prefix, uhid_next_number FROM emr_clinics WHERE id=$1`,
    [req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Clinic not found' });
  const { uhid_prefix, uhid_next_number } = rows[0];
  res.json({
    prefix:      uhid_prefix || '',
    next_number: uhid_next_number,
    preview:     uhid_prefix ? `${uhid_prefix}${uhid_next_number}` : null,
    configured:  !!uhid_prefix,
  });
};

const updateSettings = async (req, res) => {
  const { prefix, start_number } = req.body;
  if (!prefix || !prefix.trim())
    return res.status(400).json({ error: 'prefix is required' });
  const num = parseInt(start_number, 10);
  if (isNaN(num) || num < 1)
    return res.status(400).json({ error: 'start_number must be a positive integer' });

  const { rows } = await pool.query(
    `UPDATE emr_clinics
     SET uhid_prefix=$1, uhid_next_number=$2
     WHERE id=$3
     RETURNING uhid_prefix AS prefix, uhid_next_number AS next_number`,
    [prefix.trim().toUpperCase(), num, req.emrUser.clinic_id]
  );
  res.json({ ...rows[0], preview: `${rows[0].prefix}${rows[0].next_number}`, configured: true });
};

// Atomically grabs the current number and increments it — safe under concurrency
const generateUhid = async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE emr_clinics
     SET uhid_next_number = uhid_next_number + 1
     WHERE id=$1 AND uhid_prefix IS NOT NULL AND uhid_prefix != ''
     RETURNING uhid_prefix, uhid_next_number - 1 AS assigned_number`,
    [req.emrUser.clinic_id]
  );
  if (!rows.length)
    return res.status(400).json({ error: 'UHID not configured. Go to Settings → UHID to set prefix and starting number.' });
  const { uhid_prefix, assigned_number } = rows[0];
  res.json({ uhid: `${uhid_prefix}${assigned_number}` });
};

module.exports = { getSettings, updateSettings, generateUhid };
