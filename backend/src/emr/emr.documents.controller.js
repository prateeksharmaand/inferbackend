const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const { pool } = require('../config/database');

const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS emr_documents (
      id             SERIAL PRIMARY KEY,
      clinic_id      INTEGER NOT NULL,
      appointment_id INTEGER NOT NULL,
      original_name  TEXT NOT NULL,
      file_name      TEXT NOT NULL,
      file_path      TEXT NOT NULL,
      mime_type      TEXT,
      file_size      INTEGER,
      tags           TEXT[]  DEFAULT '{}',
      notes          TEXT    DEFAULT '',
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Migrate existing tables that may lack new columns
  await pool.query(`ALTER TABLE emr_documents ADD COLUMN IF NOT EXISTS tags  TEXT[]  DEFAULT '{}'`);
  await pool.query(`ALTER TABLE emr_documents ADD COLUMN IF NOT EXISTS notes TEXT    DEFAULT ''`);
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'uploads', 'emr-docs',
      String(req.emrUser.clinic_id), String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

// GET /api/emr/appointments/:id/documents?q=&tag=
const listDocuments = async (req, res) => {
  await ensureTable();
  const { q, tag } = req.query;
  let sql = `SELECT * FROM emr_documents WHERE clinic_id=$1 AND appointment_id=$2`;
  const params = [req.emrUser.clinic_id, req.params.id];
  let idx = 3;
  if (q)   { sql += ` AND original_name ILIKE $${idx++}`;  params.push(`%${q}%`); }
  if (tag) { sql += ` AND $${idx++} = ANY(tags)`;          params.push(tag); }
  sql += ` ORDER BY created_at DESC`;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
};

// GET /api/emr/appointments/:id/patient-documents
// Returns all documents for the same patient (by mobile) excluding the current appointment
const listPatientDocuments = async (req, res) => {
  await ensureTable();
  const { rows: appts } = await pool.query(
    `SELECT patient_mobile FROM emr_appointments WHERE id=$1 AND clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]
  );
  if (!appts.length || !appts[0].patient_mobile) return res.json([]);
  const mobile = appts[0].patient_mobile;
  const { rows } = await pool.query(
    `SELECT d.*, a.appointment_date, a.patient_name
     FROM emr_documents d
     JOIN emr_appointments a ON a.id = d.appointment_id
     WHERE d.clinic_id=$1 AND a.patient_mobile=$2 AND d.appointment_id != $3
     ORDER BY d.created_at DESC`,
    [req.emrUser.clinic_id, mobile, req.params.id]
  );
  res.json(rows);
};

// POST /api/emr/appointments/:id/documents
const uploadDocument = [
  upload.single('file'),
  async (req, res) => {
    await ensureTable();
    if (!req.file) return res.status(400).json({ error: 'No file or unsupported type (PDF, JPG, PNG, DOCX only)' });
    let tags = [];
    try { tags = JSON.parse(req.body.tags || '[]'); } catch { tags = []; }
    const relPath = `emr-docs/${req.emrUser.clinic_id}/${req.params.id}/${req.file.filename}`;
    const { rows } = await pool.query(
      `INSERT INTO emr_documents (clinic_id, appointment_id, original_name, file_name, file_path, mime_type, file_size, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.emrUser.clinic_id, req.params.id, req.file.originalname,
       req.file.filename, relPath, req.file.mimetype, req.file.size, tags]
    );
    res.json(rows[0]);
  },
];

// PATCH /api/emr/appointments/:id/documents/:docId  { tags?, notes? }
const patchDocument = async (req, res) => {
  await ensureTable();
  const { tags, notes } = req.body;
  const setClauses = [];
  const params     = [];
  let idx = 1;
  if (tags  !== undefined) { setClauses.push(`tags=$${idx++}`);  params.push(tags); }
  if (notes !== undefined) { setClauses.push(`notes=$${idx++}`); params.push(notes); }
  if (!setClauses.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.docId, req.emrUser.clinic_id);
  const { rows } = await pool.query(
    `UPDATE emr_documents SET ${setClauses.join(', ')} WHERE id=$${idx++} AND clinic_id=$${idx++} RETURNING *`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
};

// DELETE /api/emr/appointments/:id/documents/:docId
const deleteDocument = async (req, res) => {
  await ensureTable();
  const { rows } = await pool.query(
    `DELETE FROM emr_documents WHERE id=$1 AND clinic_id=$2 RETURNING *`,
    [req.params.docId, req.emrUser.clinic_id]
  );
  if (rows.length) {
    const abs = path.join(__dirname, '..', '..', 'uploads', rows[0].file_path);
    fs.unlink(abs, () => {});
  }
  res.json({ ok: true });
};

module.exports = { listDocuments, listPatientDocuments, uploadDocument, patchDocument, deleteDocument };
