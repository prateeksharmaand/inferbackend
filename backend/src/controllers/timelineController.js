const { query } = require('../config/database');

async function getTimeline(req, res, next) {
  try {
    const { profileId } = req.params;
    const { type, from, to, limit = 30, offset = 0 } = req.query;

    let sql = 'SELECT * FROM timeline_events WHERE profile_id = $1';
    const params = [profileId];
    let idx = 2;

    if (type) { sql += ` AND event_type = $${idx++}`; params.push(type); }
    if (from) { sql += ` AND event_date >= $${idx++}`; params.push(from); }
    if (to) { sql += ` AND event_date <= $${idx++}`; params.push(to); }

    sql += ` ORDER BY event_date DESC LIMIT $${idx++} OFFSET $${idx}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function addTimelineNote(req, res, next) {
  try {
    const { profileId, title, description, eventDate } = req.body;

    const result = await query(
      `INSERT INTO timeline_events (profile_id, event_type, title, description, event_date)
       VALUES ($1, 'note', $2, $3, $4) RETURNING *`,
      [profileId, title, description, eventDate || new Date()]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function deleteTimelineEvent(req, res, next) {
  try {
    await query(
      `DELETE FROM timeline_events te USING profiles p
       WHERE te.id = $1 AND te.profile_id = p.id AND p.account_id = $2`,
      [req.params.eventId, req.accountId]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { getTimeline, addTimelineNote, deleteTimelineEvent };
