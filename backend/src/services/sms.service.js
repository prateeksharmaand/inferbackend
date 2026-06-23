const axios = require('axios');
const logger = require('../utils/logger');

/**
 * SMS Service using SMSCountry REST API
 *
 * Sends OTP and notifications to patients
 * API Docs: https://www.smscountry.com/restapidoc.html
 */

const SMS_API_BASE_URL = process.env.SMS_API_URL || 'https://api.smscountry.com/v0.1/Send';
const SMS_API_KEY = process.env.SMS_API_KEY;
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || 'INFER';

/**
 * Send SMS via SMSCountry API
 * @param {string} phoneNumber - Recipient phone number (format: 919876543210)
 * @param {string} message - Message content (max 160 chars for single SMS)
 * @returns {Promise<object>} API response
 */
const sendSMS = async (phoneNumber, message) => {
  if (!SMS_API_KEY) {
    logger.warn('SMS_API_KEY not configured, skipping SMS');
    return { skipped: true, reason: 'API key not configured' };
  }

  if (!phoneNumber) {
    logger.warn('Phone number is required for SMS');
    throw new Error('Phone number is required');
  }

  // Normalize phone number (remove +, spaces, hyphens)
  const cleanPhone = phoneNumber.replace(/[^\d]/g, '');

  // Ensure it starts with country code (91 for India)
  const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  try {
    const response = await axios.post(SMS_API_BASE_URL, {
      key: SMS_API_KEY,
      phone: formattedPhone,
      message: message,
      sender: SMS_SENDER_ID,
    }, {
      timeout: 10000,
    });

    logger.info('SMS sent successfully', {
      phone: formattedPhone,
      messageLength: message.length,
      response: response.data,
    });

    return response.data;
  } catch (error) {
    logger.error('Failed to send SMS', {
      phone: formattedPhone,
      error: error.message,
      response: error.response?.data,
    });
    throw new Error(`SMS send failed: ${error.message}`);
  }
};

/**
 * Send OTP to patient
 * @param {string} phoneNumber - Patient's phone number
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<object>} API response
 */
const sendOTP = async (phoneNumber, otp) => {
  if (!otp || otp.length < 4) {
    throw new Error('Invalid OTP format');
  }

  const message = `Your Infer EMR OTP is: ${otp}. Valid for 10 minutes. Do not share with anyone.`;
  return sendSMS(phoneNumber, message);
};

/**
 * Send care context access notification
 * @param {string} phoneNumber - Patient's phone number
 * @param {string} facilityName - Name of facility accessing care context
 * @returns {Promise<object>} API response
 */
const sendCareContextNotification = async (phoneNumber, facilityName) => {
  const message = `Your health data at ${facilityName} is being accessed. If not you, contact support.`;
  return sendSMS(phoneNumber, message);
};

/**
 * Send ABHA linking notification
 * @param {string} phoneNumber - Patient's phone number
 * @param {string} facilityName - Name of facility
 * @returns {Promise<object>} API response
 */
const sendAbhaLinkingNotification = async (phoneNumber, facilityName) => {
  const message = `Your ABHA is linked to ${facilityName}. View/manage at: https://phrsbx.abdm.gov.in`;
  return sendSMS(phoneNumber, message);
};

/**
 * Send appointment confirmation
 * @param {string} phoneNumber - Patient's phone number
 * @param {object} appointmentData - Appointment details
 * @returns {Promise<object>} API response
 */
const sendAppointmentConfirmation = async (phoneNumber, appointmentData) => {
  const { doctorName, facilityName, appointmentDate, appointmentTime, tokenNumber } = appointmentData;

  const message = `Appointment confirmed at ${facilityName}. Doctor: ${doctorName}, Date: ${appointmentDate}, Time: ${appointmentTime}, Token: ${tokenNumber}`;
  return sendSMS(phoneNumber, message);
};

/**
 * Send visit check-in confirmation
 * @param {string} phoneNumber - Patient's phone number
 * @param {object} visitData - Visit details
 * @returns {Promise<object>} API response
 */
const sendVisitCheckInNotification = async (phoneNumber, visitData) => {
  const { facilityName, queueName, tokenNumber } = visitData;

  const message = `Checked in at ${facilityName}. Queue: ${queueName}, Token: ${tokenNumber}. Please wait for your turn.`;
  return sendSMS(phoneNumber, message);
};

module.exports = {
  sendSMS,
  sendOTP,
  sendCareContextNotification,
  sendAbhaLinkingNotification,
  sendAppointmentConfirmation,
  sendVisitCheckInNotification,
};
