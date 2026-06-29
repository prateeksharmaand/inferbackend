const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const EffectiveLicenseResolver = require('../services/subscription/EffectiveLicenseResolver');
const logger = require('../utils/logger');

// Require authentication for all routes
router.use(authenticate);

/**
 * GET /api/subscription/license
 * Returns the EffectiveLicense for the authenticated user
 * 
 * This is the single source of truth for subscription state.
 * Used by frontend to determine feature availability, seat limits, and credits.
 */
router.get('/license', async (req, res) => {
  try {
    const { clinicId, staffId } = req.emrUser;

    if (!clinicId || !staffId) {
      return res.status(401).json({
        error: 'authentication_error',
        message: 'Invalid authentication context',
      });
    }

    logger.info(`[SubscriptionAPI] Resolving license for clinic ${clinicId}, staff ${staffId}`);

    // Resolve the effective license (single source of truth)
    const effectiveLicense = await EffectiveLicenseResolver.resolveEffectiveLicense(clinicId, staffId);

    // Return the complete license object
    res.json(effectiveLicense);
  } catch (error) {
    logger.error('[SubscriptionAPI.license] failed:', error.message);

    // Fail-closed: Return error rather than allowing access
    res.status(500).json({
      error: 'subscription_error',
      message: 'Failed to resolve subscription license',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/subscription/payment-history
 * Returns payment history for the clinic
 */
router.get('/payment-history', async (req, res) => {
  try {
    const { clinicId } = req.emrUser;
    const BillingService = require('../services/subscription/BillingService');

    const history = await BillingService.getPaymentHistory(clinicId, 20);

    res.json({
      clinicId,
      payments: history,
      count: history.length,
    });
  } catch (error) {
    logger.error('[SubscriptionAPI.payment-history] failed:', error.message);
    res.status(500).json({
      error: 'billing_error',
      message: 'Failed to fetch payment history',
    });
  }
});

/**
 * GET /api/subscription/proration
 * Calculate proration for plan upgrade
 * Query params: fromPlan, toPlan, billingCycle
 */
router.get('/proration', async (req, res) => {
  try {
    const { clinicId } = req.emrUser;
    const { fromPlan, toPlan, billingCycle = 'monthly' } = req.query;

    if (!fromPlan || !toPlan) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'fromPlan and toPlan are required',
      });
    }

    const BillingService = require('../services/subscription/BillingService');
    const proration = await BillingService.calculateProration(
      clinicId,
      fromPlan,
      toPlan,
      billingCycle
    );

    res.json(proration);
  } catch (error) {
    logger.error('[SubscriptionAPI.proration] failed:', error.message);
    res.status(500).json({
      error: 'proration_error',
      message: 'Failed to calculate proration',
    });
  }
});

/**
 * POST /api/subscription/create-order
 * Create a payment order for subscription purchase/upgrade
 * Body: { planKey, billingCycle }
 */
router.post('/create-order', async (req, res) => {
  try {
    const { clinicId } = req.emrUser;
    const { planKey, billingCycle = 'monthly' } = req.body;

    if (!planKey) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'planKey is required',
      });
    }

    const BillingService = require('../services/subscription/BillingService');
    const order = await BillingService.createPaymentOrder(clinicId, planKey, billingCycle);

    res.json({
      success: true,
      order,
      message: 'Payment order created. Proceed to payment gateway.',
    });
  } catch (error) {
    logger.error('[SubscriptionAPI.create-order] failed:', error.message);
    res.status(500).json({
      error: 'order_error',
      message: 'Failed to create payment order',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;
