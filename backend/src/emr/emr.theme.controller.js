const { pool } = require('../config/database');

const getTheme = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT theme_color FROM emr_clinics WHERE id=$1`,
    [req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Clinic not found' });
  res.json({ theme_color: rows[0].theme_color || '#2563eb' });
};

const updateTheme = async (req, res) => {
  const { theme_color } = req.body;
  if (!theme_color || !/^#[0-9a-fA-F]{6}$/.test(theme_color))
    return res.status(400).json({ error: 'theme_color must be a valid hex color e.g. #2563eb' });

  const { rows } = await pool.query(
    `UPDATE emr_clinics SET theme_color=$1 WHERE id=$2 RETURNING theme_color`,
    [theme_color, req.emrUser.clinic_id]
  );
  res.json({ theme_color: rows[0].theme_color });
};

module.exports = { getTheme, updateTheme };
