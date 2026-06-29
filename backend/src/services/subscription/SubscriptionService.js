/**
 * SubscriptionService - Central subscription management
 *
 * Single source of truth for ALL subscription-related decisions.
 * No controller should directly access subscription tables.
 * All subscription logic flows through this service.
 */

const { pool } = require('../../config/database');
const logger = require('../../utils/logger');

class SubscriptionService {
  /**
   * Get subscription with all related data
   * @param {number} clinicId
   * @returns {Object|null} Subscription with plan details
   */
  async getSubscription(clinicId) {
    try {
      const { rows } = await pool.query(
        `SELECT
           cs.id, cs.clinic_id, cs.plan_id, cs.seat_count, cs.billing_cycle,
           cs.status, cs.started_at, cs.expires_at, cs.razorpay_order_id,
           cs.razorpay_payment_id, cs.notes, cs.created_at, cs.updated_at,
           sp.key AS plan_key, sp.display_name, sp.tagline,
           sp.max_users, sp.max_patients, sp.max_appointments, sp.max_prescriptions,
           sp.max_storage_mb, sp.features, sp.price_monthly, sp.price_yearly,
           sp.price_2year, sp.price_3year
         FROM clinic_subscriptions cs
         JOIN subscription_plans sp ON sp.id = cs.plan_id
         WHERE cs.clinic_id = $1`,
        [clinicId]
      );

      if (rows.length === 0) {
        return null;
      }

      return rows[0];
    } catch (error) {
      logger.error('[SubscriptionService.getSubscription] failed:', error.message);
      throw error;
    }
  }

  /**
   * Get subscription items (seats + add-ons)
   * @param {number} clinicId
   * @returns {Array} Subscription line items
   */
  async getSubscriptionItems(clinicId) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM clinic_subscription_items
         WHERE clinic_id = $1
         ORDER BY item_type, id`,
        [clinicId]
      );
      return rows;
    } catch (error) {
      logger.error('[SubscriptionService.getSubscriptionItems] failed:', error.message);
      throw error;
    }
  }

  /**
   * Check if subscription is currently active and valid
   * @param {Object} subscription
   * @returns {Object} {isValid, reason, effectiveStatus}
   */
  isSubscriptionValid(subscription) {
    if (!subscription) {
      return { isValid: false, reason: 'no_subscription', effectiveStatus: 'none' };
    }

    // Check status
    if (subscription.status === 'cancelled') {
      return { isValid: false, reason: 'cancelled', effectiveStatus: 'cancelled' };
    }

    if (subscription.status === 'suspended') {
      return { isValid: false, reason: 'suspended', effectiveStatus: 'suspended' };
    }

    // Check expiry
    if (subscription.expires_at) {
      const expiryDate = new Date(subscription.expires_at);
      const now = new Date();

      if (expiryDate < now) {
        return { isValid: false, reason: 'expired', effectiveStatus: 'expired' };
      }
    }

    // Allow active and trial states
    if (['active', 'trial'].includes(subscription.status)) {
      return { isValid: true, reason: 'valid', effectiveStatus: subscription.status };
    }

    return { isValid: false, reason: 'unknown_status', effectiveStatus: subscription.status };
  }

  /**
   * Get subscription status enum
   * @param {Object} subscription
   * @returns {string} 'active' | 'trial' | 'expired' | 'cancelled' | 'suspended' | 'none'
   */
  getEffectiveStatus(subscription) {
    const validity = this.isSubscriptionValid(subscription);
    return validity.effectiveStatus;
  }

  /**
   * Calculate days until expiry
   * @param {Object} subscription
   * @returns {number|null} Days remaining, or null if no expiry
   */
  getDaysUntilExpiry(subscription) {
    if (!subscription?.expires_at) {
      return null;
    }

    const expiryDate = new Date(subscription.expires_at);
    const now = new Date();
    const diffTime = expiryDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays > 0 ? diffDays : 0;
  }

  /**
   * Validate subscription state (throw on invalid)
   * @param {number} clinicId
   * @throws {Error} If subscription is invalid
   */
  async validateSubscriptionActive(clinicId) {
    const subscription = await this.getSubscription(clinicId);

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const validity = this.isSubscriptionValid(subscription);

    if (!validity.isValid) {
      const error = new Error(`Subscription is ${validity.reason}`);
      error.code = 'SUBSCRIPTION_INVALID';
      error.reason = validity.reason;
      error.status = 402;
      throw error;
    }

    return subscription;
  }

  /**
   * Update subscription (admin only)
   * @param {number} clinicId
   * @param {Object} updates {plan_key, status, billing_cycle, expires_at, notes}
   * @returns {Object} Updated subscription
   */
  async updateSubscription(clinicId, updates) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Validate plan_key if provided
      if (updates.plan_key) {
        const { rows: planRows } = await client.query(
          'SELECT id FROM subscription_plans WHERE key = $1',
          [updates.plan_key]
        );

        if (planRows.length === 0) {
          throw new Error(`Plan not found: ${updates.plan_key}`);
        }

        updates.plan_id = planRows[0].id;
        delete updates.plan_key;
      }

      // Validate status enum
      if (updates.status) {
        const validStatuses = ['active', 'trial', 'expired', 'cancelled', 'suspended'];
        if (!validStatuses.includes(updates.status)) {
          throw new Error(`Invalid status: ${updates.status}`);
        }
      }

      // Build update query dynamically
      const sets = [];
      const values = [];
      let paramCount = 1;

      Object.entries(updates).forEach(([key, value]) => {
        sets.push(`${key} = $${paramCount++}`);
        values.push(value);
      });

      sets.push(`updated_at = NOW()`);
      values.push(clinicId); // For WHERE clause

      const { rows } = await client.query(
        `UPDATE clinic_subscriptions
         SET ${sets.join(', ')}
         WHERE clinic_id = $${paramCount}
         RETURNING *`,
        values
      );

      if (rows.length === 0) {
        throw new Error('Subscription not found');
      }

      // Log change
      await client.query(
        `INSERT INTO subscription_audit_log (clinic_id, action, old_values, new_values, updated_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [clinicId, 'subscription_updated', JSON.stringify({}), JSON.stringify(updates)]
      );

      await client.query('COMMIT');

      logger.info(`[SubscriptionService] Updated subscription for clinic ${clinicId}`);
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[SubscriptionService.updateSubscription] failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create/activate subscription for clinic
   * @param {number} clinicId
   * @param {Object} params {plan_key, billing_cycle, seat_count, expires_at}
   * @returns {Object} Created subscription
   */
  async createSubscription(clinicId, params) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get plan
      const { rows: planRows } = await client.query(
        'SELECT id FROM subscription_plans WHERE key = $1',
        [params.plan_key]
      );

      if (planRows.length === 0) {
        throw new Error(`Plan not found: ${params.plan_key}`);
      }

      const planId = planRows[0].id;

      // Create subscription
      const { rows } = await client.query(
        `INSERT INTO clinic_subscriptions
           (clinic_id, plan_id, seat_count, billing_cycle, status, expires_at)
         VALUES ($1, $2, $3, $4, 'active', $5)
         ON CONFLICT (clinic_id) DO UPDATE SET
           plan_id = EXCLUDED.plan_id,
           seat_count = EXCLUDED.seat_count,
           billing_cycle = EXCLUDED.billing_cycle,
           status = 'active',
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()
         RETURNING *`,
        [clinicId, planId, params.seat_count || 1, params.billing_cycle, params.expires_at || null]
      );

      await client.query('COMMIT');

      logger.info(`[SubscriptionService] Created subscription for clinic ${clinicId} on plan ${params.plan_key}`);
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[SubscriptionService.createSubscription] failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if subscription status has changed
   * @param {Object} oldSubscription
   * @param {Object} newSubscription
   * @returns {boolean}
   */
  hasSubscriptionChanged(oldSubscription, newSubscription) {
    return (
      oldSubscription?.status !== newSubscription?.status ||
      oldSubscription?.plan_id !== newSubscription?.plan_id ||
      oldSubscription?.seat_count !== newSubscription?.seat_count ||
      oldSubscription?.expires_at !== newSubscription?.expires_at
    );
  }
}

module.exports = new SubscriptionService();
