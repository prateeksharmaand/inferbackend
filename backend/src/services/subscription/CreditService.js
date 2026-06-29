/**
 * CreditService - AI credit management
 *
 * Handles:
 * - Credit balance checking
 * - Credit deduction with idempotency
 * - Failed request handling (no deduction)
 * - Usage tracking
 * - Monthly reset logic
 */

const { pool } = require('../../config/database');
const logger = require('../../utils/logger');
const crypto = require('crypto');

class CreditService {
  /**
   * Get wallet for clinic/staff
   * @param {number} clinicId
   * @param {number} staffId
   * @returns {Object|null} Wallet record
   */
  async getWallet(clinicId, staffId) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM wallet
         WHERE clinic_id = $1 AND doctor_id = $2`,
        [clinicId, staffId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      logger.error('[CreditService.getWallet] failed:', error.message);
      throw error;
    }
  }

  /**
   * Ensure wallet exists
   * @param {number} clinicId
   * @param {number} staffId
   * @returns {Object} Wallet record
   */
  async ensureWallet(clinicId, staffId) {
    try {
      let wallet = await this.getWallet(clinicId, staffId);

      if (!wallet) {
        const { rows } = await pool.query(
          `INSERT INTO wallet (clinic_id, doctor_id, current_balance, subscription_active)
           VALUES ($1, $2, 0, TRUE)
           RETURNING *`,
          [clinicId, staffId]
        );
        wallet = rows[0];

        logger.info(`[CreditService] Created wallet for clinic ${clinicId}, staff ${staffId}`);
      }

      return wallet;
    } catch (error) {
      logger.error('[CreditService.ensureWallet] failed:', error.message);
      throw error;
    }
  }

  /**
   * Get AI credits remaining for clinic
   * Sums all staff wallets in clinic
   * @param {number} clinicId
   * @returns {number} Total credits
   */
  async getClinicCreditsRemaining(clinicId) {
    try {
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(current_balance), 0)::int AS total
         FROM wallet
         WHERE clinic_id = $1`,
        [clinicId]
      );
      return rows[0].total;
    } catch (error) {
      logger.error('[CreditService.getClinicCreditsRemaining] failed:', error.message);
      throw error;
    }
  }

  /**
   * Check if sufficient credits available
   * @param {number} walletId
   * @param {number} requiredCredits
   * @returns {boolean}
   */
  async hasSufficientCredits(walletId, requiredCredits) {
    try {
      const wallet = await pool.query(
        `SELECT current_balance FROM wallet WHERE id = $1`,
        [walletId]
      );

      if (wallet.rows.length === 0) {
        return false;
      }

      return wallet.rows[0].current_balance >= requiredCredits;
    } catch (error) {
      logger.error('[CreditService.hasSufficientCredits] failed:', error.message);
      throw error;
    }
  }

  /**
   * Deduct credits from wallet
   * ONLY call this after successful AI execution
   *
   * @param {number} walletId
   * @param {string} aiFeature - 'ai_docassist', 'ai_scribe', 'ai_coding'
   * @param {number} credits - Credits to deduct
   * @param {string} requestId - Unique request ID for idempotency
   * @param {Object} metadata - Optional metadata
   * @returns {Object} Transaction record
   * @throws {Error} If deduction fails
   */
  async deductCredits(walletId, aiFeature, credits, requestId, metadata = {}) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check for idempotency - already processed?
      const existing = await client.query(
        `SELECT id FROM wallet_transactions
         WHERE wallet_id = $1 AND reference_id = $2 AND transaction_type = 'deduction'
         LIMIT 1`,
        [walletId, requestId]
      );

      if (existing.rows.length > 0) {
        logger.warn(`[CreditService] Duplicate deduction prevented: ${requestId}`);
        await client.query('COMMIT');
        return existing.rows[0];
      }

      // Lock wallet for update (prevent race conditions)
      const wallet = await client.query(
        `SELECT * FROM wallet WHERE id = $1 FOR UPDATE`,
        [walletId]
      );

      if (wallet.rows.length === 0) {
        throw new Error('Wallet not found');
      }

      const walletRow = wallet.rows[0];

      // Validate sufficient balance
      if (walletRow.current_balance < credits) {
        throw new Error(`Insufficient credits. Required: ${credits}, Available: ${walletRow.current_balance}`);
      }

      // Calculate new balance
      const newBalance = walletRow.current_balance - credits;

      // Create transaction record
      const { rows: txRows } = await client.query(
        `INSERT INTO wallet_transactions
           (wallet_id, transaction_type, service_type, amount, balance_before, balance_after, reference_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
         RETURNING *`,
        [
          walletId,
          'deduction',
          aiFeature,
          credits,
          walletRow.current_balance,
          newBalance,
          requestId,
          JSON.stringify(metadata),
        ]
      );

      // Update wallet balance
      await client.query(
        `UPDATE wallet
         SET current_balance = $1, lifetime_used = lifetime_used + $2, updated_at = NOW()
         WHERE id = $3`,
        [newBalance, credits, walletId]
      );

      // Log usage
      await client.query(
        `INSERT INTO wallet_service_usage (wallet_id, service_type, usage_date, count, credits_used)
         VALUES ($1, $2, CURRENT_DATE, 1, $3)
         ON CONFLICT (wallet_id, service_type, usage_date) DO UPDATE
         SET count = count + 1, credits_used = credits_used + $3`,
        [walletId, aiFeature, credits]
      );

      await client.query('COMMIT');

      logger.info(`[CreditService] Deducted ${credits} credits from wallet ${walletId} for ${aiFeature}`);
      return txRows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[CreditService.deductCredits] failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Refund credits (for failed requests)
   * @param {number} walletId
   * @param {number} credits
   * @param {string} reason
   * @param {string} relatedTransactionId
   * @returns {Object} Refund transaction
   */
  async refundCredits(walletId, credits, reason, relatedTransactionId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Lock wallet
      const wallet = await client.query(
        `SELECT * FROM wallet WHERE id = $1 FOR UPDATE`,
        [walletId]
      );

      if (wallet.rows.length === 0) {
        throw new Error('Wallet not found');
      }

      const walletRow = wallet.rows[0];
      const newBalance = walletRow.current_balance + credits;

      // Create refund transaction
      const { rows: txRows } = await client.query(
        `INSERT INTO wallet_transactions
           (wallet_id, transaction_type, amount, balance_before, balance_after, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
         RETURNING *`,
        [
          walletId,
          'refund',
          credits,
          walletRow.current_balance,
          newBalance,
          JSON.stringify({ reason, relatedTransactionId }),
        ]
      );

      // Update wallet
      await client.query(
        `UPDATE wallet
         SET current_balance = $1, updated_at = NOW()
         WHERE id = $2`,
        [newBalance, walletId]
      );

      await client.query('COMMIT');

      logger.info(`[CreditService] Refunded ${credits} credits to wallet ${walletId}. Reason: ${reason}`);
      return txRows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[CreditService.refundCredits] failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate unique request ID for idempotency
   * @param {number} clinicId
   * @param {string} aiFeature
   * @param {number} timestamp - Optional timestamp override
   * @returns {string} Unique request ID
   */
  generateRequestId(clinicId, aiFeature, timestamp = Date.now()) {
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    return `${clinicId}_${aiFeature}_${timestamp}_${randomSuffix}`;
  }

  /**
   * Get usage summary for clinic
   * @param {number} clinicId
   * @param {number} days - Days to look back
   * @returns {Object} Usage by AI feature
   */
  async getUsageSummary(clinicId, days = 30) {
    try {
      const { rows } = await pool.query(
        `SELECT
           wsu.service_type,
           SUM(wsu.count)::int AS usage_count,
           SUM(wsu.credits_used)::int AS credits_used
         FROM wallet_service_usage wsu
         JOIN wallet w ON w.id = wsu.wallet_id
         WHERE w.clinic_id = $1 AND wsu.usage_date >= CURRENT_DATE - INTERVAL '$2 days'
         GROUP BY wsu.service_type`,
        [clinicId, days]
      );

      const summary = {};
      rows.forEach(row => {
        summary[row.service_type] = {
          count: row.usage_count,
          creditsUsed: row.credits_used,
        };
      });

      return summary;
    } catch (error) {
      logger.error('[CreditService.getUsageSummary] failed:', error.message);
      throw error;
    }
  }
}

module.exports = new CreditService();
