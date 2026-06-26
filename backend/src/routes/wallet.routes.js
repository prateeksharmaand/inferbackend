/**
 * Wallet Routes - Credit system APIs
 * POST   /wallet/init                 - Initialize wallet
 * GET    /wallet                      - Get wallet details
 * GET    /wallet/summary              - Get wallet summary
 * GET    /wallet/history              - Get transaction history
 * GET    /wallet/packs                - Get available packs
 * POST   /wallet/recharge/order       - Create payment order
 * POST   /wallet/recharge/verify      - Verify payment
 * POST   /wallet/deduct               - Internal: Deduct credits
 * POST   /wallet/check-balance        - Check if balance is sufficient
 * POST   /wallet/webhook/razorpay     - Razorpay webhook
 * Admin routes
 * POST   /wallet/admin/pricing        - Create/update pricing
 * GET    /wallet/admin/pricing        - Get all pricing
 * POST   /wallet/admin/refund         - Issue refund
 * POST   /wallet/admin/adjust         - Adjust wallet balance
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const walletService = require('../services/walletService');
const paymentGatewayService = require('../services/paymentGatewayService');
const db = require('../config/database');
const logger = require('../utils/logger');

const requireAuth = authMiddleware;

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Get wallet from request (clinic_id and doctor_id from auth token)
 */
const getWallet = async (req, res, next) => {
  try {
    const { clinicId, doctorId } = req.user;

    let wallet = await walletService.getWalletByClinicDoctor(clinicId, doctorId);

    if (!wallet) {
      wallet = await walletService.ensureWallet(clinicId, doctorId);
    }

    req.wallet = wallet;
    next();
  } catch (error) {
    logger.error('Error getting wallet:', error);
    res.status(500).json({ error: 'Error fetching wallet' });
  }
};

// ============================================================================
// WALLET ENDPOINTS
// ============================================================================

/**
 * POST /wallet/init
 * Initialize wallet for a clinic (called once on signup)
 */
router.post('/init', requireAuth, async (req, res) => {
  try {
    const { clinicId, doctorId } = req.user;

    const wallet = await walletService.ensureWallet(clinicId, doctorId);

    res.json({
      success: true,
      wallet: {
        id: wallet.id,
        currentBalance: wallet.current_balance,
        subscriptionActive: wallet.subscription_active,
      },
    });
  } catch (error) {
    logger.error('Error initializing wallet:', error);
    res.status(500).json({ error: 'Error initializing wallet' });
  }
});

/**
 * GET /wallet
 * Get wallet details
 */
router.get('/', requireAuth, getWallet, async (req, res) => {
  try {
    const wallet = await walletService.getWalletById(req.wallet.id);

    res.json({
      success: true,
      wallet: {
        id: wallet.id,
        currentBalance: parseFloat(wallet.current_balance),
        lifetimePurchased: parseFloat(wallet.lifetime_purchased),
        lifetimeUsed: parseFloat(wallet.lifetime_used),
        subscriptionActive: wallet.subscription_active,
        subscriptionExpiresAt: wallet.subscription_expires_at,
        isLocked: wallet.is_locked,
        lockedReason: wallet.locked_reason,
      },
    });
  } catch (error) {
    logger.error('Error fetching wallet:', error);
    res.status(500).json({ error: 'Error fetching wallet' });
  }
});

/**
 * GET /wallet/summary
 * Get wallet summary with analytics
 */
router.get('/summary', requireAuth, getWallet, async (req, res) => {
  try {
    const summary = await walletService.getWalletSummary(req.wallet.id);

    res.json({
      success: true,
      summary: {
        currentBalance: parseFloat(summary.currentBalance),
        lifetimePurchased: parseFloat(summary.lifetimePurchased),
        lifetimeUsed: parseFloat(summary.lifetimeUsed),
        subscriptionActive: summary.subscriptionActive,
        todayTransactions: summary.todayTransactions,
        todayCreditsUsed: parseFloat(summary.todayCreditsUsed),
        monthTransactions: summary.monthTransactions,
        monthCreditsUsed: parseFloat(summary.monthCreditsUsed),
        daysRemaining: summary.daysRemaining,
        recentTransactions: summary.recentTransactions.map((t) => ({
          id: t.id,
          type: t.transaction_type,
          service: t.service_type,
          amount: parseFloat(t.amount),
          balanceAfter: parseFloat(t.balance_after),
          createdAt: t.created_at,
        })),
      },
    });
  } catch (error) {
    logger.error('Error fetching wallet summary:', error);
    res.status(500).json({ error: 'Error fetching wallet summary' });
  }
});

/**
 * GET /wallet/history
 * Get transaction history with filters
 * Query params: fromDate, toDate, serviceType, transactionType, limit, offset
 */
router.get('/history', requireAuth, getWallet, async (req, res) => {
  try {
    const filters = {
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      serviceType: req.query.serviceType,
      transactionType: req.query.transactionType,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
    };

    const transactions = await walletService.getTransactionHistory(req.wallet.id, filters);

    res.json({
      success: true,
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.transaction_type,
        service: t.service_type,
        amount: parseFloat(t.amount),
        balanceBefore: parseFloat(t.balance_before),
        balanceAfter: parseFloat(t.balance_after),
        referenceId: t.reference_id,
        metadata: t.metadata,
        createdAt: t.created_at,
      })),
    });
  } catch (error) {
    logger.error('Error fetching transaction history:', error);
    res.status(500).json({ error: 'Error fetching transaction history' });
  }
});

/**
 * GET /wallet/packs
 * Get available credit packs
 */
router.get('/packs', async (req, res) => {
  try {
    const packs = await walletService.getPacks();

    res.json({
      success: true,
      packs: packs.map((p) => ({
        id: p.id,
        name: p.pack_name,
        credits: parseFloat(p.credit_quantity),
        priceInr: parseFloat(p.price_inr),
        gstAmount: parseFloat(p.gst_amount),
        totalAmount: parseFloat(p.total_amount),
        discount: parseFloat(p.discount_percentage),
        isPopular: p.popularity_rank === 2,
        isBestValue: p.is_best_value,
      })),
    });
  } catch (error) {
    logger.error('Error fetching packs:', error);
    res.status(500).json({ error: 'Error fetching packs' });
  }
});

/**
 * POST /wallet/check-balance
 * Check if wallet has sufficient balance
 * Body: { serviceType, quantity }
 */
router.post('/check-balance', requireAuth, getWallet, async (req, res) => {
  try {
    const { serviceType, quantity = 1 } = req.body;

    if (!serviceType) {
      return res.status(400).json({ error: 'serviceType is required' });
    }

    const balance = await walletService.checkBalance(req.wallet.id, serviceType, quantity);

    res.json({
      success: true,
      hasBalance: balance.hasBalance,
      currentBalance: parseFloat(balance.currentBalance),
      requiredCredits: parseFloat(balance.requiredCredits),
      pricing: {
        service: balance.pricing.service_type,
        pricePerUnit: parseFloat(balance.pricing.base_price),
      },
    });
  } catch (error) {
    logger.error('Error checking balance:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PAYMENT ENDPOINTS
// ============================================================================

/**
 * POST /wallet/recharge/order
 * Create payment order
 * Body: { packId } OR { customAmount }
 */
router.post('/recharge/order', requireAuth, getWallet, async (req, res) => {
  try {
    const { packId, customAmount } = req.body;

    if (!packId && !customAmount) {
      return res.status(400).json({ error: 'packId or customAmount is required' });
    }

    const order = await paymentGatewayService.createOrder(req.wallet.id, packId, customAmount);

    res.json({
      success: true,
      order: {
        orderId: order.orderId,
        razorpayOrderId: order.razorpayOrderId,
        amount: parseFloat(order.amount),
        credits: parseFloat(order.credits),
        keyId: order.keyId,
      },
    });
  } catch (error) {
    logger.error('Error creating payment order:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /wallet/recharge/verify
 * Verify payment and add credits
 * Body: { orderId, razorpayPaymentId, razorpaySignature }
 */
router.post('/recharge/verify', requireAuth, getWallet, async (req, res) => {
  try {
    const { orderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!orderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await paymentGatewayService.verifyAndProcessPayment(
      orderId,
      razorpayPaymentId,
      razorpaySignature
    );

    res.json({
      success: true,
      result: {
        status: result.status,
        creditsAdded: parseFloat(result.creditsAdded),
        invoiceId: result.invoiceId,
      },
    });
  } catch (error) {
    logger.error('Error verifying payment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /wallet/deduct
 * Deduct credits for a service (called by SMS, WhatsApp, Prescription services)
 * Body: { serviceType, quantity, referenceId?, metadata? }
 */
router.post('/deduct', requireAuth, getWallet, async (req, res) => {
  try {
    const { serviceType, quantity = 1, referenceId, metadata } = req.body;

    if (!serviceType) {
      return res.status(400).json({ error: 'serviceType is required' });
    }

    const transactionId = await walletService.deductCredits(
      req.wallet.id,
      serviceType,
      quantity,
      referenceId,
      metadata
    );

    res.json({
      success: true,
      transactionId,
    });
  } catch (error) {
    logger.error('Error deducting credits:', error);

    if (error.message === 'Insufficient balance') {
      return res.status(402).json({ error: 'Insufficient credits. Please recharge.' });
    }
    if (error.message === 'Subscription inactive') {
      return res.status(403).json({ error: 'Subscription inactive' });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /wallet/webhook/razorpay
 * Razorpay webhook endpoint
 */
router.post('/webhook/razorpay', express.json(), async (req, res) => {
  try {
    const { body } = req;
    const webhookSignature = req.headers['x-razorpay-signature'];

    if (!webhookSignature) {
      return res.status(401).json({ error: 'Missing webhook signature' });
    }

    await paymentGatewayService.handleWebhook(body, webhookSignature);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error handling webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * POST /wallet/admin/pricing
 * Create or update service pricing (admin only)
 */
router.post('/admin/pricing', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { serviceType, serviceName, description, basePrice, taxPercentage, enabled } = req.body;

    if (!serviceType || !serviceName || basePrice === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await db.query(
      `INSERT INTO wallet_pricing (service_type, service_name, description, base_price, tax_percentage, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (service_type) DO UPDATE SET
         service_name = $2, description = $3, base_price = $4, tax_percentage = $5, enabled = $6
       RETURNING *`,
      [serviceType, serviceName, description, basePrice, taxPercentage, enabled !== false]
    );

    res.json({
      success: true,
      pricing: result.rows[0],
    });
  } catch (error) {
    logger.error('Error managing pricing:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /wallet/admin/pricing
 * Get all pricing (admin only)
 */
router.get('/admin/pricing', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM wallet_pricing ORDER BY service_type');

    res.json({
      success: true,
      pricing: result.rows,
    });
  } catch (error) {
    logger.error('Error fetching pricing:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /wallet/admin/refund
 * Issue refund (admin only)
 */
router.post('/admin/refund', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { orderId, refundAmount, reason } = req.body;

    if (!orderId || !refundAmount || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const refund = await paymentGatewayService.refundPayment(orderId, refundAmount, reason);

    res.json({
      success: true,
      refund,
    });
  } catch (error) {
    logger.error('Error processing refund:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /wallet/admin/adjust
 * Adjust wallet balance (admin only)
 */
router.post('/admin/adjust', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { walletId, adjustmentAmount, reason } = req.body;

    if (!walletId || adjustmentAmount === undefined || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const wallet = await client.query('SELECT * FROM wallet WHERE id = $1', [walletId]);
      if (wallet.rows.length === 0) throw new Error('Wallet not found');

      const walletRow = wallet.rows[0];
      const newBalance = parseFloat(walletRow.current_balance) + parseFloat(adjustmentAmount);

      await client.query(
        'UPDATE wallet SET current_balance = $1, version = version + 1 WHERE id = $2',
        [newBalance, walletId]
      );

      await client.query(
        `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, balance_before, balance_after, notes)
         VALUES ($1, 'adjustment', $2, $3, $4, $5)`,
        [walletId, adjustmentAmount, walletRow.current_balance, newBalance, reason]
      );

      await client.query('COMMIT');

      res.json({ success: true, newBalance });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Error adjusting wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
