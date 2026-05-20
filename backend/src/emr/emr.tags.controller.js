const { pool } = require('../config/database');

const listTags = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM emr_tags WHERE clinic_id=$1 ORDER BY display_name`,
    [req.emrUser.clinic_id]
  );
  res.json(rows);
};

const createTag = async (req, res) => {
  const { code, display_name, color } = req.body;
  if (!code || !display_name) return res.status(400).json({ error: 'code and display_name required' });
  const { rows } = await pool.query(
    `INSERT INTO emr_tags (clinic_id, code, display_name, color)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.emrUser.clinic_id, code.trim(), display_name.trim(), color || '#7c3aed']
  );
  res.status(201).json(rows[0]);
};

const updateTag = async (req, res) => {
  const { code, display_name, color } = req.body;
  const { rows } = await pool.query(
    `UPDATE emr_tags SET
       code         = COALESCE($1, code),
       display_name = COALESCE($2, display_name),
       color        = COALESCE($3, color)
     WHERE id=$4 AND clinic_id=$5 RETURNING *`,
    [code, display_name, color, req.params.id, req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Tag not found' });
  res.json(rows[0]);
};

const deleteTag = async (req, res) => {
  await pool.query(
    `DELETE FROM emr_tags WHERE id=$1 AND clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]
  );
  res.json({ message: 'Deleted' });
};

module.exports = { listTags, createTag, updateTag, deleteTag };
