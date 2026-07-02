const { pool } = require('../../config/database');
const logger = require('../../utils/logger');

// Map billing_cycle to the correct price column in subscription_plans
const PRICE_COLUMN = {
  monthly: 'price_monthly',
  yearly:  'price_yearly',
  '2year': 'price_2year',
  '3year': 'price_3year',
};

class BillingService {
  async createPaymentOrder(clinicId, planKey, billingCycle) {
    try {
      logger.info(`[BillingService] Creating payment order for clinic ${clinicId}`);

      const { rows: planRows } = await pool.query(
        'SELECT id, key, price_monthly, price_yearly, price_2year, price_3year FROM subscription_plans WHERE key = $1',
        [planKey]
      );

      if (!planRows.length) throw new Error(`Plan not found: ${planKey}`);

      const plan = planRows[0];
      const priceCol = PRICE_COLUMN[billingCycle] || 'price_monthly';
      const amount = plan[priceCol] || plan.price_monthly;

      const { rows: orderRows } = await pool.query(
        `INSERT INTO subscription_orders (clinic_id, plan_id, billing_cycle, amount_paise, status, created_at)
         VALUES ($1, $2, $3, $4, 'pending', NOW())
         RETURNING id, clinic_id, plan_id, amount_paise, status, created_at`,
        [clinicId, plan.id, billingCycle, amount]
      );

      return orderRows[0];
    } catch (error) {
      logger.error('[BillingService.createPaymentOrder] failed:', error.message);
      throw error;
    }
  }

  async processPaymentWebhook(webhookPayload) {
    const client = await pool.connect();
    try {
      const eventId = webhookPayload.id;
      const orderId = webhookPayload.payload?.payment?.entity?.order_id;
      const paymentId = webhookPayload.payload?.payment?.entity?.id;

      // Idempotency: skip duplicate webhooks
      const { rows: existing } = await client.query(
        'SELECT id, status FROM subscription_webhook_log WHERE razorpay_event_id = $1',
        [eventId]
      );

      if (existing.length > 0) {
        logger.warn(`[BillingService] Duplicate webhook: ${eventId}`);
        return { handled: true, isDuplicate: true, status: existing[0].status };
      }

      await client.query('BEGIN');

      const { rows: orderRows } = await client.query(
        'SELECT * FROM subscription_orders WHERE razorpay_order_id = $1',
        [orderId]
      );

      if (!orderRows.length) throw new Error(`Order not found: ${orderId}`);

      const order = orderRows[0];
      let result;

      if (webhookPayload.event === 'payment.captured') {
        result = await this._handlePaymentCaptured(client, order, paymentId);
      } else if (webhookPayload.event === 'payment.failed') {
        result = await this._handlePaymentFailed(client, order, paymentId);
      } else {
        result = { status: 'ignored' };
      }

      await client.query(
        `INSERT INTO subscription_webhook_log (clinic_id, webhook_source, razorpay_event_id, razorpay_order_id, razorpay_payment_id, payload, status, processed_at, created_at)
         VALUES ($1, 'razorpay', $2, $3, $4, $5, $6, NOW(), NOW())`,
        [order.clinic_id, eventId, orderId, paymentId, JSON.stringify(webhookPayload), result.status]
      );

      await client.query('COMMIT');
      return { handled: true, isDuplicate: false, status: result.status };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[BillingService] Webhook processing failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  async _handlePaymentCaptured(client, order, paymentId) {
    await client.query(
      'UPDATE subscription_orders SET status = $1, razorpay_payment_id = $2, paid_at = NOW() WHERE id = $3',
      ['captured', paymentId, order.id]
    );

    const startDate = new Date();
    const expiryDate = new Date();
    const durationMap = { monthly: 1, yearly: 12, '2year': 24, '3year': 36 };
    const months = durationMap[order.billing_cycle] || 1;
    expiryDate.setMonth(expiryDate.getMonth() + months);

    // Upsert clinic subscription using plan_id (not plan_key)
    await client.query(
      `INSERT INTO clinic_subscriptions
         (clinic_id, plan_id, seat_count, billing_cycle, status, started_at, expires_at, razorpay_order_id, razorpay_payment_id)
       VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8)
       ON CONFLICT (clinic_id) DO UPDATE SET
         plan_id             = EXCLUDED.plan_id,
         seat_count          = EXCLUDED.seat_count,
         billing_cycle       = EXCLUDED.billing_cycle,
         status              = 'active',
         started_at          = EXCLUDED.started_at,
         expires_at          = EXCLUDED.expires_at,
         razorpay_order_id   = EXCLUDED.razorpay_order_id,
         razorpay_payment_id = EXCLUDED.razorpay_payment_id,
         updated_at          = NOW()`,
      [order.clinic_id, order.plan_id, order.seat_count || 1, order.billing_cycle, startDate, expiryDate, order.razorpay_order_id, paymentId]
    );

    // Keep emr_clinics.plan in sync (legacy column)
    const { rows: planRows } = await client.query('SELECT key FROM subscription_plans WHERE id = $1', [order.plan_id]);
    if (planRows.length) {
      await client.query('UPDATE emr_clinics SET plan = $1 WHERE id = $2', [planRows[0].key, order.clinic_id]);
    }

    return { status: 'captured' };
  }

  async _handlePaymentFailed(client, order, paymentId) {
    await client.query(
      'UPDATE subscription_orders SET status = $1, razorpay_payment_id = $2 WHERE id = $3',
      ['failed', paymentId, order.id]
    );
    return { status: 'failed' };
  }

  async calculateProration(clinicId, fromPlan, toPlan, billingCycle) {
    const subscription = await require('./SubscriptionService').getSubscription(clinicId);
    if (!subscription) throw new Error('Subscription not found');

    const { rows: plans } = await pool.query(
      'SELECT id, key, price_monthly FROM subscription_plans WHERE key IN ($1, $2)',
      [fromPlan, toPlan]
    );

    const fromData = plans.find(p => p.key === fromPlan);
    const toData = plans.find(p => p.key === toPlan);
    if (!fromData || !toData) throw new Error('Plan not found for proration calculation');

    const now = new Date();
    const cycleEnd = new Date(subscription.expires_at);
    const daysRemaining = Math.max(0, Math.ceil((cycleEnd - now) / (1000 * 60 * 60 * 24)));
    const cycleLength = billingCycle === 'yearly' ? 365 : 30;
    const percentRemaining = daysRemaining / cycleLength;

    const proratedAmount = Math.round((toData.price_monthly - fromData.price_monthly) * percentRemaining);

    return {
      fromPlan, toPlan, daysRemaining, cycleLength,
      percentRemaining: Math.round(percentRemaining * 100) / 100,
      proratedAmount: proratedAmount / 100,
    };
  }

  async getPaymentHistory(clinicId, limit = 20) {
    const { rows } = await pool.query(
      `SELECT so.id, sp.key AS plan_key, sp.display_name AS plan_name,
              so.amount_paise, so.billing_cycle, so.status, so.paid_at, so.created_at
       FROM subscription_orders so
       LEFT JOIN subscription_plans sp ON sp.id = so.plan_id
       WHERE so.clinic_id = $1
       ORDER BY so.created_at DESC
       LIMIT $2`,
      [clinicId, limit]
    );
    return rows.map(row => ({ ...row, amount: row.amount_paise / 100 }));
  }
}

module.exports = new BillingService();
