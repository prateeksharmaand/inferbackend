const { query } = require('../config/database');

async function addTimelineEvent(userId, eventType, title, description = null, data = null, eventDate = new Date(), referenceId = null, referenceType = null) {
  try {
    await query(
      `INSERT INTO timeline_events (user_id, event_type, title, description, data, event_date, reference_id, reference_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, eventType, title, description, data ? JSON.stringify(data) : null, eventDate, referenceId, referenceType]
    );
  } catch (e) {
    // Non-critical - don't throw
  }
}

module.exports = { addTimelineEvent };
