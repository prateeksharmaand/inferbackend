# Wallet Credits System - Deployment & Integration Guide

## Overview

This guide covers everything needed to deploy and integrate the Wallet/Credits system into your EMR.

---

## Phase 1: Database Setup ✅

### Step 1: Run the Migration

```bash
cd /opt/infer/backend
psql -U postgres -d inferdb -f migrations/022_wallet_credits_system.sql
```

### Step 2: Verify Tables Created

```sql
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'wallet%';
```

Should show:
- wallet
- wallet_transactions
- wallet_pricing
- wallet_packs
- payment_orders
- payment_transactions
- wallet_invoices
- wallet_refunds
- wallet_service_usage
- wallet_settings
- wallet_promo_codes
- wallet_audit_log
- wallet_notifications

---

## Phase 2: Environment Configuration

### Step 1: Update `.env`

```env
# ===== RAZORPAY CONFIGURATION =====
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# ===== WALLET CONFIGURATION =====
WALLET_ENABLED=true
SMS_CREDIT_PRICE=0.14
WHATSAPP_CREDIT_PRICE=0.66
PRESCRIPTION_CREDIT_PRICE=1.00
```

### Step 2: Set Up Razorpay Account

1. Go to https://dashboard.razorpay.com/
2. Get API keys from Settings → API Keys
3. Add webhook in Settings → Webhooks:
   - URL: `https://api.inferapp.online/api/wallet/webhook/razorpay`
   - Events: `payment.authorized`, `payment.captured`, `payment.failed`

### Step 3: Test Keys (Development)

Use Razorpay test mode first:
```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Test card: `4111 1111 1111 1111`
Test OTP: `123456`

---

## Phase 3: Backend Integration

### Step 1: Start the Backend

```bash
cd /opt/infer/backend
npm install razorpay  # Install if not already installed
npm start
```

### Step 2: Test Wallet Initialization

```bash
curl -X POST https://api.inferapp.online/api/wallet/init \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "wallet": {
    "id": "uuid",
    "currentBalance": 0,
    "subscriptionActive": true
  }
}
```

### Step 3: Integrate with SMS Service

In your SMS route file (e.g., `src/routes/sms.routes.js`):

```javascript
const walletIntegrationService = require('../services/walletIntegrationService');
const { requireAuth } = require('../middleware/auth');

router.post(
  '/send',
  requireAuth,
  walletIntegrationService.checkWalletBalance('sms'),  // Automatic balance check
  async (req, res) => {
    try {
      const { phoneNumber, message, messageId } = req.body;
      const wallet = req.wallet;
      const balanceCheck = req.balanceCheck;

      // Send SMS
      const smsResult = await smsService.sendSMS(phoneNumber, message);

      if (!smsResult.success) {
        return res.status(500).json({ error: 'Failed to send SMS' });
      }

      // Deduct credits
      const { transactionId } = await walletIntegrationService.deductSMSCredits(
        wallet.id,
        phoneNumber,
        message,
        messageId
      );

      res.json({
        success: true,
        messageId: smsResult.id || messageId,
        creditsDeducted: 0.14,
        transactionId,
      });
    } catch (error) {
      if (error.message === 'Insufficient balance') {
        return res.status(402).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  }
);
```

### Step 4: Integrate with WhatsApp Service

Similar to SMS (see WALLET_INTEGRATION_EXAMPLES.js for full code):

```javascript
router.post(
  '/send',
  requireAuth,
  walletIntegrationService.checkWalletBalance('whatsapp'),
  sendWhatsAppController
);
```

### Step 5: Integrate with Prescription Service

```javascript
router.post(
  '/',
  requireAuth,
  walletIntegrationService.checkWalletBalance('prescription'),
  createPrescriptionController
);
```

---

## Phase 4: Testing

### Test 1: Create Payment Order

```bash
curl -X POST https://api.inferapp.online/api/wallet/recharge/order \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "packId": "uuid-of-starter-pack"
  }'
```

Response:
```json
{
  "success": true,
  "order": {
    "orderId": "uuid",
    "razorpayOrderId": "order_IluGWxBm9U8zJ8",
    "amount": 236.00,
    "credits": 200,
    "keyId": "rzp_test_xxxxx"
  }
}
```

### Test 2: Verify Payment

```bash
curl -X POST https://api.inferapp.online/api/wallet/recharge/verify \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order_IluGWxBm9U8zJ8",
    "razorpayPaymentId": "pay_IluGWxBm9U8zJ8",
    "razorpaySignature": "9ef4dffbfd84f1318f6739a3ce19f9d85851857ae648f114332d8401e0949a3d"
  }'
```

### Test 3: Check Balance

```bash
curl -X POST https://api.inferapp.online/api/wallet/check-balance \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceType": "sms",
    "quantity": 1
  }'
```

### Test 4: Send SMS with Wallet Deduction

```bash
# With sufficient balance
curl -X POST https://api.inferapp.online/api/sms/send \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+919876543210",
    "message": "Test message",
    "messageId": "msg_test_001"
  }'

# Should return: 200 OK with creditsDeducted: 0.14

# With insufficient balance
# Should return: 402 PAYMENT_REQUIRED with recharge URL
```

### Test 5: Idempotency

Send same messageId twice:

```bash
# First request - creates transaction, deducts credits
# Response: 200 OK, transactionId: xyz

# Second request (same messageId)
# Response: 200 OK, transactionId: xyz (same transaction, no double deduction)
```

### Test 6: View Transaction History

```bash
curl -X GET 'https://api.inferapp.online/api/wallet/history?serviceType=sms&limit=10' \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Test 7: View Wallet Summary

```bash
curl -X GET https://api.inferapp.online/api/wallet/summary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Phase 5: Frontend Integration

### Option A: React/Vue Web App

Update your SMS/WhatsApp/Prescription send functions:

```javascript
async function sendSMS(phoneNumber, message) {
  try {
    const response = await fetch('/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber,
        message,
        messageId: `msg_${Date.now()}_${Math.random()}`
      })
    });

    if (response.status === 402) {
      // Insufficient credits
      const data = await response.json();
      showDialog({
        title: 'Insufficient Credits',
        message: `You need ₹${data.requiredCredits} but only have ₹${data.currentBalance}`,
        actions: [
          { text: 'Recharge Credits', onClick: () => goToWallet() },
          { text: 'Cancel' }
        ]
      });
      return false;
    }

    if (response.ok) {
      const data = await response.json();
      showNotification(`SMS sent! Credits deducted: ${data.creditsDeducted}`);
      updateBalance();
      return true;
    }

    throw new Error(await response.text());
  } catch (error) {
    showError(`Error: ${error.message}`);
    return false;
  }
}
```

### Option B: Mobile App (Flutter)

Use the Dart code from `WALLET_FLUTTER_SCREENS.dart` as reference for:
- WalletService (API client)
- Balance checking
- Payment integration with Razorpay

---

## Phase 6: Admin Features

### Access Admin APIs

All require `Authorization: Bearer ADMIN_JWT_TOKEN` and `role: admin`

#### Get All Pricing

```bash
curl -X GET https://api.inferapp.online/api/wallet/admin/pricing \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

#### Update Pricing

```bash
curl -X POST https://api.inferapp.online/api/wallet/admin/pricing \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceType": "ai_summary",
    "serviceName": "AI Clinical Summary",
    "basePrice": 2.00,
    "enabled": true
  }'
```

#### Issue Refund

```bash
curl -X POST https://api.inferapp.online/api/wallet/admin/refund \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "uuid",
    "refundAmount": 236.00,
    "reason": "Customer requested refund"
  }'
```

#### Adjust Wallet Balance

```bash
curl -X POST https://api.inferapp.online/api/wallet/admin/adjust \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "walletId": "uuid",
    "adjustmentAmount": 100.00,
    "reason": "Promotional credits"
  }'
```

---

## Phase 7: Monitoring & Analytics

### Monitor Transactions

```sql
-- Daily revenue
SELECT
  DATE(created_at) as date,
  COUNT(*) as transactions,
  SUM(amount) as total_credits,
  SUM(amount) * 1 as revenue_inr
FROM wallet_transactions
WHERE transaction_type = 'purchase'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Service usage
SELECT
  service_type,
  COUNT(*) as count,
  SUM(amount) as credits_used
FROM wallet_transactions
WHERE transaction_type = 'deduction'
GROUP BY service_type;

-- Top doctors by usage
SELECT
  w.doctor_id,
  COUNT(*) as transactions,
  SUM(wt.amount) as credits_used
FROM wallet w
JOIN wallet_transactions wt ON w.id = wt.wallet_id
WHERE wt.transaction_type = 'deduction'
GROUP BY w.doctor_id
ORDER BY credits_used DESC
LIMIT 10;
```

### Monitor Payments

```sql
-- Payment success rate
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM payment_orders
GROUP BY status;

-- Failed payments (investigate)
SELECT
  id,
  wallet_id,
  amount_inr,
  failure_reason,
  created_at
FROM payment_orders
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 20;
```

### Set Up Alerts

```sql
-- Alert when wallet balance is low (< 50 credits for > 5 clinics)
SELECT
  w.id,
  w.current_balance,
  COUNT(*) over (partition by null) as count
FROM wallet w
WHERE w.current_balance < 50
ORDER BY w.current_balance ASC;

-- Alert on payment failures
SELECT COUNT(*) as failed_payments_last_hour
FROM payment_orders
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '1 hour';
```

---

## Phase 8: Production Checklist

- [ ] Database migration applied to production
- [ ] Razorpay live keys configured (not test keys!)
- [ ] Webhook URL registered and verified
- [ ] SMS integration tested end-to-end
- [ ] WhatsApp integration tested end-to-end
- [ ] Prescription integration tested end-to-end
- [ ] Frontend shows 402 errors gracefully
- [ ] Frontend links to wallet recharge
- [ ] Admin can create/update pricing
- [ ] Admin can issue refunds
- [ ] Monitoring queries set up
- [ ] Alert emails configured
- [ ] Load testing completed (concurrent payments)
- [ ] Audit logs monitored
- [ ] Invoice generation tested
- [ ] Backup strategy in place

---

## Phase 9: Rollout Strategy

### Week 1: Internal Testing
- Test with team members
- Verify all payment flows
- Check audit logs

### Week 2: Beta Release
- Enable for 10% of clinics
- Monitor for errors
- Gather feedback

### Week 3: Gradual Rollout
- Enable for 50% of clinics
- Monitor payments and usage
- Fix any issues

### Week 4: Full Release
- Enable for all clinics
- Send announcement email
- Provide user documentation

---

## Troubleshooting

### Issue: Wallet not found on initialization

**Cause**: Wallet wasn't created during clinic signup

**Fix**:
```bash
curl -X POST https://api.inferapp.online/api/wallet/init \
  -H "Authorization: Bearer JWT_TOKEN"
```

### Issue: Duplicate column header error

**Cause**: Wallet initialization already ran, schema has duplicates

**Fix**: Run diagnostic:
```bash
python3 sales-agent/diagnose.py  # For Google Sheets
```

For wallet table, check:
```sql
SELECT COUNT(*) FROM information_schema.columns 
WHERE table_name='wallet' AND column_name='current_balance';
```

### Issue: Payment signature mismatch

**Cause**: Wrong webhook secret or invalid timestamp

**Fix**: Verify:
1. `RAZORPAY_WEBHOOK_SECRET` is correct in `.env`
2. Timestamp in webhook payload is recent (< 5 min old)
3. Check webhook logs in Razorpay dashboard

### Issue: Credits deducted but SMS not sent

**Cause**: SMS service failed after wallet deduction

**Fix**: Requires manual refund
```bash
curl -X POST https://api.inferapp.online/api/wallet/admin/refund \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "transaction_id",
    "refundAmount": 0.14,
    "reason": "SMS failed after deduction"
  }'
```

---

## Support & Escalation

| Issue | Contact | Escalation |
|-------|---------|------------|
| Razorpay integration | Razorpay Support | Escalate to Razorpay team |
| Database issues | DevOps | Check PostgreSQL logs |
| SMS/WhatsApp failures | Platform team | Check service logs |
| Payment webhook issues | DevOps | Verify endpoint URLs |

---

## References

- [Razorpay API Docs](https://razorpay.com/docs/api/)
- [Razorpay Webhooks](https://razorpay.com/docs/webhooks/)
- [2Factor.in SMS API](https://2factor.in/api/v1/)
- [Wallet System Architecture](./WALLET_SYSTEM_GUIDE.md)
- [Integration Examples](./WALLET_INTEGRATION_EXAMPLES.js)

---

**Last Updated**: 2026-06-26
**Status**: Ready for Production
