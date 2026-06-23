const { pool } = require('../config/database');

const DEFAULT_QUICK_ACTIONS = [
  'visit_type','payment_status','assessment_status','write_rx','notes','print_rx',
  'check_in','follow_up','past_visits','add_vitals','mark_no_show','exit',
];

// GET /api/emr/queues?date=YYYY-MM-DD
const listQueues = async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT q.*, d.name AS doctor_name,
       (SELECT COUNT(*) FROM emr_appointments a
        WHERE a.queue_id = q.id AND a.appointment_date = $2
          AND a.status NOT IN ('completed','cancelled','aborted')) AS today_count
     FROM emr_queues q
     LEFT JOIN emr_clinic_staff d ON d.id = q.doctor_id
     WHERE q.clinic_id = $1 AND q.is_active = TRUE
     ORDER BY q.created_at`,
    [req.emrUser.clinic_id, date]
  );
  res.json(rows);
};

// POST /api/emr/queues  â€” save 6-step wizard in one shot
const createQueue = async (req, res) => {
  const { name, mode, filters, quick_actions, sort_order, doctor_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { rows } = await pool.query(
    `INSERT INTO emr_queues (clinic_id, doctor_id, name, mode, filters, quick_actions, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      req.emrUser.clinic_id,
      doctor_id || null,
      name,
      mode || 'in_clinic',
      JSON.stringify(filters || {}),
      JSON.stringify(quick_actions || DEFAULT_QUICK_ACTIONS),
      sort_order || 'appointment_start',
    ]
  );
  res.status(201).json(rows[0]);
};

// PATCH /api/emr/queues/:id
const updateQueue = async (req, res) => {
  const { name, mode, filters, quick_actions, sort_order, doctor_id, is_active } = req.body;
  const { rows } = await pool.query(
    `UPDATE emr_queues SET
       name          = COALESCE($1, name),
       mode          = COALESCE($2, mode),
       filters       = COALESCE($3, filters),
       quick_actions = COALESCE($4, quick_actions),
       sort_order    = COALESCE($5, sort_order),
       doctor_id     = COALESCE($6, doctor_id),
       is_active     = COALESCE($7, is_active)
     WHERE id=$8 AND clinic_id=$9 RETURNING *`,
    [name, mode,
     filters ? JSON.stringify(filters) : null,
     quick_actions ? JSON.stringify(quick_actions) : null,
     sort_order, doctor_id, is_active,
     req.params.id, req.emrUser.clinic_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Queue not found' });
  res.json(rows[0]);
};

// DELETE /api/emr/queues/:id
const deleteQueue = async (req, res) => {
  await pool.query(`DELETE FROM emr_queues WHERE id=$1 AND clinic_id=$2`,
    [req.params.id, req.emrUser.clinic_id]);
  res.json({ message: 'Deleted' });
};

module.exports = { listQueues, createQueue, updateQueue, deleteQueue };

