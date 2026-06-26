/**
 * Wallet Integration Service
 * Handles credit deduction for SMS, WhatsApp, and Prescription services
 * Provides credit check and deduction logic
 */

const walletService = require('./walletService');
const logger = require('../utils/logger');
const db = require('../config/database');

class WalletIntegrationService {
  /**
   * Check if wallet has sufficient balance for SMS
   * @param {string} walletId
   * @param {number} messageCount
   * @returns {Promise<{allowed: boolean, reason: string|null, currentBalance, requiredCredits}>}
   */
  async checkSMSBalance(walletId, messageCount = 1) {
    try {
      const result = await walletService.checkBalance(walletId, 'sms', messageCount);
      return {
        allowed: result.hasBalance,
        reason: result.hasBalance ? null : 'Insufficient credits for SMS',
        currentBalance: result.currentBalance,
        requiredCredits: result.requiredCredits,
      };
    } catch (error) {
      logger.error(`Error checking SMS balance for wallet ${walletId}:`, error);
      throw error;
    }
  }

  /**
   * Deduct credits for SMS
   * @param {string} walletId
   * @param {string} phoneNumber
   * @param {string} message
   * @param {string} messageId
   * @returns {Promise<{success: boolean, transactionId}>}
   */
  async deductSMSCredits(walletId, phoneNumber, message, messageId) {
    try {
      const transactionId = await walletService.deductCredits(
        walletId,
        'sms',
        1, // 1 SMS = 0.14 credits
        `sms_${messageId}`, // Idempotency key
        {
          phone: phoneNumber,
          message_id: messageId,
          message_length: message.length,
          message_preview: message.substring(0, 50),
        }
      );

      logger.info(`SMS credits deducted for wallet ${walletId}: ${messageId}`);
      return { success: true, transactionId };
    } catch (error) {
      logger.error(`Error deducting SMS credits for wallet ${walletId}:`, error);
      throw error;
    }
  }

  /**
   * Check if wallet has sufficient balance for WhatsApp
   * @param {string} walletId
   * @param {number} messageCount
   * @returns {Promise<{allowed: boolean, reason: string|null, currentBalance, requiredCredits}>}
   */
  async checkWhatsAppBalance(walletId, messageCount = 1) {
    try {
      const result = await walletService.checkBalance(walletId, 'whatsapp', messageCount);
      return {
        allowed: result.hasBalance,
        reason: result.hasBalance ? null : 'Insufficient credits for WhatsApp message',
        currentBalance: result.currentBalance,
        requiredCredits: result.requiredCredits,
      };
    } catch (error) {
      logger.error(`Error checking WhatsApp balance for wallet ${walletId}:`, error);
      throw error;
    }
  }

  /**
   * Deduct credits for WhatsApp
   * @param {string} walletId
   * @param {string} phoneNumber
   * @param {string} messageId
   * @param {object} metadata
   * @returns {Promise<{success: boolean, transactionId}>}
   */
  async deductWhatsAppCredits(walletId, phoneNumber, messageId, metadata = {}) {
    try {
      const transactionId = await walletService.deductCredits(
        walletId,
        'whatsapp',
        1, // 1 WhatsApp message = 0.66 credits
        `wa_${messageId}`, // Idempotency key
        {
          phone: phoneNumber,
          message_id: messageId,
          ...metadata,
        }
      );

      logger.info(`WhatsApp credits deducted for wallet ${walletId}: ${messageId}`);
      return { success: true, transactionId };
    } catch (error) {
      logger.error(`Error deducting WhatsApp credits for wallet ${walletId}:`, error);
      throw error;
    }
  }

  /**
   * Check if wallet has sufficient balance for Prescription
   * @param {string} walletId
   * @returns {Promise<{allowed: boolean, reason: string|null, currentBalance, requiredCredits}>}
   */
  async checkPrescriptionBalance(walletId) {
    try {
      const result = await walletService.checkBalance(walletId, 'prescription', 1);
      return {
        allowed: result.hasBalance,
        reason: result.hasBalance ? null : 'Insufficient credits to create prescription',
        currentBalance: result.currentBalance,
        requiredCredits: result.requiredCredits,
      };
    } catch (error) {
      logger.error(`Error checking prescription balance for wallet ${walletId}:`, error);
      throw error;
    }
  }

  /**
   * Deduct credits for Prescription
   * @param {string} walletId
   * @param {string} prescriptionId
   * @param {string} patientName
   * @returns {Promise<{success: boolean, transactionId}>}
   */
  async deductPrescriptionCredits(walletId, prescriptionId, patientName) {
    try {
      const transactionId = await walletService.deductCredits(
        walletId,
        'prescription',
        1, // 1 Prescription = 1 credit
        `rx_${prescriptionId}`, // Idempotency key
        {
          prescription_id: prescriptionId,
          patient_name: patientName,
        }
      );

      logger.info(`Prescription credits deducted for wallet ${walletId}: ${prescriptionId}`);
      return { success: true, transactionId };
    } catch (error) {
      logger.error(`Error deducting prescription credits for wallet ${walletId}:`, error);
      throw error;
    }
  }

  /**
   * Get wallet for clinic/doctor (used in service routes)
   */
  async getWalletForDoctor(clinicId, doctorId) {
    try {
      return await walletService.getWalletByClinicDoctor(clinicId, doctorId);
    } catch (error) {
      logger.error(`Error fetching wallet for doctor ${doctorId}:`, error);
      throw error;
    }
  }

  /**
   * Middleware: Check wallet balance before processing request
   * Usage in routes: router.post('/send-sms', checkWalletBalance('sms'), sendSMSController);
   */
  checkWalletBalance(serviceType) {
    return async (req, res, next) => {
      try {
        const { clinicId, doctorId } = req.user;
        const wallet = await this.getWalletForDoctor(clinicId, doctorId);

        if (!wallet) {
          return res.status(404).json({ error: 'Wallet not found' });
        }

        // Check balance based on service type
        let balanceCheck;
        const requestQuantity = req.body.quantity || 1;

        switch (serviceType) {
          case 'sms':
            balanceCheck = await this.checkSMSBalance(wallet.id, requestQuantity);
            break;
          case 'whatsapp':
            balanceCheck = await this.checkWhatsAppBalance(wallet.id, requestQuantity);
            break;
          case 'prescription':
            balanceCheck = await this.checkPrescriptionBalance(wallet.id);
            break;
          default:
            return res.status(400).json({ error: 'Unknown service type' });
        }

        // Attach to request for later use
        req.wallet = wallet;
        req.balanceCheck = balanceCheck;

        // If balance is insufficient, return error immediately
        if (!balanceCheck.allowed) {
          return res.status(402).json({
            error: balanceCheck.reason || 'Insufficient credits',
            currentBalance: balanceCheck.currentBalance,
            requiredCredits: balanceCheck.requiredCredits,
            rechargeUrl: '/api/wallet/packs',
          });
        }

        // Balance is sufficient, proceed to next middleware
        next();
      } catch (error) {
        logger.error('Error in wallet balance check middleware:', error);
        res.status(500).json({ error: 'Error checking wallet balance' });
      }
    };
  }

  /**
   * Wrapper: Send SMS with wallet deduction
   * Usage: walletIntegrationService.sendSMSWithWallet(walletId, phone, message, messageId)
   */
  async sendSMSWithWallet(walletId, phoneNumber, message, messageId, smsService) {
    try {
      // 1. Check balance
      const balanceCheck = await this.checkSMSBalance(walletId, 1);
      if (!balanceCheck.allowed) {
        throw new Error(`Insufficient credits. Required: ${balanceCheck.requiredCredits}, Available: ${balanceCheck.currentBalance}`);
      }

      // 2. Send SMS
      const smsResult = await smsService.sendSMS(phoneNumber, message, {});

      // 3. Deduct credits (only on success)
      if (smsResult.success || !smsResult.error) {
        await this.deductSMSCredits(walletId, phoneNumber, message, messageId);
      }

      return {
        success: true,
        messageId: smsResult.id || messageId,
        creditsDeducted: 0.14,
      };
    } catch (error) {
      logger.error('Error sending SMS with wallet:', error);
      throw error;
    }
  }

  /**
   * Wrapper: Send WhatsApp with wallet deduction
   */
  async sendWhatsAppWithWallet(walletId, phoneNumber, message, messageId, waService) {
    try {
      // 1. Check balance
      const balanceCheck = await this.checkWhatsAppBalance(walletId, 1);
      if (!balanceCheck.allowed) {
        throw new Error(`Insufficient credits. Required: ${balanceCheck.requiredCredits}, Available: ${balanceCheck.currentBalance}`);
      }

      // 2. Send WhatsApp
      const waResult = await waService.sendMessage(phoneNumber, message);

      // 3. Deduct credits (only on success)
      if (waResult.success || waResult.messageId) {
        await this.deductWhatsAppCredits(
          walletId,
          phoneNumber,
          messageId,
          { response_message_id: waResult.messageId }
        );
      }

      return {
        success: true,
        messageId: waResult.messageId || messageId,
        creditsDeducted: 0.66,
      };
    } catch (error) {
      logger.error('Error sending WhatsApp with wallet:', error);
      throw error;
    }
  }

  /**
   * Wrapper: Create prescription with wallet deduction
   */
  async createPrescriptionWithWallet(walletId, prescriptionData, prescriptionService) {
    try {
      // 1. Check balance
      const balanceCheck = await this.checkPrescriptionBalance(walletId);
      if (!balanceCheck.allowed) {
        throw new Error(`Insufficient credits. Required: ${balanceCheck.requiredCredits}, Available: ${balanceCheck.currentBalance}`);
      }

      // 2. Create prescription
      const rxResult = await prescriptionService.createPrescription(prescriptionData);

      // 3. Deduct credits (only on success)
      if (rxResult.id) {
        await this.deductPrescriptionCredits(
          walletId,
          rxResult.id,
          prescriptionData.patientName
        );
      }

      return {
        success: true,
        prescriptionId: rxResult.id,
        creditsDeducted: 1.00,
      };
    } catch (error) {
      logger.error('Error creating prescription with wallet:', error);
      throw error;
    }
  }

  /**
   * Get wallet stats for dashboard
   */
  async getWalletStats(walletId) {
    try {
      const wallet = await walletService.getWalletById(walletId);
      const summary = await walletService.getWalletSummary(walletId);

      return {
        wallet,
        summary,
      };
    } catch (error) {
      logger.error(`Error fetching wallet stats for ${walletId}:`, error);
      throw error;
    }
  }
}

module.exports = new WalletIntegrationService();
