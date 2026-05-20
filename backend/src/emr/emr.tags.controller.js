const { pool } = require('../config/database');

// attr_type: 1=Tags(multi), 2=Labels(single), 16=Medical Record Document Type(multi)
const VALID_ATTR_TYPES = [1, 2, 16];

const listTags = async (req, res) => {
  const { attr_type } = req.query;
  let sql = `SELECT * FROM emr_tags WHERE clinic_id=$1`;
  const params = [req.emrUser.clinic_id];
  if (attr_type) { sql += ` AND attr_type=$2`; params.push(parseInt(attr_type, 10)); }
  sql += ` ORDER BY attr_type, display_name`;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
};

const createTag = async (req, res) => {
  const { code, display_name, color, attr_type } = req.body;
  if (!code || !display_name) return res.status(400).json({ error: 'code and display_name required' });
  const type = parseInt(attr_type, 10) || 1;
  if (!VALID_ATTR_TYPES.includes(type))
    return res.status(400).json({ error: `attr_type must be one of ${VALID_ATTR_TYPES.join(', ')}` });

  const { rows } = await pool.query(
    `INSERT INTO emr_tags (clinic_id, code, display_name, color, attr_type)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.emrUser.clinic_id, code.trim(), display_name.trim(), color || '#7c3aed', type]
  );
  res.status(201).json(rows[0]);
};

const updateTag = async (req, res) => {
  const { code, display_name, color, attr_type } = req.body;
  const type = attr_type ? parseInt(attr_type, 10) : undefined;
  if (type !== undefined && !VALID_ATTR_TYPES.includes(type))
    return res.status(400).json({ error: `attr_type must be one of ${VALID_ATTR_TYPES.join(', ')}` });

  const { rows } = await pool.query(
    `UPDATE emr_tags SET
       code         = COALESCE($1, code),
       display_name = COALESCE($2, display_name),
       color        = COALESCE($3, color),
       attr_type    = COALESCE($4, attr_type)
     WHERE id=$5 AND clinic_id=$6 RETURNING *`,
    [code ?? null, display_name ?? null, color ?? null, type ?? null, req.params.id, req.emrUser.clinic_id]
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
