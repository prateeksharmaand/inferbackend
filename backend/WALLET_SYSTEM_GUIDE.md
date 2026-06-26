# EMR Credits Wallet System - Complete Implementation Guide

## Overview

The Wallet/Credits System is a production-ready payment system for premium services in the EMR. It supports SMS, WhatsApp, and Prescription creation, with extensibility for future AI features, OCR, voice calls, and ABDM premium APIs.

**1 Credit = ₹1**

---

## Architecture

### Key Components

1. **Database Layer** (`migrations/022_wallet_credits_system.sql`)
   - 13 tables supporting complete ledger, audit, and payment tracking
   - Optimistic locking and transaction isolation for race condition prevention
   - Audit logging for compliance

2. **Wallet Service** (`services/walletService.js`)
   - Core business logic for balance management
   - Credit deduction with idempotency support
   - Transaction history and analytics

3. **Payment Gateway Service** (`services/paymentGatewayService.js`)
   - Razorpay integration (primary)
   - Payment order creation and verification
   - Webhook handling and refunds
   - Invoice generation

4. **API Routes** (`routes/wallet.routes.js`)
   - 20+ endpoints for wallet management
   - Admin endpoints for pricing and refunds
   - Webhook endpoint for Razorpay

---

## Database Schema

### Core Tables

```
wallet                        - One per clinic (clinic_id, doctor_id)
wallet_transactions          - Immutable ledger of all transactions
wallet_pricing              - Configurable service rates (SMS, WhatsApp, etc)
wallet_packs                - Pre-defined credit bundles
payment_orders              - Payment gateway orders
payment_transactions        - Webhook logs
wallet_invoices             - Generated receipts
wallet_refunds              - Refund tracking
wallet_service_usage        - Analytics data
wallet_settings             - Clinic-level preferences
wallet_promo_codes          - Coupons (future)
wallet_audit_log            - Compliance logging
wallet_notifications        - Alerts to doctors
```

### Default Pricing

| Service | Price | Unit |
|---------|-------|------|
| WhatsApp Message | 0.66 credits | per message |
| SMS Message | 0.14 credits | per SMS |
| Prescription | 1.00 credit | per prescription |

### Default Packs

| Pack | Credits | Price (₹) | GST (₹) | Total (₹) |
|------|---------|-----------|---------|-----------|
| Starter | 200 | 200 | 36 | 236 |
| Professional | 500 | 500 | 90 | 590 |
| Enterprise | 1000 | 1000 | 180 | 1180 |

---

## API Endpoints

### Wallet Endpoints

#### `POST /api/wallet/init`
Initialize wallet for a clinic (called once on signup)

**Request:**
```json
{
  "Authorization": "Bearer JWT_TOKEN"
}
```

**Response:**
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

---

#### `GET /api/wallet`
Get wallet details

**Response:**
```json
{
  "success": true,
  "wallet": {
    "id": "uuid",
    "currentBalance": 234.50,
    "lifetimePurchased": 500.00,
    "lifetimeUsed": 265.50,
    "subscriptionActive": true,
    "subscriptionExpiresAt": "2026-12-31T00:00:00Z",
    "isLocked": false
  }
}
```

---

#### `GET /api/wallet/summary`
Get wallet summary with usage analytics

**Response:**
```json
{
  "success": true,
  "summary": {
    "currentBalance": 234.50,
    "lifetimePurchased": 500.00,
    "lifetimeUsed": 265.50,
    "subscriptionActive": true,
    "todayTransactions": 5,
    "todayCreditsUsed": 3.30,
    "monthTransactions": 45,
    "monthCreditsUsed": 50.00,
    "daysRemaining": 71,
    "recentTransactions": [
      {
        "id": "uuid",
        "type": "deduction",
        "service": "whatsapp",
        "amount": 0.66,
        "balanceAfter": 233.84,
        "createdAt": "2026-06-26T10:30:00Z"
      }
    ]
  }
}
```

---

#### `GET /api/wallet/history`
Get transaction history with filters

**Query Parameters:**
- `fromDate` - Start date (ISO format)
- `toDate` - End date (ISO format)
- `serviceType` - Filter by service (whatsapp, sms, prescription)
- `transactionType` - Filter by type (purchase, deduction, refund, etc)
- `limit` - Rows per page (default: 50)
- `offset` - Pagination offset (default: 0)

**Example:** `GET /api/wallet/history?serviceType=whatsapp&limit=20&offset=0`

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "id": "uuid",
      "type": "deduction",
      "service": "whatsapp",
      "amount": 0.66,
      "balanceBefore": 234.50,
      "balanceAfter": 233.84,
      "referenceId": "msg_12345",
      "metadata": {"phone": "+919876543210"},
      "createdAt": "2026-06-26T10:30:00Z"
    }
  ]
}
```

---

#### `GET /api/wallet/packs`
Get available credit packs

**Response:**
```json
{
  "success": true,
  "packs": [
    {
      "id": "uuid",
      "name": "Starter Pack",
      "credits": 200,
      "priceInr": 200.00,
      "gstAmount": 36.00,
      "totalAmount": 236.00,
      "discount": 0,
      "isPopular": false,
      "isBestValue": false
    },
    {
      "id": "uuid",
      "name": "Professional Pack",
      "credits": 500,
      "priceInr": 500.00,
      "gstAmount": 90.00,
      "totalAmount": 590.00,
      "discount": 0,
      "isPopular": true,
      "isBestValue": true
    }
  ]
}
```

---

#### `POST /api/wallet/check-balance`
Check if wallet has sufficient balance for a service

**Request:**
```json
{
  "serviceType": "whatsapp",
  "quantity": 1
}
```

**Response (Sufficient Balance):**
```json
{
  "success": true,
  "hasBalance": true,
  "currentBalance": 234.50,
  "requiredCredits": 0.66,
  "pricing": {
    "service": "whatsapp",
    "pricePerUnit": 0.66
  }
}
```

**Response (Insufficient Balance):**
```json
{
  "success": true,
  "hasBalance": false,
  "currentBalance": 0.50,
  "requiredCredits": 0.66
}
```

---

### Payment Endpoints

#### `POST /api/wallet/recharge/order`
Create payment order for Razorpay

**Request:**
```json
{
  "packId": "uuid"
}
```

OR for custom amount:
```json
{
  "customAmount": 1000
}
```

**Response:**
```json
{
  "success": true,
  "order": {
    "orderId": "uuid",
    "razorpayOrderId": "order_XXXXX",
    "amount": 590.00,
    "credits": 500,
    "keyId": "rzp_live_xxxxx"
  }
}
```

---

#### `POST /api/wallet/recharge/verify`
Verify Razorpay payment and add credits

**Request:**
```json
{
  "orderId": "razorpay_order_id",
  "razorpayPaymentId": "pay_XXXXX",
  "razorpaySignature": "9ef4dffbfd84f1318f6739a3ce19f9d85851857ae648f114332d8401e0949a3d"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "status": "success",
    "creditsAdded": 500,
    "invoiceId": "uuid"
  }
}
```

---

#### `POST /api/wallet/deduct`
Deduct credits for a service (called internally by SMS, WhatsApp, Prescription services)

**Request:**
```json
{
  "serviceType": "whatsapp",
  "quantity": 1,
  "referenceId": "msg_12345",
  "metadata": {
    "phone": "+919876543210",
    "message_id": "msg_12345"
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "transactionId": "uuid"
}
```

**Response (Insufficient Balance - 402):**
```json
{
  "error": "Insufficient credits. Please recharge."
}
```

**Response (Subscription Inactive - 403):**
```json
{
  "error": "Subscription inactive"
}
```

---

#### `POST /api/wallet/webhook/razorpay`
Razorpay webhook endpoint (receives payment updates)

**Configured in Razorpay Dashboard:**
- URL: `https://api.inferapp.online/api/wallet/webhook/razorpay`
- Events: `payment.captured`, `payment.failed`

---

### Admin Endpoints

#### `POST /api/wallet/admin/pricing`
Create or update service pricing (admin only)

**Request:**
```json
{
  "serviceType": "ai_summary",
  "serviceName": "AI Clinical Summary",
  "description": "Generate AI summary of patient notes",
  "basePrice": 2.00,
  "taxPercentage": 0,
  "enabled": true
}
```

---

#### `GET /api/wallet/admin/pricing`
Get all pricing configurations (admin only)

---

#### `POST /api/wallet/admin/refund`
Issue refund (admin only)

**Request:**
```json
{
  "orderId": "uuid",
  "refundAmount": 590.00,
  "reason": "Patient requested refund"
}
```

---

#### `POST /api/wallet/admin/adjust`
Adjust wallet balance manually (admin only)

**Request:**
```json
{
  "walletId": "uuid",
  "adjustmentAmount": 100.00,
  "reason": "Promotional credits for grand opening"
}
```

---

## Integration with SMS, WhatsApp, and Prescriptions

### WhatsApp Service Integration

In your WhatsApp sending flow:

```javascript
// BEFORE sending WhatsApp
try {
  // 1. Check balance
  const balance = await walletService.checkBalance(
    walletId,
    'whatsapp',
    1
  );

  if (!balance.hasBalance) {
    return res.status(402).json({
      error: 'Insufficient credits',
      currentBalance: balance.currentBalance,
      requiredCredits: balance.requiredCredits,
      rechargeUrl: '/wallet/recharge'
    });
  }

  // 2. Send WhatsApp
  const result = await whatsappService.sendMessage(to, message);

  // 3. Deduct credits (on success)
  await walletService.deductCredits(
    walletId,
    'whatsapp',
    1,
    `wa_${result.messageId}`, // idempotency key
    { phone: to, message_id: result.messageId }
  );

  res.json({ success: true, messageId: result.messageId });

} catch (error) {
  if (error.message === 'Insufficient balance') {
    return res.status(402).json({ error: 'Insufficient credits' });
  }
  throw error;
}
```

### SMS Service Integration

Same pattern as WhatsApp:
1. Check balance for 'sms' service
2. Send SMS
3. Deduct 0.14 credits on success

### Prescription Service Integration

Same pattern:
1. Check balance for 'prescription' service
2. Create prescription
3. Deduct 1.00 credit on success

---

## Flutter UI Screens (To be implemented)

### 1. Wallet Dashboard Screen
- Current balance (large, prominent)
- Available credits badge
- Credits consumed (month/total)
- Lifetime purchased
- Daily usage graph
- Monthly usage graph
- Most used services
- Estimated days remaining
- "Recharge Now" button

### 2. Recharge Screen
- Three packs (200, 500, 1000 credits)
- "Popular" and "Best Value" badges
- Custom amount input
- GST breakdown
- Total amount
- "Proceed to Pay" button

### 3. Transaction History Screen
- Transaction table with columns:
  - Date
  - Service
  - Type (purchase, deduction, etc)
  - Amount
  - Balance after
  - Status
- Filters: Date range, Service, Status
- Export: CSV, Excel, Print

### 4. Insufficient Credits Dialog
- Current balance
- Required credits
- Service name
- "Recharge Now" button
- "Cancel" button

### 5. Payment Screen
- Razorpay integration
- Loading state
- Success/failure handling
- Invoice download option

---

## Deduction Flow (Credit Card Analogy)

```
USER ACTION (e.g., Send WhatsApp)
    ↓
CHECK BALANCE (read-only)
    ↓
SUFFICIENT? → NO → Return 402 "Insufficient Credits"
    ↓ YES
LOCK WALLET (for update)
    ↓
VERIFY SUBSCRIPTION ACTIVE
    ↓
CHECK IDEMPOTENCY (duplicate request?)
    ↓
GET PRICING (service cost)
    ↓
CALCULATE REQUIRED CREDITS
    ↓
VALIDATE BALANCE ≥ REQUIRED
    ↓
CREATE TRANSACTION RECORD (BEGIN TRANSACTION)
    ↓
UPDATE WALLET BALANCE (new_balance = old - required)
    ↓
UPDATE SERVICE USAGE (analytics)
    ↓
LOG AUDIT (compliance)
    ↓
COMMIT TRANSACTION
    ↓
SEND MESSAGE/SMS/PRESCRIPTION
    ↓
SUCCESS RESPONSE
```

---

## Purchase Flow

```
USER CLICKS "RECHARGE"
    ↓
SELECT PACK or CUSTOM AMOUNT
    ↓
CREATE PAYMENT ORDER (DB)
    ↓
CREATE RAZORPAY ORDER (Gateway)
    ↓
SHOW RAZORPAY PAYMENT MODAL
    ↓
USER ENTERS CARD/UPI DETAILS
    ↓
PAYMENT PROCESSED BY RAZORPAY
    ↓
(Webhook) RAZORPAY → Backend
    ↓
VERIFY SIGNATURE + FETCH PAYMENT
    ↓
ADD CREDITS TO WALLET
    ↓
CREATE TRANSACTION RECORD
    ↓
UPDATE ORDER STATUS = "success"
    ↓
GENERATE INVOICE
    ↓
SEND NOTIFICATION (Push/Email/SMS)
    ↓
(Frontend) SHOW SUCCESS SCREEN
    ↓
DOWNLOAD INVOICE OPTION
```

---

## Error Handling

### Insufficient Balance (402)
```json
{
  "error": "Insufficient credits. Please recharge.",
  "currentBalance": 0.50,
  "requiredCredits": 0.66
}
```

### Subscription Inactive (403)
```json
{
  "error": "Subscription inactive. Please renew your subscription."
}
```

### Wallet Locked (403)
```json
{
  "error": "Wallet is locked: {reason}"
}
```

### Invalid Payment Signature (401)
```json
{
  "error": "Invalid payment signature"
}
```

### Idempotent Request (Already processed)
- System detects duplicate `referenceId`
- Returns same transaction ID
- Prevents double-deduction

---

## Security Features

1. **Optimistic Locking** - Prevent concurrent balance updates
2. **Transaction Isolation** - Database-level ACID guarantees
3. **Webhook Signature Verification** - Validate Razorpay webhooks
4. **Idempotency Keys** - Prevent double-charging
5. **Audit Logging** - Track all balance changes
6. **Role-Based Access** - Admin endpoints require admin role
7. **SQL Injection Protection** - Parameterized queries only
8. **Rate Limiting** - Prevent abuse

---

## Performance Considerations

1. **Indexes**
   - wallet(clinic_id, doctor_id)
   - wallet_transactions(wallet_id, created_at)
   - wallet_service_usage(wallet_id, usage_date)

2. **Query Optimization**
   - Transaction history queries use pagination (50 rows default)
   - Service usage aggregates use date_trunc for grouping
   - No N+1 queries

3. **Caching** (Future)
   - Cache pricing and packs (rarely change)
   - Cache wallet balance (short TTL)
   - Invalidate on deduction

---

## Future Enhancements

- [ ] Promo codes and coupons
- [ ] Referral rewards program
- [ ] Cashback system
- [ ] Auto-recharge
- [ ] Subscription plans
- [ ] Enterprise plans
- [ ] Wallet transfers between clinics
- [ ] API usage billing
- [ ] AI feature billing (auto-detected)
- [ ] Multi-branch wallet sharing
- [ ] Marketplace billing
- [ ] PhonePe/Cashfree/Stripe support
- [ ] Advanced analytics dashboard

---

## Testing

### Manual Testing Checklist

- [ ] Create wallet on clinic signup
- [ ] View wallet balance
- [ ] Check balance for service (sufficient)
- [ ] Check balance for service (insufficient)
- [ ] Create payment order (Razorpay)
- [ ] Simulate Razorpay payment
- [ ] Verify webhook signature
- [ ] Add credits to wallet
- [ ] Generate invoice
- [ ] Deduct credits (WhatsApp)
- [ ] Deduct credits (SMS)
- [ ] Deduct credits (Prescription)
- [ ] Transaction history filtering
- [ ] Admin pricing update
- [ ] Admin manual refund
- [ ] Admin wallet adjustment

### Load Testing

- Concurrent wallet balance updates
- Concurrent payment orders (100 per second)
- High-volume deductions (1000+ per minute)

---

## Deployment

1. **Run Migration**
   ```bash
   psql -U postgres -d inferdb -f migrations/022_wallet_credits_system.sql
   ```

2. **Set Environment Variables**
   ```env
   RAZORPAY_KEY_ID=rzp_live_xxxxx
   RAZORPAY_KEY_SECRET=xxxxx
   RAZORPAY_WEBHOOK_SECRET=xxxxx
   ```

3. **Register Razorpay Webhook**
   - URL: `https://api.inferapp.online/api/wallet/webhook/razorpay`
   - Events: `payment.captured`, `payment.failed`

4. **Test Payments**
   - Use Razorpay test mode first
   - Test cards: 4111 1111 1111 1111
   - Test OTP: any 6 digits

5. **Monitor**
   - Check `wallet_transactions` table
   - Check `payment_transactions` for webhook logs
   - Monitor `wallet_audit_log` for compliance

---

## Support

For issues or questions about the wallet system, contact the development team.
