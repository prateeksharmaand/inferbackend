const axios = require('axios');
const logger = require('../utils/logger');

/**
 * SMS Service using SMSCountry REST API
 *
 * Sends OTP and notifications to patients
 * API Docs: https://www.smscountry.com/restapidoc.html
 */

const SMS_API_BASE_URL = process.env.SMS_API_URL || 'https://api.smscountry.com/v0.1/Send';
const SMS_AUTH_KEY = process.env.SMS_AUTH_KEY || 'VTP86O3CGw1rJNVi2sQn';
const SMS_AUTH_TOKEN = process.env.SMS_AUTH_TOKEN || 'WSPI3z2F2o5CMI6oN2yBZlwzAxZp2WExeV6ZSSBj';
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || 'NOUSHL';

// Template IDs from SMSCountry
const SMS_TEMPLATES = {
  OTP: process.env.SMS_TEMPLATE_OTP || '1207178211673331606',
  CARE_CONTEXT: process.env.SMS_TEMPLATE_CARE_CONTEXT,
  ABHA_LINKING: process.env.SMS_TEMPLATE_ABHA_LINKING,
  APPOINTMENT: process.env.SMS_TEMPLATE_APPOINTMENT,
  CHECK_IN: process.env.SMS_TEMPLATE_CHECK_IN,
};

/**
 * Send SMS via SMSCountry API
 * @param {string} phoneNumber - Recipient phone number (format: 919876543210)
 * @param {string} message - Message content (max 160 chars for single SMS)
 * @param {object} options - Additional options {templateId, vars}
 * @returns {Promise<object>} API response
 */
const sendSMS = async (phoneNumber, message, options = {}) => {
  if (!SMS_AUTH_KEY || !SMS_AUTH_TOKEN) {
    logger.warn('SMS_AUTH_KEY or SMS_AUTH_TOKEN not configured, skipping SMS');
    return { skipped: true, reason: 'SMSCountry credentials not configured' };
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
    const payload = {
      AuthKey: SMS_AUTH_KEY,
      AuthToken: SMS_AUTH_TOKEN,
      To: formattedPhone,
      SenderId: SMS_SENDER_ID,
    };

    // Use template if templateId provided, otherwise send raw message
    if (options.templateId) {
      payload.TemplateId = options.templateId;
      if (options.vars) {
        // For template variables, pass as TemplateData or similar (depends on API)
        payload.TemplateData = options.vars;
      }
      logger.info('Sending template SMS', {
        phone: formattedPhone,
        templateId: options.templateId,
      });
    } else {
      payload.Content = message;
      logger.info('Sending raw SMS', {
        phone: formattedPhone,
        messageLength: message.length,
      });
    }

    const response = await axios.post(SMS_API_BASE_URL, payload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.info('SMS sent successfully', {
      phone: formattedPhone,
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
 * Send OTP to patient using SMSCountry template
 * @param {string} phoneNumber - Patient's phone number
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<object>} API response
 */
const sendOTP = async (phoneNumber, otp) => {
  if (!otp || otp.length < 4) {
    throw new Error('Invalid OTP format');
  }

  // Use template if available, otherwise fall back to raw message
  if (SMS_TEMPLATES.OTP) {
    return sendSMS(phoneNumber, null, {
      templateId: SMS_TEMPLATES.OTP,
      vars: otp,
    });
  } else {
    const message = `Your OTP is ${otp}. Valid for 10 minutes. Do not share with anyone. Nous Healthcare`;
    return sendSMS(phoneNumber, message);
  }
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
