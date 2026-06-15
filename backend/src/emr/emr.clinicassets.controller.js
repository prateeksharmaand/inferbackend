const { pool } = require('../config/database');

// GET /api/emr/settings/clinic-assets
const getAssets = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT rx_header_img, rx_footer_img, rx_signature FROM emr_clinics WHERE id=$1`,
    [req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Clinic not found' });
  res.json(rows[0]);
};

// PATCH /api/emr/settings/clinic-assets
const updateAssets = async (req, res) => {
  const { rx_header_img, rx_footer_img, rx_signature } = req.body;
  const sets = [];
  const vals = [];
  let i = 1;
  if (rx_header_img !== undefined) { sets.push(`rx_header_img=$${i++}`); vals.push(rx_header_img || null); }
  if (rx_footer_img !== undefined) { sets.push(`rx_footer_img=$${i++}`); vals.push(rx_footer_img || null); }
  if (rx_signature  !== undefined) { sets.push(`rx_signature=$${i++}`);  vals.push(rx_signature  || null); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.emrUser.clinic_id);
  const { rows } = await pool.query(
    `UPDATE emr_clinics SET ${sets.join(',')} WHERE id=$${i} RETURNING rx_header_img, rx_footer_img, rx_signature`,
    vals
  );
  res.json(rows[0]);
};

module.exports = { getAssets, updateAssets };
