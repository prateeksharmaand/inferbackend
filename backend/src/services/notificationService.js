const admin = require('firebase-admin');
const { query } = require('../config/database');
const logger = require('../config/logger');

let firebaseInitialized = false;

function initFirebase() {
  if (firebaseInitialized || !process.env.FIREBASE_PROJECT_ID) return;
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    firebaseInitialized = true;
    logger.info('Firebase initialized');
  } catch (err) {
    logger.warn('Firebase init failed (push notifications disabled):', err.message);
  }
}

initFirebase();

async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (!firebaseInitialized || !fcmToken) return false;

  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high', notification: { channelId: 'phr_channel' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
    return true;
  } catch (err) {
    logger.error('Push notification failed:', err.message);
    return false;
  }
}

async function createNotification(accountId, profileId, title, body, type, metadata = {}, scheduledFor = null) {
  const result = await query(
    `INSERT INTO notifications (account_id, profile_id, title, body, type, metadata, scheduled_for, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [accountId, profileId, title, body, type, JSON.stringify(metadata), scheduledFor, scheduledFor ? null : new Date()]
  );

  // Send immediately if not scheduled
  if (!scheduledFor) {
    const account = await query('SELECT fcm_token FROM accounts WHERE id = $1', [accountId]);
    if (account.rows[0]?.fcm_token) {
      await sendPushNotification(account.rows[0].fcm_token, title, body, metadata);
    }
  }

  return result.rows[0];
}

async function sendAbnormalVitalAlert(accountId, profileId, profileName, vitalType, value) {
  const messages = {
    bp: `${profileName}'s blood pressure reading of ${value} is abnormal. Please consult a doctor.`,
    heart_rate: `${profileName}'s heart rate of ${value} bpm is outside normal range.`,
    spo2: `${profileName}'s oxygen saturation of ${value}% is critically low. Seek immediate medical attention.`,
    glucose: `${profileName}'s blood sugar reading of ${value} mg/dL requires attention.`,
    temperature: `${profileName}'s temperature of ${value}°C is abnormal.`,
  };

  const body = messages[vitalType] || `${profileName} has an abnormal ${vitalType} reading.`;
  await createNotification(accountId, profileId, 'Abnormal Reading Alert', body, 'abnormal_vital', { vitalType, value });
}

async function sendMedicineReminder(accountId, profileId, profileName, medicineName, dosage) {
  await createNotification(
    accountId,
    profileId,
    'Medicine Reminder',
    `Time for ${profileName} to take ${medicineName} ${dosage}`,
    'medicine_reminder',
    { medicineName, dosage }
  );
}

module.exports = { sendPushNotification, createNotification, sendAbnormalVitalAlert, sendMedicineReminder };
