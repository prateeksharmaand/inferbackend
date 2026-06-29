/**
 * EffectiveLicenseResolver - Single source of truth for licensing
 *
 * This service is THE critical piece. It resolves the complete license state
 * by combining:
 * - Subscription status
 * - Seat availability
 * - AI credits
 * - Feature access
 * - Usage limits
 *
 * Every access control decision is based on the EffectiveLicense object.
 */

const SubscriptionService = require('./SubscriptionService');
const SeatService = require('./SeatService');
const FeatureAccessService = require('./FeatureAccessService');
const CreditService = require('./CreditService');
const { pool } = require('../../config/database');
const logger = require('../../utils/logger');

class EffectiveLicenseResolver {
  /**
   * Resolve complete effective license for a user
   *
   * @param {number} clinicId
   * @param {number} staffId
   * @returns {Object} Effective license object - single source of truth
   * @throws {Error} If clinic/staff not found or subscription invalid
   */
  async resolveEffectiveLicense(clinicId, staffId) {
    try {
      logger.info(`[EffectiveLicenseResolver] Resolving license for clinic ${clinicId}, staff ${staffId}`);

      // Phase 1: Get subscription
      const subscription = await SubscriptionService.getSubscription(clinicId);

      if (!subscription) {
        // Create default base plan subscription
        await SubscriptionService.createSubscription(clinicId, {
          plan_key: 'base',
          billing_cycle: 'free',
          seat_count: 1,
        });
        return this.resolveEffectiveLicense(clinicId, staffId); // Retry
      }

      // Phase 2: Get staff seat information
      const { rows: staffRows } = await pool.query(
        `SELECT seat_type FROM emr_clinic_staff WHERE id = $1 AND clinic_id = $2`,
        [staffId, clinicId]
      );

      if (staffRows.length === 0) {
        throw new Error(`Staff ${staffId} not found in clinic ${clinicId}`);
      }

      const seatType = staffRows[0].seat_type || 'basic';
      const seatTypes = [seatType]; // User might have multiple seat types in future

      // Phase 3: Get subscription status
      const validity = SubscriptionService.isSubscriptionValid(subscription);

      if (!validity.isValid) {
        logger.warn(`[EffectiveLicenseResolver] Invalid subscription for clinic ${clinicId}: ${validity.reason}`);
      }

      // Phase 4: Get seat information
      const seatSummary = await SeatService.getSeatSummary(clinicId);

      // Phase 5: Get AI credits
      const wallet = await CreditService.getWallet(clinicId, staffId);
      const clinicCreditsRemaining = await CreditService.getClinicCreditsRemaining(clinicId);

      // Phase 6: Get usage
      const usage = await this._getUsage(clinicId);

      // Phase 7: Get subscription items (seats, add-ons)
      const items = await SubscriptionService.getSubscriptionItems(clinicId);

      // Phase 8: Extract plan features
      const planFeatures = subscription.features ? JSON.parse(subscription.features) : {};

      // Phase 9: Build EffectiveLicense object
      const effectiveLicense = {
        // Basic identification
        clinicId,
        staffId,
        resolvedAt: new Date().toISOString(),

        // Subscription state
        plan: subscription.plan_key,
        planName: subscription.display_name,
        status: validity.effectiveStatus, // 'active' | 'trial' | 'expired' | 'cancelled' | 'none'
        subscriptionValid: validity.isValid,

        // Subscription details
        subscriptionId: subscription.id,
        billingCycle: subscription.billing_cycle,
        startedAt: subscription.started_at,
        expiresAt: subscription.expires_at,
        daysUntilExpiry: SubscriptionService.getDaysUntilExpiry(subscription),

        // Seat information
        seatTypes, // ['premium'] or ['basic'] or ['premium', 'scribe']
        primarySeatType: seatType,
        seats: seatSummary, // {premium: {purchased: 5, used: 3, available: 2}, ...}

        // AI Credits
        aiCreditsRemaining: wallet?.current_balance || 0,
        clinicAiCreditsRemaining: clinicCreditsRemaining,
        walletId: wallet?.id || null,

        // Usage against limits
        usage, // {patients: {used: 50, limit: 100, pct: 50}, ...}

        // Plan limits
        limits: {
          maxUsers: subscription.max_users,
          maxPatients: subscription.max_patients,
          maxAppointments: subscription.max_appointments,
          maxPrescriptions: subscription.max_prescriptions,
          maxStorageMb: subscription.max_storage_mb,
        },

        // Features available in plan
        planFeatures, // {queue: true, billing: true, ai_docassist: true, ...}

        // Subscription items (seats, add-ons)
        items,

        // Helper flags
        isActive: validity.isValid && ['active', 'trial'].includes(validity.effectiveStatus),
        isExpired: validity.effectiveStatus === 'expired',
        isCancelled: validity.effectiveStatus === 'cancelled',
        isTrial: validity.effectiveStatus === 'trial',

        // Available features (computed)
        // - Use FeatureAccessService.getVisibleFeatures(effectiveLicense)
      };

      logger.info(`[EffectiveLicenseResolver] Resolved license: ${effectiveLicense.plan}/${effectiveLicense.status}`);
      return effectiveLicense;
    } catch (error) {
      logger.error('[EffectiveLicenseResolver.resolveEffectiveLicense] failed:', error.message);
      throw error;
    }
  }

  /**
   * Get usage against plan limits
   * @private
   * @param {number} clinicId
   * @returns {Object} Usage metrics
   */
  async _getUsage(clinicId) {
    try {
      const { rows: patients } = await pool.query(
        `SELECT COUNT(DISTINCT emr_patient_id)::int AS count FROM emr_appointments WHERE clinic_id = $1`,
        [clinicId]
      );

      const { rows: appointments } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM emr_appointments WHERE clinic_id = $1`,
        [clinicId]
      );

      const { rows: encounters } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM emr_encounters WHERE clinic_id = $1`,
        [clinicId]
      );

      return {
        patients: { used: patients[0].count || 0 },
        appointments: { used: appointments[0].count || 0 },
        prescriptions: { used: encounters[0].count || 0 }, // Using encounters as proxy
      };
    } catch (error) {
      logger.error('[EffectiveLicenseResolver._getUsage] failed:', error.message);
      // Return zeros on error to avoid blocking
      return { patients: { used: 0 }, appointments: { used: 0 }, prescriptions: { used: 0 } };
    }
  }

  /**
   * Validate effective license is still valid
   * (Should be called periodically to detect changes)
   *
   * @param {Object} effectiveLicense
   * @returns {boolean}
   */
  async isEffectiveLicenseStillValid(effectiveLicense) {
    try {
      const current = await this.resolveEffectiveLicense(
        effectiveLicense.clinicId,
        effectiveLicense.staffId
      );

      return (
        current.status === effectiveLicense.status &&
        current.subscriptionValid === effectiveLicense.subscriptionValid &&
        current.aiCreditsRemaining === effectiveLicense.aiCreditsRemaining
      );
    } catch (error) {
      logger.error('[EffectiveLicenseResolver.isEffectiveLicenseStillValid] failed:', error.message);
      return false;
    }
  }

  /**
   * Safely resolve license with fallback to base plan
   * Use when denial of service is worse than security issue
   *
   * @param {number} clinicId
   * @param {number} staffId
   * @returns {Object} Effective license
   */
  async resolveEffectiveLicenseSafely(clinicId, staffId) {
    try {
      return await this.resolveEffectiveLicense(clinicId, staffId);
    } catch (error) {
      logger.error('[EffectiveLicenseResolver.resolveEffectiveLicenseSafely] fallback triggered:', error.message);

      // Return minimal license object to prevent service disruption
      return {
        clinicId,
        staffId,
        resolvedAt: new Date().toISOString(),
        plan: 'base',
        planName: 'Base Plan',
        status: 'unknown',
        subscriptionValid: false,
        seatTypes: ['basic'],
        primarySeatType: 'basic',
        aiCreditsRemaining: 0,
        seats: {},
        usage: {},
        limits: {},
        planFeatures: {},
        items: [],
        isActive: false,
        isExpired: false,
        isCancelled: false,
        isTrial: false,
        error: error.message,
      };
    }
  }
}

module.exports = new EffectiveLicenseResolver();
