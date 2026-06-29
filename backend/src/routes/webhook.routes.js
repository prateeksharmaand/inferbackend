const express = require('express');
const router = express.Router();
const BillingService = require('../services/subscription/BillingService');
const logger = require('../utils/logger');

router.post('/razorpay/payment', async (req, res) => {
  try {
    const webhookPayload = req.body;
    
    logger.info(`[Webhook] Razorpay event received: ${webhookPayload.event}`);

    // Validate signature if available
    if (!webhookPayload.id) {
      return res.status(400).json({ error: 'Invalid webhook payload: missing event ID' });
    }

    const result = await BillingService.processPaymentWebhook(webhookPayload);

    if (result.isDuplicate) {
      return res.status(200).json({ 
        message: 'Webhook already processed',
        eventId: webhookPayload.id,
        status: result.status 
      });
    }

    res.status(200).json({
      message: 'Webhook processed successfully',
      eventId: webhookPayload.id,
      status: result.status,
    });
  } catch (error) {
    logger.error('[Webhook] Error processing Razorpay webhook:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/payment-status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await BillingService.getOrderStatus(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    logger.error('[Webhook] Error getting order status:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
