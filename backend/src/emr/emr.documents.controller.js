const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const { pool } = require('../config/database');

const ensureTable = () => pool.query(`
  CREATE TABLE IF NOT EXISTS emr_documents (
    id             SERIAL PRIMARY KEY,
    clinic_id      INTEGER NOT NULL,
    appointment_id INTEGER NOT NULL,
    original_name  TEXT NOT NULL,
    file_name      TEXT NOT NULL,
    file_path      TEXT NOT NULL,
    mime_type      TEXT,
    file_size      INTEGER,
    created_at     TIMESTAMPTZ DEFAULT NOW()
  )
`);

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

// GET /api/emr/appointments/:id/documents
const listDocuments = async (req, res) => {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT * FROM emr_documents WHERE clinic_id=$1 AND appointment_id=$2 ORDER BY created_at DESC`,
    [req.emrUser.clinic_id, req.params.id]
  );
  res.json(rows);
};

// POST /api/emr/appointments/:id/documents
const uploadDocument = [
  upload.single('file'),
  async (req, res) => {
    await ensureTable();
    if (!req.file) return res.status(400).json({ error: 'No file or unsupported type (PDF, JPG, PNG, DOCX only)' });
    const relPath = `emr-docs/${req.emrUser.clinic_id}/${req.params.id}/${req.file.filename}`;
    const { rows } = await pool.query(
      `INSERT INTO emr_documents (clinic_id, appointment_id, original_name, file_name, file_path, mime_type, file_size)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.emrUser.clinic_id, req.params.id, req.file.originalname,
       req.file.filename, relPath, req.file.mimetype, req.file.size]
    );
    res.json(rows[0]);
  },
];

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

module.exports = { listDocuments, uploadDocument, deleteDocument };
