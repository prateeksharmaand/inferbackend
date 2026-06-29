/**
 * Subscription Enforcement Middleware - Phase 7
 *
 * UNIVERSAL middleware that runs on ALL protected routes.
 *
 * Execution Flow:
 * 1. Authentication (already done by upstream middleware)
 * 2. Resolve Effective License (single source of truth)
 * 3. Validate Feature Access
 * 4. Validate Usage Limits
 * 5. Validate Seat Availability
 * 6. Pass to Controller
 *
 * Every request validates subscription exactly once.
 */

const logger = require('../utils/logger');
const EffectiveLicenseResolver = require('../services/subscription/EffectiveLicenseResolver');
const FeatureAccessService = require('../services/subscription/FeatureAccessService');
const SeatService = require('../services/subscription/SeatService');

/**
 * Main subscription enforcement middleware
 *
 * Usage: router.use('/api/protected', enforceSubscription());
 */
function enforceSubscription() {
  return async (req, res, next) => {
    try {
      // Get clinic and staff IDs from authenticated user
      const clinicId = req.emrUser?.clinic_id;
      const staffId = req.emrUser?.id;

      if (!clinicId || !staffId) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'User context not found',
        });
      }

      // === PHASE 1: Resolve Effective License ===
      const effectiveLicense = await EffectiveLicenseResolver.resolveEffectiveLicense(clinicId, staffId);

      // Attach to request for use in controllers
      req.effectiveLicense = effectiveLicense;

      // === PHASE 2: Validate Subscription Active ===
      if (!effectiveLicense.subscriptionValid) {
        return res.status(402).json({
          error: 'subscription_invalid',
          reason: effectiveLicense.status,
          message: `Subscription is ${effectiveLicense.status}. Please renew.`,
        });
      }

      // === PHASE 3: Pass Effective License to Controller ===
      // Controllers will use req.effectiveLicense for feature gating
      next();
    } catch (error) {
      logger.error('[subscriptionEnforcement] middleware failed:', error.message);

      // FAIL CLOSED - don't allow request through on error
      return res.status(500).json({
        error: 'subscription_validation_failed',
        message: 'Unable to validate subscription. Please try again later.',
        detail: error.message,
      });
    }
  };
}

/**
 * Feature-specific enforcement middleware
 *
 * Usage: router.post('/reports', enforceFeature('analytics'), createReport);
 */
function enforceFeature(featureKey) {
  return async (req, res, next) => {
    try {
      if (!req.effectiveLicense) {
        // Fallback if enforceSubscription() wasn't used
        return res.status(500).json({
          error: 'middleware_error',
          message: 'Subscription middleware not configured',
        });
      }

      // Validate feature access
      const result = FeatureAccessService.validateFeatureAccess(req.effectiveLicense, featureKey);

      if (!result.accessible) {
        return res.status(402).json({
          error: 'feature_access_denied',
          reason: result.reason,
          details: result,
          feature: result.feature,
          message: `Feature '${result.feature}' is not available on your current plan.`,
        });
      }

      next();
    } catch (error) {
      logger.error('[enforceFeature] middleware failed:', error.message);
      return res.status(500).json({
        error: 'feature_validation_failed',
        message: 'Unable to validate feature access.',
      });
    }
  };
}

/**
 * Usage limit enforcement middleware
 *
 * Usage: router.post('/patients', enforceUsageLimit('patients'), createPatient);
 */
function enforceUsageLimit(resourceType) {
  return async (req, res, next) => {
    try {
      if (!req.effectiveLicense) {
        return res.status(500).json({
          error: 'middleware_error',
          message: 'Subscription middleware not configured',
        });
      }

      const license = req.effectiveLicense;
      const limit = license.limits[`max${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}`];
      const usage = license.usage[resourceType]?.used || 0;

      if (limit && limit !== -1 && usage >= limit) {
        return res.status(402).json({
          error: 'usage_limit_exceeded',
          resource: resourceType,
          limit,
          used: usage,
          message: `You have reached your ${resourceType} limit (${limit}). Upgrade to increase limits.`,
        });
      }

      next();
    } catch (error) {
      logger.error('[enforceUsageLimit] middleware failed:', error.message);
      return res.status(500).json({
        error: 'usage_validation_failed',
        message: 'Unable to validate usage limits.',
      });
    }
  };
}

/**
 * Seat type enforcement middleware
 * Validates user has required seat type for operation
 *
 * Usage: router.post('/prescriptions', enforceSeatType('premium'), createPrescription);
 */
function enforceSeatType(requiredSeatType) {
  return async (req, res, next) => {
    try {
      if (!req.effectiveLicense) {
        return res.status(500).json({
          error: 'middleware_error',
          message: 'Subscription middleware not configured',
        });
      }

      if (!req.effectiveLicense.seatTypes.includes(requiredSeatType)) {
        return res.status(403).json({
          error: 'seat_type_not_allowed',
          requiredSeatType,
          userSeatType: req.effectiveLicense.primarySeatType,
          message: `This action requires a ${requiredSeatType} seat. Your seat type is ${req.effectiveLicense.primarySeatType}.`,
        });
      }

      next();
    } catch (error) {
      logger.error('[enforceSeatType] middleware failed:', error.message);
      return res.status(500).json({
        error: 'seat_validation_failed',
        message: 'Unable to validate seat type.',
      });
    }
  };
}

/**
 * AI credit validation middleware
 * Checks AI credits before allowing AI feature access
 * NOTE: Credits are only deducted AFTER successful AI execution
 *
 * Usage: router.post('/ai/docassist', enforceAiCredits(1), docassistHandler);
 */
function enforceAiCredits(requiredCredits) {
  return async (req, res, next) => {
    try {
      if (!req.effectiveLicense) {
        return res.status(500).json({
          error: 'middleware_error',
          message: 'Subscription middleware not configured',
        });
      }

      const license = req.effectiveLicense;

      if (license.aiCreditsRemaining < requiredCredits) {
        return res.status(402).json({
          error: 'insufficient_ai_credits',
          required: requiredCredits,
          available: license.aiCreditsRemaining,
          message: `Insufficient AI credits. Required: ${requiredCredits}, Available: ${license.aiCreditsRemaining}`,
        });
      }

      // Store required credits for later deduction
      req.aiCreditsRequired = requiredCredits;

      next();
    } catch (error) {
      logger.error('[enforceAiCredits] middleware failed:', error.message);
      return res.status(500).json({
        error: 'ai_credit_validation_failed',
        message: 'Unable to validate AI credits.',
      });
    }
  };
}

/**
 * Pro-only feature middleware (backward compatibility)
 *
 * Usage: router.post('/reports', proOnly(), createReport);
 */
function proOnly() {
  return enforceFeature('analytics'); // Traits to pro features
}

/**
 * Middleware to log all subscription access decisions
 * (For audit trail)
 */
function logSubscriptionDecisions() {
  return async (req, res, next) => {
    const originalSend = res.send;

    res.send = function(data) {
      if (res.statusCode >= 400 && req.effectiveLicense) {
        logger.info('[subscription-audit]', {
          timestamp: new Date().toISOString(),
          clinicId: req.effectiveLicense.clinicId,
          staffId: req.effectiveLicense.staffId,
          endpoint: req.originalUrl,
          method: req.method,
          statusCode: res.statusCode,
          plan: req.effectiveLicense.plan,
          reason: req.body?.error || res.statusMessage,
        });
      }

      return originalSend.call(this, data);
    };

    next();
  };
}

module.exports = {
  enforceSubscription,
  enforceFeature,
  enforceUsageLimit,
  enforceSeatType,
  enforceAiCredits,
  proOnly,
  logSubscriptionDecisions,
};
