const { query } = require('../config/database');

async function sendVitalAlert(userId, vitalType, value, status) {
  const title = `Vital Alert: ${_formatType(vitalType)}`;
  const body = `Your ${vitalType.replace(/_/g, ' ')} reading of ${value} is ${status}. Please consult a doctor.`;
  await query(
    'INSERT INTO notifications (user_id, title, body, type, data) VALUES ($1, $2, $3, $4, $5)',
    [userId, title, body, 'vital_alert', JSON.stringify({ vitalType, value, status })]
  );
  // FCM push would be sent here if firebase-admin is configured
  const userResult = await query('SELECT fcm_token FROM users WHERE id = $1', [userId]);
  if (userResult.rows[0]?.fcm_token) {
    // await sendFcmNotification(userResult.rows[0].fcm_token, title, body);
  }
}

function scheduleReminder(reminderId, medicineName, times) {}
function cancelReminder(reminderId) {}

function _formatType(type) {
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

module.exports = { sendVitalAlert, scheduleReminder, cancelReminder };
