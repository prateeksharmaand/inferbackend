const cron = require('node-cron');
const { query } = require('../config/database');
const logger = require('../utils/logger');

function startGmailSyncCron() {
  // Run every 30 minutes — fetch new medical emails for all connected users
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await query(
        'SELECT user_id FROM user_gmail_tokens WHERE is_active = true',
      );
      if (result.rows.length === 0) return;
      const { syncUserEmails } = require('./gmail.service');
      for (const { user_id } of result.rows) {
        await syncUserEmails(user_id).catch(
          e => logger.error(`[Gmail Cron] user:${user_id} | ${e.message}`),
        );
      }
    } catch (e) {
      logger.error('[Gmail Cron] error:', e.message);
    }
  });
  logger.info('Gmail sync cron started (every 30 min)');
}

function startReminderCron() {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const currentHour = now.getHours().toString().padStart(2, '0');
      const currentMin = now.getMinutes().toString().padStart(2, '0');
      const currentTime = `${currentHour}:${currentMin}`;
      const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
      const result = await query(
        `SELECT r.*, u.fcm_token, u.email FROM reminders r
         JOIN users u ON r.user_id = u.id
         WHERE r.is_active = true AND r.start_date <= CURRENT_DATE
         AND (r.end_date IS NULL OR r.end_date >= CURRENT_DATE)
         AND $1 = ANY(r.days_of_week) AND $2 = ANY(r.times)`,
        [dayOfWeek, currentTime]
      );
      for (const reminder of result.rows) {
        logger.info(`Sending medicine reminder: ${reminder.medicine_name} to user ${reminder.user_id}`);
        await query(
          'INSERT INTO notifications (user_id, title, body, type) VALUES ($1, $2, $3, $4)',
          [reminder.user_id, 'Medicine Reminder', `Time to take ${reminder.medicine_name} - ${reminder.dosage}`, 'medicine_reminder']
        ).catch(() => {});
      }
    } catch (e) {
      logger.error('Cron error:', e.message);
    }
  });
  logger.info('Medicine reminder cron started');
}

module.exports = { startReminderCron, startGmailSyncCron };
