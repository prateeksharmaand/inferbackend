/**
 * QA Events / Non-Conformity Routes
 */

const router = require('express').Router();
const { query } = require('../../config/database');
const { verifyLabToken } = require('../../middleware/labAuth');

// GET /qa - list QA events for lab with filters
router.get('/qa', verifyLabToken, async (req, res) => {
  try {
    const labId = req.user.lab_id;
    const { status, severity, stage, event_type, start_date, end_date, limit = 100, offset = 0 } = req.query;
    const params = [labId];
    const conditions = ['e.lab_id = $1'];
    let idx = 2;

    if (status)     { conditions.push(`e.resolution_status = $${idx++}`); params.push(status); }
    if (severity)   { conditions.push(`e.severity = $${idx++}`);          params.push(severity); }
    if (stage)      { conditions.push(`e.stage = $${idx++}`);             params.push(stage); }
    if (event_type) { conditions.push(`e.event_type ILIKE $${idx++}`);    params.push(`%${event_type}%`); }
    if (start_date) { conditions.push(`e.created_at >= $${idx++}`);       params.push(start_date); }
    if (end_date)   { conditions.push(`e.created_at <= $${idx++}`);       params.push(end_date); }

    const where = conditions.join(' AND ');

    const [eventsRes, summaryRes] = await Promise.all([
      query(
        `SELECT e.* FROM lab_qa_events e
         WHERE ${where}
         ORDER BY e.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), parseInt(offset)]
      ),
      query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE resolution_status = 'OPEN') AS open,
           COUNT(*) FILTER (WHERE resolution_status = 'RESOLVED') AS resolved,
           COUNT(*) FILTER (WHERE resolution_status = 'ESCALATED') AS escalated,
           COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical,
           COUNT(*) FILTER (WHERE severity = 'MAJOR') AS major
         FROM lab_qa_events WHERE lab_id = $1`,
        [labId]
      ),
    ]);

    return res.json({ success: true, events: eventsRes.rows, summary: summaryRes.rows[0] });
  } catch (err) {
    if (err.message.includes('does not exist')) return res.json({ success: true, events: [], summary: { total: 0, open: 0, resolved: 0, escalated: 0, critical: 0, major: 0 } });
    return res.status(500).json({ error: err.message });
  }
});

// POST /qa - create QA event
router.post('/qa', verifyLabToken, async (req, res) => {
  try {
    const labId = req.user.lab_id;
    const reportedBy = req.user.email || req.user.name || req.user.id || 'Lab Staff';
    const {
      order_id, order_number, accession_number, patient_name, patient_uhid,
      event_type, stage, severity, event_datetime, description,
      action_taken, root_cause, corrective_action, resolution_status,
      recollection_requested, doctor_notified, tat_impacted,
    } = req.body;

    if (!event_type) return res.status(400).json({ error: 'event_type is required' });

    const r = await query(
      `INSERT INTO lab_qa_events
         (lab_id, order_id, order_number, accession_number, patient_name, patient_uhid,
          event_type, stage, severity, event_datetime, description,
          action_taken, root_cause, corrective_action, resolution_status,
          recollection_requested, doctor_notified, tat_impacted,
          reported_by, reported_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        labId,
        order_id || null, order_number || null, accession_number || null,
        patient_name || null, patient_uhid || null,
        event_type, stage || 'PRE_ANALYTICAL', severity || 'MINOR',
        event_datetime || null, description || null,
        action_taken || null, root_cause || null, corrective_action || null,
        resolution_status || 'OPEN',
        recollection_requested || false, doctor_notified || false, tat_impacted || false,
        reportedBy, req.user.id || null,
      ]
    );
    return res.status(201).json({ success: true, event: r.rows[0] });
  } catch (err) {
    if (err.message.includes('does not exist')) return res.status(503).json({ error: 'Run migration 028_lab_qa_events.sql first' });
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /qa/:id - update QA event (resolution / corrective action)
router.patch('/qa/:id', verifyLabToken, async (req, res) => {
  try {
    const { resolution_status, corrective_action, root_cause, action_taken, doctor_notified, recollection_requested } = req.body;
    const r = await query(
      `UPDATE lab_qa_events SET
         resolution_status      = COALESCE($1, resolution_status),
         corrective_action      = COALESCE($2, corrective_action),
         root_cause             = COALESCE($3, root_cause),
         action_taken           = COALESCE($4, action_taken),
         doctor_notified        = COALESCE($5, doctor_notified),
         recollection_requested = COALESCE($6, recollection_requested),
         updated_at             = NOW()
       WHERE id = $7 AND lab_id = $8
       RETURNING *`,
      [resolution_status, corrective_action, root_cause, action_taken,
       doctor_notified, recollection_requested, req.params.id, req.user.lab_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Event not found' });
    return res.json({ success: true, event: r.rows[0] });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

module.exports = router;
