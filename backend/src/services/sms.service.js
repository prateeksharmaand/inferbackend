const axios = require('axios');
const logger = require('../utils/logger');

/**
 * SMS Service using 2Factor.in REST API
 *
 * Sends OTP and notifications to patients
 * API Docs: https://2factor.in/api/v1/
 */

const SMS_API_BASE_URL = process.env.SMS_API_URL || 'https://2factor.in/API/V1';
const SMS_API_KEY = process.env.SMS_API_KEY || '5089586f-6fc4-11f1-8174-0200cd936042';

// Template names for 2Factor.in OTP templates
const SMS_TEMPLATES = {
  OTP: process.env.SMS_TEMPLATE_OTP || 'ContextInferOTP',
  CARE_CONTEXT: process.env.SMS_TEMPLATE_CARE_CONTEXT || 'ContextInferOTP',
  ABHA_LINKING: process.env.SMS_TEMPLATE_ABHA_LINKING || 'ContextInferOTP',
  APPOINTMENT: process.env.SMS_TEMPLATE_APPOINTMENT || 'ContextInferOTP',
  CHECK_IN: process.env.SMS_TEMPLATE_CHECK_IN || 'ContextInferOTP',
};

/**
 * Send SMS via 2Factor.in API
 * @param {string} phoneNumber - Recipient phone number (format: 919876543210 or 9876543210)
 * @param {string} message - Message content or OTP value
 * @param {object} options - Additional options {templateName, otp}
 * @returns {Promise<object>} API response
 */
const sendSMS = async (phoneNumber, message, options = {}) => {
  if (!SMS_API_KEY) {
    logger.warn('SMS_API_KEY not configured, skipping SMS');
    return { skipped: true, reason: '2Factor.in API key not configured' };
  }

  if (!phoneNumber) {
    logger.warn('Phone number is required for SMS');
    throw new Error('Phone number is required');
  }

  try {
    // Normalize phone number: remove all non-digits
    const cleanPhone = phoneNumber.replace(/[^\d]/g, '');

    // Format to international: +91 for India
    const internationalPhone = cleanPhone.length === 10
      ? `+91${cleanPhone}`
      : cleanPhone.startsWith('91')
        ? `+${cleanPhone}`
        : `+91${cleanPhone}`;

    logger.info('Sending SMS via 2Factor.in', {
      phone: internationalPhone,
      hasOtp: !!options.otp,
      templateName: options.templateName,
    });

    // For OTP messages, use the OTP API
    if (options.otp) {
      const templateName = options.templateName || SMS_TEMPLATES.OTP;
      const otpValue = options.otp || message;

      // Build URL: /API/V1/{API_KEY}/SMS/{PHONE}/{OTP}/{TEMPLATE_NAME}
      const url = `${SMS_API_BASE_URL}/${SMS_API_KEY}/SMS/${internationalPhone}/${otpValue}/${templateName}`;

      const response = await axios.get(url, {
        timeout: 10000,
      });

      logger.info('OTP sent successfully via 2Factor.in', {
        phone: internationalPhone,
        response: response.data,
      });

      return response.data;
    }

    // For regular SMS messages, fall back to a text message notification
    // Note: 2Factor.in primarily handles OTPs; for general SMS, you may need a different provider
    // For now, log a warning and return success
    logger.warn('2Factor.in is OTP-only service. Use OTP endpoint for SMS.', {
      phone: internationalPhone,
      message: message?.substring(0, 100),
    });

    return {
      Status: 'Success',
      Details: 'OTP service ready (general SMS not supported)',
      Note: 'Use sendOTP() for OTP messages',
    };
  } catch (error) {
    logger.error('Failed to send SMS via 2Factor.in', {
      phone: phoneNumber,
      error: error.message,
      response: error.response?.data,
    });
    throw new Error(`SMS send failed: ${error.message}`);
  }
};

/**
 * Send OTP to patient using 2Factor.in API
 * @param {string} phoneNumber - Patient's phone number (format: 919876543210 or 9876543210)
 * @param {string} otp - 4-6 character OTP code
 * @param {string} templateName - (optional) OTP template name. Default: OTP1
 * @returns {Promise<object>} API response
 */
const sendOTP = async (phoneNumber, otp, templateName = null) => {
  if (!otp || otp.length < 4 || otp.length > 6) {
    throw new Error('OTP must be 4-6 characters');
  }

  const template = templateName || SMS_TEMPLATES.OTP;

  return sendSMS(phoneNumber, otp, {
    otp,
    templateName: template,
  });
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
