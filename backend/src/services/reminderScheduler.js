const cron = require('node-cron');
const { query } = require('../config/database');
const { sendMedicineReminder } = require('./notificationService');
const logger = require('../config/logger');

function startReminderScheduler() {
  // Run every minute to check for due reminders
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const currentDay = now.getDay(); // 0=Sunday, 6=Saturday

      const reminders = await query(
        `SELECT mr.*, m.name, m.dosage, m.dosage_unit,
                p.full_name, p.account_id,
                a.fcm_token
         FROM medicine_reminders mr
         JOIN medicines m ON mr.medicine_id = m.id
         JOIN profiles p ON mr.profile_id = p.id
         JOIN accounts a ON p.account_id = a.id
         WHERE mr.is_active = TRUE
           AND m.is_active = TRUE
           AND $1 = ANY(mr.days_of_week)
           AND (mr.last_sent_at IS NULL OR DATE(mr.last_sent_at) < CURRENT_DATE)`,
        [currentDay]
      );

      for (const reminder of reminders.rows) {
        const times = reminder.reminder_times || [];

        for (const time of times) {
          const reminderTime = time.substring(0, 5); // HH:MM
          if (reminderTime === currentTime) {
            await sendMedicineReminder(
              reminder.account_id,
              reminder.profile_id,
              reminder.full_name,
              reminder.name,
              `${reminder.dosage || ''} ${reminder.dosage_unit || ''}`.trim()
            );

            await query(
              'UPDATE medicine_reminders SET last_sent_at = NOW() WHERE id = $1',
              [reminder.id]
            );

            logger.info(`Reminder sent for ${reminder.name} to ${reminder.full_name}`);
          }
        }
      }
    } catch (err) {
      logger.error('Reminder scheduler error:', err);
    }
  });

  logger.info('Medicine reminder scheduler started');
}

module.exports = { startReminderScheduler };
