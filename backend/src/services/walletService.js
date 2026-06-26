/**
 * Wallet Service - Core business logic for credits system
 * Handles balance calculations, transactions, and ledger operations
 */

const db = require('../config/database');
const logger = require('../utils/logger');

class WalletService {
  /**
   * Create or get wallet for a clinic/doctor
   */
  async ensureWallet(clinicId, doctorId) {
    try {
      let wallet = await db.query(
        'SELECT * FROM wallet WHERE clinic_id = $1 AND doctor_id = $2',
        [clinicId, doctorId]
      );

      if (wallet.rows.length > 0) {
        return wallet.rows[0];
      }

      // Create new wallet
      const result = await db.query(
        `INSERT INTO wallet (clinic_id, doctor_id, current_balance, subscription_active)
         VALUES ($1, $2, 0, TRUE)
         RETURNING *`,
        [clinicId, doctorId]
      );

      // Create wallet settings
      await db.query(
        `INSERT INTO wallet_settings (wallet_id, low_balance_alert_threshold, email_receipts, sms_notifications)
         VALUES ($1, $2, TRUE, TRUE)`,
        [result.rows[0].id, 100]
      );

      logger.info(`Wallet created for clinic ${clinicId}, doctor ${doctorId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error ensuring wallet:', error);
      throw error;
    }
  }

  /**
   * Get wallet by ID with current balance
   */
  async getWalletById(walletId) {
    try {
      const result = await db.query(
        'SELECT * FROM wallet WHERE id = $1',
        [walletId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching wallet:', error);
      throw error;
    }
  }

  /**
   * Get wallet by clinic and doctor ID
   */
  async getWalletByClinicDoctor(clinicId, doctorId) {
    try {
      const result = await db.query(
        'SELECT * FROM wallet WHERE clinic_id = $1 AND doctor_id = $2',
        [clinicId, doctorId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching wallet:', error);
      throw error;
    }
  }

  /**
   * Check if wallet has sufficient balance for a service
   */
  async checkBalance(walletId, serviceType, quantity = 1) {
    try {
      const wallet = await this.getWalletById(walletId);
      if (!wallet) throw new Error('Wallet not found');

      if (wallet.is_locked) {
        throw new Error(`Wallet is locked: ${wallet.locked_reason}`);
      }

      if (!wallet.subscription_active) {
        throw new Error('Subscription is inactive. Please renew your subscription.');
      }

      const pricing = await this.getPricing(serviceType);
      if (!pricing) throw new Error(`Pricing not found for service: ${serviceType}`);

      const requiredCredits = parseFloat(pricing.base_price) * quantity;

      return {
        hasBalance: wallet.current_balance >= requiredCredits,
        currentBalance: wallet.current_balance,
        requiredCredits,
        pricing,
      };
    } catch (error) {
      logger.error(`Error checking balance for wallet ${walletId}:`, error);
      throw error;
    }
  }

  /**
   * Deduct credits from wallet (with transaction logging)
   * Includes idempotency via reference_id
   */
  async deductCredits(walletId, serviceType, quantity = 1, referenceId = null, metadata = null) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Lock wallet row to prevent race conditions
      const wallet = await client.query(
        'SELECT * FROM wallet WHERE id = $1 FOR UPDATE',
        [walletId]
      );

      if (wallet.rows.length === 0) throw new Error('Wallet not found');
      const walletRow = wallet.rows[0];

      // Check subscription
      if (!walletRow.subscription_active) {
        throw new Error('Subscription inactive');
      }

      // Check if transaction already exists (idempotency)
      if (referenceId) {
        const existing = await client.query(
          'SELECT id FROM wallet_transactions WHERE wallet_id = $1 AND reference_id = $2 LIMIT 1',
          [walletId, referenceId]
        );
        if (existing.rows.length > 0) {
          await client.query('COMMIT');
          logger.warn(`Idempotent request - transaction already exists: ${referenceId}`);
          return existing.rows[0].id;
        }
      }

      // Get pricing
      const pricing = await client.query(
        'SELECT * FROM wallet_pricing WHERE service_type = $1 AND enabled = TRUE',
        [serviceType]
      );

      if (pricing.rows.length === 0) throw new Error(`Pricing not found for ${serviceType}`);
      const pricingRow = pricing.rows[0];

      const requiredCredits = parseFloat(pricingRow.base_price) * quantity;

      if (walletRow.current_balance < requiredCredits) {
        throw new Error('Insufficient balance');
      }

      const newBalance = parseFloat(walletRow.current_balance) - requiredCredits;

      // Create transaction record
      const transaction = await client.query(
        `INSERT INTO wallet_transactions
         (wallet_id, transaction_type, service_type, amount, balance_before, balance_after, reference_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          walletId,
          'deduction',
          serviceType,
          requiredCredits,
          walletRow.current_balance,
          newBalance,
          referenceId || null,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );

      // Update wallet balance
      await client.query(
        `UPDATE wallet
         SET current_balance = $1, lifetime_used = lifetime_used + $2, version = version + 1, updated_at = NOW()
         WHERE id = $3`,
        [newBalance, requiredCredits, walletId]
      );

      // Update service usage analytics
      await client.query(
        `INSERT INTO wallet_service_usage (wallet_id, service_type, usage_date, count, credits_used)
         VALUES ($1, $2, CURRENT_DATE, $3, $4)
         ON CONFLICT (wallet_id, service_type, usage_date)
         DO UPDATE SET count = count + $3, credits_used = credits_used + $4`,
        [walletId, serviceType, quantity, requiredCredits]
      );

      // Log audit
      await this.logAudit(client, walletId, 'DEDUCT_CREDITS', null, {
        service_type: serviceType,
        amount: requiredCredits,
      });

      await client.query('COMMIT');

      logger.info(`Credits deducted from wallet ${walletId}: ${requiredCredits} for ${serviceType}`);
      return transaction.rows[0].id;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error deducting credits from wallet ${walletId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add credits via purchase
   */
  async addCredits(walletId, amount, paymentOrderId, referenceId = null) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const wallet = await client.query(
        'SELECT * FROM wallet WHERE id = $1 FOR UPDATE',
        [walletId]
      );

      if (wallet.rows.length === 0) throw new Error('Wallet not found');
      const walletRow = wallet.rows[0];

      // Idempotency check
      if (referenceId) {
        const existing = await client.query(
          'SELECT id FROM wallet_transactions WHERE wallet_id = $1 AND reference_id = $2',
          [walletId, referenceId]
        );
        if (existing.rows.length > 0) {
          await client.query('COMMIT');
          return existing.rows[0].id;
        }
      }

      const newBalance = parseFloat(walletRow.current_balance) + parseFloat(amount);

      const transaction = await client.query(
        `INSERT INTO wallet_transactions
         (wallet_id, transaction_type, amount, balance_before, balance_after, payment_order_id, reference_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          walletId,
          'purchase',
          amount,
          walletRow.current_balance,
          newBalance,
          paymentOrderId,
          referenceId || null,
        ]
      );

      await client.query(
        `UPDATE wallet
         SET current_balance = $1, lifetime_purchased = lifetime_purchased + $2, version = version + 1, updated_at = NOW()
         WHERE id = $3`,
        [newBalance, amount, walletId]
      );

      await this.logAudit(client, walletId, 'ADD_CREDITS', null, {
        amount,
        payment_order_id: paymentOrderId,
      });

      await client.query('COMMIT');

      logger.info(`Credits added to wallet ${walletId}: ${amount}`);
      return transaction.rows[0].id;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error adding credits to wallet ${walletId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get wallet summary statistics
   */
  async getWalletSummary(walletId) {
    try {
      const wallet = await this.getWalletById(walletId);
      if (!wallet) throw new Error('Wallet not found');

      // Get today's usage
      const todayUsage = await db.query(
        `SELECT COALESCE(SUM(count), 0) as total_transactions,
                COALESCE(SUM(credits_used), 0) as credits_used
         FROM wallet_service_usage
         WHERE wallet_id = $1 AND usage_date = CURRENT_DATE`,
        [walletId]
      );

      // Get this month's usage
      const monthUsage = await db.query(
        `SELECT COALESCE(SUM(count), 0) as total_transactions,
                COALESCE(SUM(credits_used), 0) as credits_used
         FROM wallet_service_usage
         WHERE wallet_id = $1 AND DATE_TRUNC('month', usage_date) = DATE_TRUNC('month', CURRENT_DATE)`,
        [walletId]
      );

      // Get recent transactions
      const recent = await db.query(
        `SELECT * FROM wallet_transactions
         WHERE wallet_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [walletId]
      );

      // Estimate days remaining
      const avgDailyUsage = parseFloat(todayUsage.rows[0]?.credits_used || 0);
      const daysRemaining = avgDailyUsage > 0
        ? Math.floor(wallet.current_balance / avgDailyUsage)
        : -1;

      return {
        currentBalance: wallet.current_balance,
        lifetimePurchased: wallet.lifetime_purchased,
        lifetimeUsed: wallet.lifetime_used,
        subscriptionActive: wallet.subscription_active,
        todayTransactions: todayUsage.rows[0].total_transactions,
        todayCreditsUsed: todayUsage.rows[0].credits_used,
        monthTransactions: monthUsage.rows[0].total_transactions,
        monthCreditsUsed: monthUsage.rows[0].credits_used,
        daysRemaining,
        recentTransactions: recent.rows,
      };
    } catch (error) {
      logger.error(`Error fetching wallet summary for ${walletId}:`, error);
      throw error;
    }
  }

  /**
   * Get transaction history with filters
   */
  async getTransactionHistory(walletId, filters = {}) {
    try {
      let query = 'SELECT * FROM wallet_transactions WHERE wallet_id = $1';
      const params = [walletId];

      // Date filters
      if (filters.fromDate) {
        query += ` AND created_at >= $${params.length + 1}::timestamp`;
        params.push(filters.fromDate);
      }
      if (filters.toDate) {
        query += ` AND created_at < $${params.length + 1}::timestamp`;
        params.push(filters.toDate);
      }

      // Service filter
      if (filters.serviceType) {
        query += ` AND service_type = $${params.length + 1}`;
        params.push(filters.serviceType);
      }

      // Transaction type filter
      if (filters.transactionType) {
        query += ` AND transaction_type = $${params.length + 1}`;
        params.push(filters.transactionType);
      }

      // Pagination
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error(`Error fetching transactions for wallet ${walletId}:`, error);
      throw error;
    }
  }

  /**
   * Get pricing for a service
   */
  async getPricing(serviceType) {
    try {
      const result = await db.query(
        'SELECT * FROM wallet_pricing WHERE service_type = $1 AND enabled = TRUE',
        [serviceType]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error fetching pricing for ${serviceType}:`, error);
      throw error;
    }
  }

  /**
   * Get all packs
   */
  async getPacks() {
    try {
      const result = await db.query(
        'SELECT * FROM wallet_packs WHERE enabled = TRUE ORDER BY sort_order, popularity_rank',
        []
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching packs:', error);
      throw error;
    }
  }

  /**
   * Audit logging
   */
  async logAudit(client, walletId, action, oldValues = null, newValues = null, ipAddress = null) {
    try {
      const connQuery = client ? 'client.query' : 'db.query';
      const dbConn = client || db;

      await dbConn.query(
        `INSERT INTO wallet_audit_log (wallet_id, action, new_values, ip_address)
         VALUES ($1, $2, $3, $4)`,
        [walletId, action, newValues ? JSON.stringify(newValues) : null, ipAddress || null]
      );
    } catch (error) {
      logger.error('Error logging audit:', error);
      // Don't throw - audit log failure shouldn't block operations
    }
  }

  /**
   * Lock wallet (admin action)
   */
  async lockWallet(walletId, reason) {
    try {
      const result = await db.query(
        `UPDATE wallet
         SET is_locked = TRUE, locked_reason = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [reason, walletId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error(`Error locking wallet ${walletId}:`, error);
      throw error;
    }
  }

  /**
   * Unlock wallet (admin action)
   */
  async unlockWallet(walletId) {
    try {
      const result = await db.query(
        `UPDATE wallet
         SET is_locked = FALSE, locked_reason = NULL, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [walletId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error(`Error unlocking wallet ${walletId}:`, error);
      throw error;
    }
  }
}

module.exports = new WalletService();
