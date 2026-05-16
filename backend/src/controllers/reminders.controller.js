const { query } = require('../config/database');
const { addTimelineEvent } = require('../services/timeline.service');
const { scheduleReminder, cancelReminder } = require('../services/notification.service');

async function getReminders(req, res) {
  const result = await query('SELECT * FROM reminders WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  res.json({ reminders: result.rows });
}

async function addReminder(req, res) {
  const { medicine_name, dosage, frequency, times, start_date, end_date, notes, color, days_of_week } = req.body;
  if (!medicine_name || !dosage || !frequency || !times?.length) return res.status(400).json({ error: 'Required fields missing' });
  const result = await query(
    `INSERT INTO reminders (user_id, medicine_name, dosage, frequency, times, start_date, end_date, notes, color, days_of_week)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.user.id, medicine_name, dosage, frequency, times, start_date, end_date, notes, color, days_of_week || [1,2,3,4,5,6,7]]
  );
  const reminder = result.rows[0];
  await addTimelineEvent(req.user.id, 'reminder', `Reminder Added: ${medicine_name}`, `${dosage} - ${frequency}`);
  res.status(201).json({ reminder });
}

async function updateReminder(req, res) {
  const { medicine_name, dosage, frequency, times, is_active, end_date, notes } = req.body;
  const result = await query(
    `UPDATE reminders SET medicine_name=COALESCE($1,medicine_name), dosage=COALESCE($2,dosage),
     frequency=COALESCE($3,frequency), times=COALESCE($4,times), is_active=COALESCE($5,is_active),
     end_date=COALESCE($6,end_date), notes=COALESCE($7,notes) WHERE id=$8 AND user_id=$9 RETURNING *`,
    [medicine_name, dosage, frequency, times, is_active, end_date, notes, req.params.id, req.user.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Reminder not found' });
  res.json({ reminder: result.rows[0] });
}

async function deleteReminder(req, res) {
  const result = await query('DELETE FROM reminders WHERE id=$1 AND user_id=$2 RETURNING id', [req.params.id, req.user.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Reminder not found' });
  res.json({ message: 'Reminder deleted' });
}

module.exports = { getReminders, addReminder, updateReminder, deleteReminder };
