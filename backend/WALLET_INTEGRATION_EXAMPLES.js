/**
 * WALLET INTEGRATION EXAMPLES
 * Shows how to integrate wallet credit deduction into existing SMS, WhatsApp, Prescription services
 *
 * These are examples - integrate into your actual route files:
 * - src/routes/sms.routes.js (or wherever you handle SMS)
 * - src/emr/inbound/whatsapp.service.js (or wherever you handle WhatsApp)
 * - src/routes/prescription.routes.js (or wherever you handle Prescriptions)
 */

const walletIntegrationService = require('./src/services/walletIntegrationService');
const smsService = require('./src/services/sms.service');
const logger = require('./src/utils/logger');

// ============================================================================
// EXAMPLE 1: SMS ROUTE WITH WALLET INTEGRATION
// ============================================================================

/**
 * POST /api/sms/send
 * Send SMS to patient with credit deduction
 *
 * Request body:
 * {
 *   "phoneNumber": "+919876543210",
 *   "message": "Your appointment is confirmed",
 *   "messageId": "msg_12345" // unique ID for idempotency
 * }
 *
 * Response on success:
 * {
 *   "success": true,
 *   "messageId": "msg_12345",
 *   "creditsDeducted": 0.14,
 *   "newBalance": 234.36
 * }
 *
 * Response on insufficient credits (402):
 * {
 *   "error": "Insufficient credits. Please recharge.",
 *   "currentBalance": 0.10,
 *   "requiredCredits": 0.14,
 *   "rechargeUrl": "/api/wallet/packs"
 * }
 */
const smsRouteExample = async (req, res) => {
  try {
    const { clinicId, doctorId } = req.user;
    const { phoneNumber, message, messageId } = req.body;

    // STEP 1: Get wallet for doctor
    const wallet = await walletIntegrationService.getWalletForDoctor(clinicId, doctorId);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found. Please initialize wallet.' });
    }

    // STEP 2: Check balance (automatically handled by middleware below)
    // But you can also do it here manually:
    const balanceCheck = await walletIntegrationService.checkSMSBalance(wallet.id);
    if (!balanceCheck.allowed) {
      return res.status(402).json({
        error: 'Insufficient credits. Please recharge.',
        currentBalance: balanceCheck.currentBalance,
        requiredCredits: balanceCheck.requiredCredits,
      });
    }

    // STEP 3: Send SMS
    const smsResult = await smsService.sendSMS(phoneNumber, message);

    if (!smsResult.success && smsResult.error) {
      logger.error(`SMS sending failed: ${smsResult.error}`);
      return res.status(500).json({ error: 'Failed to send SMS' });
    }

    // STEP 4: Deduct credits (only if SMS sent successfully)
    const { transactionId } = await walletIntegrationService.deductSMSCredits(
      wallet.id,
      phoneNumber,
      message,
      messageId
    );

    // STEP 5: Get new balance
    const updatedWallet = await walletService.getWalletById(wallet.id);

    res.json({
      success: true,
      messageId: smsResult.id || messageId,
      creditsDeducted: 0.14,
      newBalance: updatedWallet.current_balance,
      transactionId,
    });
  } catch (error) {
    logger.error('Error sending SMS:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * ALTERNATIVE: Using middleware for balance check
 *
 * router.post(
 *   '/sms/send',
 *   requireAuth,
 *   walletIntegrationService.checkWalletBalance('sms'),  // Automatic balance check
 *   sendSMSController
 * );
 *
 * Then in controller, req.balanceCheck will contain the balance info
 */

// ============================================================================
// EXAMPLE 2: WHATSAPP ROUTE WITH WALLET INTEGRATION
// ============================================================================

/**
 * POST /api/whatsapp/send
 * Send WhatsApp message to patient with credit deduction
 *
 * Request body:
 * {
 *   "phoneNumber": "+919876543210",
 *   "message": "Your health records are ready",
 *   "messageId": "wa_msg_12345"
 * }
 */
const whatsappRouteExample = async (req, res) => {
  try {
    const { clinicId, doctorId } = req.user;
    const { phoneNumber, message, messageId } = req.body;

    // STEP 1: Get wallet
    const wallet = await walletIntegrationService.getWalletForDoctor(clinicId, doctorId);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // STEP 2: Check balance
    const balanceCheck = await walletIntegrationService.checkWhatsAppBalance(wallet.id);
    if (!balanceCheck.allowed) {
      return res.status(402).json({
        error: 'Insufficient credits. Please recharge.',
        currentBalance: balanceCheck.currentBalance,
        requiredCredits: balanceCheck.requiredCredits,
      });
    }

    // STEP 3: Send WhatsApp
    const waResult = await whatsappService.sendMessage(phoneNumber, message);

    if (!waResult.success && waResult.error) {
      logger.error(`WhatsApp sending failed: ${waResult.error}`);
      return res.status(500).json({ error: 'Failed to send WhatsApp message' });
    }

    // STEP 4: Deduct credits
    const { transactionId } = await walletIntegrationService.deductWhatsAppCredits(
      wallet.id,
      phoneNumber,
      messageId,
      { response_message_id: waResult.messageId }
    );

    // STEP 5: Return response
    const updatedWallet = await walletService.getWalletById(wallet.id);

    res.json({
      success: true,
      messageId: waResult.messageId || messageId,
      creditsDeducted: 0.66,
      newBalance: updatedWallet.current_balance,
      transactionId,
    });
  } catch (error) {
    logger.error('Error sending WhatsApp:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// EXAMPLE 3: PRESCRIPTION CREATION WITH WALLET INTEGRATION
// ============================================================================

/**
 * POST /api/prescriptions
 * Create prescription with credit deduction
 *
 * Request body:
 * {
 *   "patientId": "uuid",
 *   "patientName": "John Doe",
 *   "medicines": [...],
 *   "instructions": "Take 1 tablet daily"
 * }
 *
 * Response on success:
 * {
 *   "success": true,
 *   "prescriptionId": "rx_uuid",
 *   "creditsDeducted": 1.00,
 *   "newBalance": 233.36
 * }
 */
const prescriptionRouteExample = async (req, res) => {
  try {
    const { clinicId, doctorId } = req.user;
    const prescriptionData = req.body;

    // STEP 1: Get wallet
    const wallet = await walletIntegrationService.getWalletForDoctor(clinicId, doctorId);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // STEP 2: Check balance for prescription
    const balanceCheck = await walletIntegrationService.checkPrescriptionBalance(wallet.id);
    if (!balanceCheck.allowed) {
      return res.status(402).json({
        error: 'Insufficient credits to create prescription. Please recharge.',
        currentBalance: balanceCheck.currentBalance,
        requiredCredits: balanceCheck.requiredCredits,
        rechargeUrl: '/api/wallet/packs',
      });
    }

    // STEP 3: Validate prescription data
    // ... your validation code ...

    // STEP 4: Create prescription
    const rxResult = await prescriptionService.createPrescription(prescriptionData);

    // STEP 5: Deduct credits
    const { transactionId } = await walletIntegrationService.deductPrescriptionCredits(
      wallet.id,
      rxResult.id,
      prescriptionData.patientName
    );

    // STEP 6: Return response
    const updatedWallet = await walletService.getWalletById(wallet.id);

    res.json({
      success: true,
      prescriptionId: rxResult.id,
      creditsDeducted: 1.00,
      newBalance: updatedWallet.current_balance,
      transactionId,
    });
  } catch (error) {
    logger.error('Error creating prescription:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// EXAMPLE 4: USING MIDDLEWARE FOR AUTOMATIC BALANCE CHECK
// ============================================================================

/**
 * Clean way to integrate wallet balance check using middleware:
 *
 * router.post(
 *   '/sms/send',
 *   requireAuth,
 *   walletIntegrationService.checkWalletBalance('sms'),  // Check SMS balance
 *   sendSMSController
 * );
 *
 * router.post(
 *   '/whatsapp/send',
 *   requireAuth,
 *   walletIntegrationService.checkWalletBalance('whatsapp'),  // Check WhatsApp balance
 *   sendWhatsAppController
 * );
 *
 * router.post(
 *   '/prescriptions',
 *   requireAuth,
 *   walletIntegrationService.checkWalletBalance('prescription'),  // Check Prescription balance
 *   createPrescriptionController
 * );
 *
 * Then in your controllers, you can access:
 * - req.wallet (the wallet object)
 * - req.balanceCheck (contains: {allowed, reason, currentBalance, requiredCredits})
 */

// ============================================================================
// EXAMPLE 5: FULL INTEGRATION WITH ERROR HANDLING
// ============================================================================

const completeIntegrationExample = async (req, res) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const { clinicId, doctorId } = req.user;
    const { phoneNumber, message, messageId } = req.body;

    // Get wallet
    const wallet = await walletIntegrationService.getWalletForDoctor(clinicId, doctorId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Check balance
    const balanceCheck = await walletIntegrationService.checkSMSBalance(wallet.id);
    if (!balanceCheck.allowed) {
      await client.query('COMMIT');
      return res.status(402).json({
        error: 'Insufficient credits',
        currentBalance: balanceCheck.currentBalance,
        requiredCredits: balanceCheck.requiredCredits,
      });
    }

    // Send SMS
    const smsResult = await smsService.sendSMS(phoneNumber, message);
    if (smsResult.error) {
      throw new Error(`SMS failed: ${smsResult.error}`);
    }

    // Deduct credits
    const { transactionId } = await walletIntegrationService.deductSMSCredits(
      wallet.id,
      phoneNumber,
      message,
      messageId
    );

    // Log action
    await client.query(
      `INSERT INTO sms_logs (clinic_id, doctor_id, phone_number, message_id, transaction_id, status)
       VALUES ($1, $2, $3, $4, $5, 'sent')`,
      [clinicId, doctorId, phoneNumber, messageId, transactionId]
    );

    await client.query('COMMIT');

    res.json({ success: true, messageId });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// ============================================================================
// EXAMPLE 6: ERROR RESPONSE CODES
// ============================================================================

/**
 * HTTP Status Codes for Wallet Integration:
 *
 * 200 OK - Message sent / Prescription created successfully
 *
 * 402 PAYMENT_REQUIRED - Insufficient credits
 * {
 *   "error": "Insufficient credits. Please recharge.",
 *   "currentBalance": 0.10,
 *   "requiredCredits": 0.66,
 *   "rechargeUrl": "/api/wallet/packs"
 * }
 *
 * 403 FORBIDDEN - Subscription inactive or Wallet locked
 * {
 *   "error": "Subscription inactive. Please renew your subscription."
 * }
 *
 * 404 NOT_FOUND - Wallet not found
 * {
 *   "error": "Wallet not found. Please initialize wallet."
 * }
 *
 * 500 INTERNAL_SERVER_ERROR - Server error
 * {
 *   "error": "Error processing request"
 * }
 */

// ============================================================================
// INTEGRATION CHECKLIST
// ============================================================================

/**
 * 1. Import walletIntegrationService in your route files:
 *    const walletIntegrationService = require('../services/walletIntegrationService');
 *
 * 2. For SMS routes:
 *    - Add wallet balance check before sending SMS
 *    - Deduct credits after successful send
 *    - Use messageId for idempotency
 *
 * 3. For WhatsApp routes:
 *    - Add wallet balance check before sending message
 *    - Deduct credits after successful send
 *    - Use messageId for idempotency
 *
 * 4. For Prescription routes:
 *    - Add wallet balance check before creating prescription
 *    - Deduct credits after successful creation
 *    - Use prescriptionId for idempotency
 *
 * 5. Handle 402 status code in frontend:
 *    - Show "Recharge Credits" button
 *    - Display required vs available credits
 *    - Link to /api/wallet/packs
 *
 * 6. Test with walletService.deductCredits() using fake data:
 *    - Test idempotency (send same messageId twice)
 *    - Test insufficient balance (should return 402)
 *    - Test subscription inactive (should return 403)
 *
 * 7. Monitor wallet_transactions table for audit trail
 */

// ============================================================================
// FRONTEND RESPONSE HANDLING
// ============================================================================

/**
 * Frontend code example (JavaScript/React):
 *
 * // Send SMS
 * async function sendSMS(phoneNumber, message) {
 *   try {
 *     const response = await fetch('/api/sms/send', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({
 *         phoneNumber,
 *         message,
 *         messageId: `msg_${Date.now()}_${Math.random()}`
 *       })
 *     });
 *
 *     if (response.status === 402) {
 *       // Insufficient credits
 *       const data = await response.json();
 *       showDialog({
 *         title: 'Insufficient Credits',
 *         message: `You need ₹${data.requiredCredits} credits but only have ₹${data.currentBalance}`,
 *         actions: [
 *           { text: 'Recharge', onPress: () => navigateTo('/wallet/recharge') },
 *           { text: 'Cancel' }
 *         ]
 *       });
 *       return;
 *     }
 *
 *     if (response.ok) {
 *       const data = await response.json();
 *       showNotification(`SMS sent! Credits deducted: ${data.creditsDeducted}`);
 *       updateWalletBalance(data.newBalance);
 *       return;
 *     }
 *
 *     throw new Error('Failed to send SMS');
 *   } catch (error) {
 *     showError(error.message);
 *   }
 * }
 */

module.exports = {
  smsRouteExample,
  whatsappRouteExample,
  prescriptionRouteExample,
  completeIntegrationExample,
};
