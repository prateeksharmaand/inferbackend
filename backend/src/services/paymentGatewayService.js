/**
 * Payment Gateway Service - Abstraction layer for multiple payment gateways
 * Supports Razorpay (primary), PhonePe, Cashfree, Stripe (future)
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../utils/logger');
const walletService = require('./walletService');

class PaymentGatewayService {
  constructor() {
    // Initialize Razorpay
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      this.razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });
    }
  }

  /**
   * Create payment order
   */
  async createOrder(walletId, packId = null, customAmount = null) {
    try {
      const wallet = await walletService.getWalletById(walletId);
      if (!wallet) throw new Error('Wallet not found');

      let creditQuantity, priceInr, gstAmount, totalAmount, packDetails = null;

      if (packId) {
        const pack = await db.query(
          'SELECT * FROM wallet_packs WHERE id = $1 AND enabled = TRUE',
          [packId]
        );
        if (pack.rows.length === 0) throw new Error('Pack not found');

        packDetails = pack.rows[0];
        creditQuantity = packDetails.credit_quantity;
        priceInr = packDetails.price_inr;
        gstAmount = packDetails.gst_amount;
        totalAmount = packDetails.total_amount;
      } else if (customAmount) {
        // Custom amount purchase
        priceInr = customAmount;
        gstAmount = parseFloat((customAmount * 0.18).toFixed(2)); // 18% GST
        totalAmount = parseFloat((priceInr + gstAmount).toFixed(2));
        creditQuantity = customAmount; // 1 credit = 1 INR
      } else {
        throw new Error('Either packId or customAmount must be provided');
      }

      // Create order in database first
      const orderResult = await db.query(
        `INSERT INTO payment_orders
         (wallet_id, pack_id, custom_amount, credit_quantity, amount_inr, gst_amount, total_amount, payment_gateway, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() + INTERVAL '24 hours')
         RETURNING *`,
        [
          walletId,
          packId || null,
          customAmount || null,
          creditQuantity,
          priceInr,
          gstAmount,
          totalAmount,
          'razorpay',
          'pending',
        ]
      );

      const order = orderResult.rows[0];

      // Create Razorpay order
      const razorpayOrder = await this.razorpay.orders.create({
        amount: Math.round(order.total_amount * 100), // Amount in paise
        currency: 'INR',
        receipt: order.id,
        notes: {
          wallet_id: walletId,
          pack_id: packId || 'custom',
          credit_quantity: creditQuantity,
        },
      });

      // Update order with gateway order ID
      await db.query(
        `UPDATE payment_orders
         SET gateway_order_id = $1, status = 'processing'
         WHERE id = $2`,
        [razorpayOrder.id, order.id]
      );

      logger.info(`Payment order created: ${order.id}, Razorpay: ${razorpayOrder.id}`);

      return {
        orderId: order.id,
        razorpayOrderId: razorpayOrder.id,
        amount: order.total_amount,
        currency: 'INR',
        credits: creditQuantity,
        keyId: process.env.RAZORPAY_KEY_ID,
      };
    } catch (error) {
      logger.error('Error creating payment order:', error);
      throw error;
    }
  }

  /**
   * Verify payment and add credits to wallet
   * Called after successful Razorpay payment
   */
  async verifyAndProcessPayment(orderId, razorpayPaymentId, razorpaySignature) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Verify signature
      const hash = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${razorpayPaymentId}`)
        .digest('hex');

      if (hash !== razorpaySignature) {
        throw new Error('Invalid payment signature');
      }

      // Get order from database
      const orderResult = await client.query(
        'SELECT * FROM payment_orders WHERE gateway_order_id = $1 FOR UPDATE',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = orderResult.rows[0];

      // Check if already processed
      if (order.status === 'success') {
        logger.warn(`Order ${order.id} already processed`);
        await client.query('COMMIT');
        return { status: 'already_processed', orderId: order.id };
      }

      // Get payment from Razorpay for verification
      const razorpayPayment = await this.razorpay.payments.fetch(razorpayPaymentId);

      if (razorpayPayment.status !== 'captured') {
        throw new Error(`Payment not captured. Status: ${razorpayPayment.status}`);
      }

      // Add credits to wallet
      await walletService.addCredits(
        order.wallet_id,
        order.credit_quantity,
        order.id,
        `razorpay_${razorpayPaymentId}`
      );

      // Update order status
      await client.query(
        `UPDATE payment_orders
         SET status = 'success', gateway_payment_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [razorpayPaymentId, order.id]
      );

      // Generate invoice
      const invoiceId = await this.generateInvoice(
        client,
        order.wallet_id,
        order.id,
        order.credit_quantity,
        order.amount_inr,
        order.gst_amount,
        order.total_amount
      );

      await client.query('COMMIT');

      logger.info(`Payment processed successfully: Order ${order.id}, Invoice ${invoiceId}`);

      return {
        status: 'success',
        orderId: order.id,
        creditsAdded: order.credit_quantity,
        invoiceId,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error verifying payment:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle payment webhook from Razorpay
   */
  async handleWebhook(webhookData, webhookSignature) {
    try {
      // Verify webhook signature
      const hash = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(JSON.stringify(webhookData))
        .digest('hex');

      if (hash !== webhookSignature) {
        throw new Error('Invalid webhook signature');
      }

      // Log webhook
      await db.query(
        `INSERT INTO payment_transactions (gateway_name, gateway_transaction_id, event_type, raw_webhook_data, webhook_signature_verified)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'razorpay',
          webhookData.event,
          webhookData.event,
          JSON.stringify(webhookData),
          true,
        ]
      );

      // Handle based on event
      const eventType = webhookData.event;

      if (eventType === 'payment.authorized' || eventType === 'payment.captured') {
        const payment = webhookData.payload.payment.entity;
        const orderId = payment.notes.wallet_id; // Assuming we store order ID in notes

        // Verify and process payment
        await this.verifyAndProcessPayment(
          payment.order_id,
          payment.id,
          '' // Signature already verified above
        );

        logger.info(`Webhook processed: ${eventType} for order ${payment.order_id}`);
      } else if (eventType === 'payment.failed') {
        const payment = webhookData.payload.payment.entity;
        const orderResult = await db.query(
          'SELECT * FROM payment_orders WHERE gateway_order_id = $1',
          [payment.order_id]
        );

        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];
          await db.query(
            `UPDATE payment_orders
             SET status = 'failed', failure_reason = $1, updated_at = NOW()
             WHERE id = $2`,
            [payment.description, order.id]
          );
        }

        logger.warn(`Webhook processed: Payment failed for order ${payment.order_id}`);
      }

      return { success: true };
    } catch (error) {
      logger.error('Error handling webhook:', error);
      throw error;
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(orderId, refundAmount, reason) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const orderResult = await client.query(
        'SELECT * FROM payment_orders WHERE id = $1 FOR UPDATE',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = orderResult.rows[0];

      if (order.status !== 'success') {
        throw new Error('Can only refund successful payments');
      }

      // Create refund record
      const refundResult = await client.query(
        `INSERT INTO wallet_refunds
         (wallet_id, payment_order_id, refund_amount, refund_reason, refund_status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [order.wallet_id, order.id, refundAmount, reason, 'initiated']
      );

      const refund = refundResult.rows[0];

      // Create Razorpay refund
      const razorpayRefund = await this.razorpay.payments.refund(order.gateway_payment_id, {
        amount: Math.round(refundAmount * 100),
        notes: {
          refund_id: refund.id,
          reason,
        },
      });

      // Update refund with gateway refund ID
      await client.query(
        `UPDATE wallet_refunds
         SET gateway_refund_id = $1, refund_status = 'completed', completed_at = NOW()
         WHERE id = $2`,
        [razorpayRefund.id, refund.id]
      );

      // Deduct credits from wallet (reverse the transaction)
      await client.query(
        `UPDATE wallet
         SET current_balance = current_balance - $1, version = version + 1
         WHERE id = $2`,
        [refundAmount, order.wallet_id]
      );

      // Log transaction
      await client.query(
        `INSERT INTO wallet_transactions
         (wallet_id, transaction_type, amount, balance_before, balance_after, reference_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          order.wallet_id,
          'refund',
          -refundAmount,
          await this.getWalletBalance(client, order.wallet_id),
          await this.getWalletBalance(client, order.wallet_id) - refundAmount,
          refund.id,
        ]
      );

      await client.query('COMMIT');

      logger.info(`Refund processed: Order ${orderId}, Amount ${refundAmount}`);

      return refund;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error processing refund:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate invoice
   */
  async generateInvoice(client, walletId, paymentOrderId, creditQuantity, amountInr, gstAmount, totalAmount) {
    try {
      // Generate invoice number
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const invoiceNumber = `INV-${dateStr}-${paymentOrderId.substring(0, 8).toUpperCase()}`;

      const items = [
        {
          description: `${creditQuantity} Credits Purchase`,
          quantity: 1,
          unit_price: amountInr,
          tax: gstAmount,
          amount: totalAmount,
        },
      ];

      const invoiceResult = await client.query(
        `INSERT INTO wallet_invoices
         (wallet_id, payment_order_id, invoice_number, items, subtotal, tax_amount, total_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'generated')
         RETURNING id`,
        [
          walletId,
          paymentOrderId,
          invoiceNumber,
          JSON.stringify(items),
          amountInr,
          gstAmount,
          totalAmount,
        ]
      );

      return invoiceResult.rows[0].id;
    } catch (error) {
      logger.error('Error generating invoice:', error);
      throw error;
    }
  }

  /**
   * Helper: Get wallet balance
   */
  async getWalletBalance(client, walletId) {
    const result = await client.query(
      'SELECT current_balance FROM wallet WHERE id = $1',
      [walletId]
    );
    return result.rows.length > 0 ? result.rows[0].current_balance : 0;
  }
}

module.exports = new PaymentGatewayService();
