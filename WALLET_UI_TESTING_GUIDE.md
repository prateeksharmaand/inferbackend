# Infer Credits - UI Testing Guide

Complete step-by-step instructions for testing the wallet feature from the user interface.

---

## 🎯 Test Scenarios Overview

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| View Wallet Balance | Navigate to Wallet → Check Balance | Shows current balance with stats |
| Purchase Credits | Wallet → Recharge → Select Pack → Pay | Credits added instantly |
| Send WhatsApp | Patient → Send WhatsApp → Confirm | Message sent, credits deducted |
| Send SMS | Patient → Send SMS → Confirm | SMS sent, credits deducted |
| Create Prescription | Encounter → Add Medicines → Generate → Confirm | Prescription created, credit deducted |
| Insufficient Credits | Try sending with low balance | 402 error, Recharge popup |
| View History | Wallet → Transaction History → Filter | Shows all transactions |

---

## 📱 Test 1: Access Wallet Dashboard

### Steps:
1. **Log in** to Infer EMR with doctor credentials
2. **Look for "Wallet"** or **"Credits"** in the main menu
   - Usually in sidebar/navigation menu
   - Or in settings/account section
3. **Click "Wallet"**

### Expected UI:
```
┌─────────────────────────────────────┐
│         WALLET & CREDITS            │
├─────────────────────────────────────┤
│                                     │
│    Available Balance                │
│    ₹234.50                          │
│    234 Credits                      │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Lifetime Purchased: ₹500        │ │
│ │ Lifetime Used: ₹265.50          │ │
│ │ Days Remaining: ~71             │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Recharge Credits]    [More Info]  │
│                                     │
│ ═══════════════════════════════════ │
│ This Month:                         │
│ • Transactions: 45                  │
│ • Credits Used: ₹50.00              │
│ ═══════════════════════════════════ │
│                                     │
│ Recent Transactions:                │
│ • 2026-06-26 WhatsApp   -0.66       │
│ • 2026-06-26 SMS        -0.14       │
│ • 2026-06-25 Prescription -1.00     │
│                                     │
│ [View All Transactions]             │
│                                     │
└─────────────────────────────────────┘
```

### Verify:
- [ ] Current balance displays correctly
- [ ] Stats show (Lifetime Purchased, Used, Days Remaining)
- [ ] Recent transactions visible
- [ ] "Recharge Credits" button visible

---

## 💳 Test 2: Recharge Credits - Select Pack

### Steps:
1. From Wallet Dashboard, click **"Recharge Credits"**
2. You should see **3 pre-made packs**

### Expected UI:

```
┌─────────────────────────────────────┐
│       RECHARGE CREDITS              │
│                                     │
│ Choose a pack that suits your needs │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ○ Starter Pack                  │ │
│ │   200 Credits                   │ │
│ │                    ₹236 (+ GST)  │ │
│ │   Best for: Small clinics       │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ○ Professional Pack ⭐ Popular  │ │
│ │   500 Credits   🏆 Best Value   │ │
│ │                    ₹590 (+ GST)  │ │
│ │   Best for: Medium clinics      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ○ Enterprise Pack               │ │
│ │   1000 Credits                  │ │
│ │                    ₹1180 (+ GST) │ │
│ │   Best for: Large clinics       │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Or enter custom amount:             │
│ [₹_________]                        │
│                                     │
│ [Proceed to Payment]                │
│                                     │
└─────────────────────────────────────┘
```

### Verify:
- [ ] All 3 packs visible
- [ ] Correct pricing shown (₹236/₹590/₹1180)
- [ ] Popular/Best Value badges visible
- [ ] Can select a pack (radio button changes)
- [ ] Custom amount option available

---

## 💰 Test 3: Complete Payment (Razorpay)

### Steps:
1. **Select Professional Pack** (500 credits for ₹590)
2. Click **"Proceed to Payment"**
3. You should see **Razorpay payment form**

### Expected UI:

```
┌─────────────────────────────────────┐
│      SECURE PAYMENT - RAZORPAY      │
├─────────────────────────────────────┤
│                                     │
│ Order Summary:                      │
│ ┌─────────────────────────────────┐ │
│ │ Professional Pack (500 Credits) │ │
│ │ Subtotal:        ₹500.00        │ │
│ │ GST (18%):       ₹90.00         │ │
│ │ ─────────────────────────────    │
│ │ Total Amount:    ₹590.00        │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Payment Method:                     │
│ [◉ Credit/Debit Card] [ ] UPI      │
│ [  ] Net Banking    [ ] Wallet     │
│                                     │
│ Card Details:                       │
│ Card Number: [4111 1111 1111 1111] │
│ Expiry: [MM/YY]  CVV: [***]        │
│ Name: [_________________]           │
│                                     │
│ [Pay ₹590]                          │
│                                     │
└─────────────────────────────────────┘
```

### Verify:
- [ ] GST breakdown shows (18%)
- [ ] Total amount correct
- [ ] Payment methods available
- [ ] Razorpay payment modal appears

### Pay with Test Card:
- **Card Number**: 4111 1111 1111 1111
- **Expiry**: 12/25
- **CVV**: 123
- **Name**: Test User
- **OTP**: Any 6 digits (e.g., 123456)

---

## ✅ Test 4: Payment Success

### Expected UI After Payment:

```
┌─────────────────────────────────────┐
│   ✅ PAYMENT SUCCESSFUL             │
├─────────────────────────────────────┤
│                                     │
│ Order ID: order_IluGWxBm9U8zJ8     │
│ Amount: ₹590.00                     │
│ Credits Added: 500                  │
│ New Balance: 734.50 credits         │
│                                     │
│ Transaction ID: txn_xyz123          │
│ Date: 2026-06-26 10:30 AM          │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 📋 Invoice Details              │ │
│ │ Invoice Number: INV-20260626-ABC │ │
│ │ Status: Generated               │ │
│ │ [Download PDF]  [View Details]  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Back to Wallet] [View History]    │
│                                     │
└─────────────────────────────────────┘
```

### Verify:
- [ ] Success message displays
- [ ] Order ID shown
- [ ] Credits added to balance
- [ ] New balance updated correctly (734.50 = 234.50 + 500)
- [ ] Invoice available for download
- [ ] Timestamp recorded

---

## 📱 Test 5: Send WhatsApp with Credits

### Steps:
1. Go to **Patient Profile**
2. Find patient you want to message
3. Click **"Send WhatsApp"**

### Expected UI - Before Sending:

```
┌─────────────────────────────────────┐
│      SEND WHATSAPP MESSAGE          │
├─────────────────────────────────────┤
│                                     │
│ To: Dr. Priya Sharma                │
│ Phone: +91 9876543210               │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Your appointment is confirmed  │ │
│ │ for tomorrow at 2 PM            │ │
│ │                                 │ │
│ │                                 │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Credit Cost: 0.66 credits (₹0.66)  │
│ Current Balance: 734.50 credits    │
│ Balance After: 733.84 credits      │ │
│                                     │
│ [Send] [Cancel]                     │
│                                     │
└─────────────────────────────────────┘
```

### Verify:
- [ ] WhatsApp icon visible
- [ ] Phone number shown
- [ ] Credit cost displayed (0.66)
- [ ] Current balance shown
- [ ] "Balance After" calculated correctly

### Send the Message:
4. Click **"Send"**

### Expected UI - After Sending:

```
┌─────────────────────────────────────┐
│   ✅ MESSAGE SENT                   │
├─────────────────────────────────────┤
│                                     │
│ WhatsApp message sent successfully! │
│                                     │
│ Message ID: wa_msg_12345            │
│ Recipient: +91 9876543210           │
│ Time: 2026-06-26 10:35 AM          │
│ Status: Delivered ✓                 │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Credits Deducted: 0.66          │ │
│ │ Previous Balance: 734.50        │ │
│ │ New Balance: 733.84             │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [View Transaction] [Send Another]  │
│                                     │
└─────────────────────────────────────┘
```

### Verify:
- [ ] Success message appears
- [ ] Credits deducted (734.50 → 733.84)
- [ ] Message delivered status
- [ ] Transaction ID saved

---

## 📞 Test 6: Send SMS with Credits

### Steps:
1. Go to **Patient Profile**
2. Click **"Send SMS"**

### Expected Process:
Same as WhatsApp, but:
- **Cost**: 0.14 credits (₹0.14)
- **Balance After**: 733.70 credits (733.84 - 0.14)
- Shows SMS delivery status

### Verify:
- [ ] SMS sent successfully
- [ ] 0.14 credits deducted
- [ ] Balance updated correctly

---

## 💊 Test 7: Create Prescription with Credits

### Steps:
1. Create **new patient encounter**
2. Add **medicines** and **instructions**
3. Click **"Generate Prescription"**

### Expected UI - Before Creating:

```
┌─────────────────────────────────────┐
│      CREATE PRESCRIPTION            │
├─────────────────────────────────────┤
│                                     │
│ Patient: John Doe                   │
│ Date: 2026-06-26                    │
│ Doctor: Dr. Priya Sharma            │
│                                     │
│ Medicines:                          │
│ • Aspirin 500mg - 1 tablet daily   │
│ • Cough Syrup - 1 spoon x 2        │
│                                     │
│ Instructions:                       │
│ Take after meals for 5 days         │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Credit Cost: 1.00 credit (₹1)   │ │
│ │ Current Balance: 733.70 credits │ │
│ │ Balance After: 732.70 credits   │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Generate & Save] [Cancel]          │
│                                     │
└─────────────────────────────────────┘
```

### Verify:
- [ ] Prescription cost shown (1.00 credit)
- [ ] Current balance displayed
- [ ] Balance after calculated

### Generate Prescription:
4. Click **"Generate & Save"**

### Expected UI - After Creation:

```
┌─────────────────────────────────────┐
│   ✅ PRESCRIPTION CREATED           │
├─────────────────────────────────────┤
│                                     │
│ Prescription ID: rx_abc123          │
│ Patient: John Doe                   │
│ Created: 2026-06-26 10:40 AM       │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Credit Deducted: 1.00           │ │
│ │ Previous Balance: 733.70        │ │
│ │ New Balance: 732.70             │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Download PDF] [Email to Patient]  │
│ [View Details] [Create Another]    │
│                                     │
└─────────────────────────────────────┘
```

### Verify:
- [ ] Prescription created successfully
- [ ] 1 credit deducted
- [ ] Balance updated (733.70 → 732.70)
- [ ] Prescription ID generated

---

## ⚠️ Test 8: Insufficient Credits

### Steps:
1. Use WhatsApp/SMS/Prescription until balance < required credits
2. Try to send WhatsApp when balance < 0.66

### Expected UI:

```
┌─────────────────────────────────────┐
│   ❌ INSUFFICIENT CREDITS           │
├─────────────────────────────────────┤
│                                     │
│ Cannot send WhatsApp message        │
│                                     │
│ You need: 0.66 credits              │
│ You have: 0.50 credits              │
│ Shortfall: 0.16 credits             │
│                                     │
│ Your account has insufficient       │
│ credits to complete this action.    │
│                                     │
│ [Recharge Now] [Cancel]             │
│                                     │
└─────────────────────────────────────┘
```

### Verify:
- [ ] Error message displays
- [ ] Shows required vs available
- [ ] "Recharge Now" button available
- [ ] Action is blocked (WhatsApp not sent)

### Click "Recharge Now":
4. Should navigate to **Recharge Packs** page
5. Complete purchase as in Test 3

---

## 📊 Test 9: View Transaction History

### Steps:
1. Go to **Wallet Dashboard**
2. Click **"View All Transactions"**

### Expected UI:

```
┌─────────────────────────────────────┐
│    TRANSACTION HISTORY              │
├─────────────────────────────────────┤
│                                     │
│ Filters:                            │
│ [Date Range ▼] [Service ▼]         │
│ [Status ▼]     [Export ▼]          │
│                                     │
│ Results: 125 transactions found     │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Date    Service   Debit Credit  │ │
│ │─────────────────────────────────│ │
│ │ 26-Jun  WhatsApp  -0.66  732.70 │ │
│ │ 26-Jun  SMS       -0.14  733.84 │ │
│ │ 25-Jun  Prescrip  -1.00  733.98 │ │
│ │ 25-Jun  Purchase  +500   734.98 │ │
│ │ 24-Jun  WhatsApp  -0.66  234.98 │ │
│ │ ...                             │ │
│ │                                 │ │
│ │ [Previous] [1] [2] [3] [Next]  │ │
│ │                                 │ │
│ │ [Download CSV] [Print]          │ │
│ └─────────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

### Verify:
- [ ] All transactions show with date, type, amount
- [ ] Running balance updated correctly
- [ ] Filters work (date range, service type)
- [ ] Pagination works
- [ ] Export options available (CSV, Print)

### Test Filters:
1. **Filter by Service**: Select "WhatsApp" → Only WhatsApp transactions shown
2. **Filter by Date**: Last 7 days → Only recent transactions shown
3. **Filter by Service**: Select "SMS" → Only SMS transactions shown

---

## 🔄 Test 10: Real-Time Balance Updates

### Steps:
1. Open **Wallet Dashboard** in one window
2. Open **Patient Profile** in another window
3. Send WhatsApp from patient window

### Expected Behavior:
- [ ] Balance updates **instantly** in Wallet window
- [ ] No page refresh needed
- [ ] Shows "Balance: X.XX" in real-time

---

## 📋 Test 11: Admin Panel (Optional)

### Access Admin Panel:
1. Log in as **Admin user**
2. Navigate to **"Admin"** → **"Wallet"** (or similar)

### Expected UI:

```
┌─────────────────────────────────────┐
│      WALLET ADMIN PANEL             │
├─────────────────────────────────────┤
│                                     │
│ [Pricing]  [Packs]  [Refunds]      │
│ [Analytics] [Reports]               │
│                                     │
│ PRICING MANAGEMENT:                 │
│ ┌─────────────────────────────────┐ │
│ │ Service: WhatsApp               │ │
│ │ Price: 0.66 credits             │ │
│ │ Enabled: ✓                      │ │
│ │ [Edit] [Disable]                │ │
│ └─────────────────────────────────┘ │
│                                     │
│ CREDIT PACKS:                       │
│ • Starter (200 credits) - ₹236     │
│ • Professional (500) - ₹590        │
│ • Enterprise (1000) - ₹1180        │
│                                     │
│ [Create New Pack]                   │
│                                     │
└─────────────────────────────────────┘
```

### Verify:
- [ ] Can view pricing
- [ ] Can view packs
- [ ] Can edit pricing
- [ ] Can view revenue analytics
- [ ] Can issue refunds

---

## ✅ Complete Testing Checklist

- [ ] Wallet Dashboard displays correctly
- [ ] Can view current balance
- [ ] Can view statistics (lifetime purchased, used, days remaining)
- [ ] Can select credit pack
- [ ] Payment flow completes successfully
- [ ] Credits added to wallet after payment
- [ ] WhatsApp sends successfully and deducts credits
- [ ] SMS sends successfully and deducts credits
- [ ] Prescription creates successfully and deducts credits
- [ ] Balance updates in real-time
- [ ] Insufficient credits shows error dialog
- [ ] Can recharge from insufficient credits dialog
- [ ] Transaction history shows all transactions
- [ ] Can filter transactions by date, service
- [ ] Can export transaction history
- [ ] Invoice downloads successfully
- [ ] Admin can view analytics
- [ ] Admin can manage pricing
- [ ] Admin can issue refunds

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Payment fails | Use test card: 4111 1111 1111 1111, any OTP |
| Credits not deducted | Refresh page, check transaction history |
| Balance shows wrong | Clear browser cache, logout/login |
| Razorpay not loading | Check internet, verify API keys in .env |
| Admin not seeing pricing | Ensure user role = 'admin' in database |

---

## 📞 Quick Reference

| Action | Expected Cost | Expected Duration |
|--------|---------------|-------------------|
| Send WhatsApp | 0.66 credits | 30 seconds |
| Send SMS | 0.14 credits | 10 seconds |
| Create Prescription | 1.00 credit | Instant |
| Buy Pack | 1-2 minutes | Depends on payment method |
| View History | - | Instant |

---

**Ready to test!** Follow the steps above to verify the complete wallet feature. 🚀
