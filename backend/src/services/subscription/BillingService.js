const { pool } = require('../../config/database');
const logger = require('../../utils/logger');

class BillingService {
  async createPaymentOrder(clinicId, planKey, billingCycle) {
    try {
      logger.info(`[BillingService] Creating payment order for clinic ${clinicId}`);
      
      const { rows: planRows } = await pool.query(
        'SELECT * FROM subscription_plans WHERE plan_key = $1',
        [planKey]
      );

      if (!planRows.length) throw new Error(`Plan not found: ${planKey}`);

      const plan = planRows[0];
      const amount = billingCycle === 'annual' 
        ? plan.annual_price_paise 
        : plan.monthly_price_paise;

      const { rows: orderRows } = await pool.query(
        `INSERT INTO subscription_orders (clinic_id, plan_key, billing_cycle, amount_paise, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id, clinic_id, plan_key, amount_paise, status, created_at`,
        [clinicId, planKey, billingCycle, amount, 'pending']
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

      // Check for duplicate (idempotency)
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
      }

      await client.query(
        `INSERT INTO subscription_webhook_log (clinic_id, webhook_source, razorpay_event_id, razorpay_order_id, razorpay_payment_id, payload, status, processed_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [order.clinic_id, 'razorpay', eventId, orderId, paymentId, JSON.stringify(webhookPayload), result.status]
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
    if (order.billing_cycle === 'annual') {
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    } else {
      expiryDate.setMonth(expiryDate.getMonth() + 1);
    }

    const { rows: subRows } = await client.query(
      'SELECT id FROM clinic_subscriptions WHERE clinic_id = $1',
      [order.clinic_id]
    );

    if (subRows.length > 0) {
      await client.query(
        'UPDATE clinic_subscriptions SET plan_key = $1, status = $2, started_at = $3, expires_at = $4 WHERE clinic_id = $5',
        [order.plan_key, 'active', startDate, expiryDate, order.clinic_id]
      );
    } else {
      await client.query(
        'INSERT INTO clinic_subscriptions (clinic_id, plan_key, status, billing_cycle, started_at, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
        [order.clinic_id, order.plan_key, 'active', order.billing_cycle, startDate, expiryDate]
      );
    }

    return { status: 'captured' };
  }

  async _handlePaymentFailed(client, order, paymentId) {
    await client.query(
      'UPDATE subscription_orders SET status = $1, razorpay_payment_id = $2, failed_at = NOW(), failed_attempts = COALESCE(failed_attempts, 0) + 1 WHERE id = $3',
      ['failed', paymentId, order.id]
    );
    return { status: 'failed' };
  }

  async calculateProration(clinicId, fromPlan, toPlan, billingCycle) {
    const subscription = await require('./SubscriptionService').getSubscription(clinicId);
    if (!subscription) throw new Error('Subscription not found');

    const { rows: plans } = await pool.query(
      'SELECT plan_key, monthly_price_paise FROM subscription_plans WHERE plan_key IN ($1, $2)',
      [fromPlan, toPlan]
    );

    const fromData = plans.find(p => p.plan_key === fromPlan);
    const toData = plans.find(p => p.plan_key === toPlan);

    const now = new Date();
    const cycleEnd = new Date(subscription.expires_at);
    const daysRemaining = Math.ceil((cycleEnd - now) / (1000 * 60 * 60 * 24));
    const cycleLength = billingCycle === 'annual' ? 365 : 30;
    const percentRemaining = daysRemaining / cycleLength;

    const proratedAmount = Math.round((toData.monthly_price_paise - fromData.monthly_price_paise) * percentRemaining);

    return {
      fromPlan, toPlan, daysRemaining, cycleLength,
      percentRemaining: Math.round(percentRemaining * 100) / 100,
      proratedAmount: proratedAmount / 100,
    };
  }

  async getPaymentHistory(clinicId, limit = 20) {
    const { rows } = await pool.query(
      'SELECT id, plan_key, amount_paise, status, paid_at, created_at FROM subscription_orders WHERE clinic_id = $1 ORDER BY created_at DESC LIMIT $2',
      [clinicId, limit]
    );
    return rows.map(row => ({ ...row, amount: row.amount_paise / 100 }));
  }
}

module.exports = new BillingService();
