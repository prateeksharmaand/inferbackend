const Razorpay = require('razorpay');
const crypto   = require('crypto');
const { pool } = require('../config/database');
const logger   = require('../utils/logger');
const EffectiveLicenseResolver = require('../services/subscription/EffectiveLicenseResolver');
const BillingService           = require('../services/subscription/BillingService');

const rzp = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getSubscription(clinicId) {
  logger.info(`[subscription] getSubscription clinicId=${clinicId}`);
  const { rows } = await pool.query(
    `SELECT cs.*, sp.key AS plan_key, sp.display_name, sp.tagline,
            sp.max_users, sp.max_patients, sp.max_appointments,
            sp.max_prescriptions, sp.max_storage_mb, sp.features,
            sp.price_monthly, sp.price_yearly, sp.price_2year, sp.price_3year
     FROM clinic_subscriptions cs
     JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.clinic_id = $1`,
    [clinicId],
  );
  if (!rows.length) return null;
  return rows[0];
}

async function getUsage(clinicId) {
  const [patients, appts, rxs] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT a.emr_patient_id)::int AS n FROM emr_appointments a WHERE a.clinic_id = $1`, [clinicId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM emr_appointments WHERE clinic_id = $1`, [clinicId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM emr_encounters WHERE clinic_id = $1`, [clinicId]
    ),
  ]);
  return {
    patients:      patients.rows[0].n,
    appointments:  appts.rows[0].n,
    prescriptions: rxs.rows[0].n,
  };
}

async function autoAssignBase(clinicId) {
  await pool.query(
    `INSERT INTO clinic_subscriptions (clinic_id, plan_id, billing_cycle, status)
     SELECT $1, id, 'free', 'active' FROM subscription_plans WHERE key = 'base'
     ON CONFLICT (clinic_id) DO NOTHING`,
    [clinicId],
  );
}

// ── GET /api/emr/subscription ────────────────────────────────────────────────

exports.getSubscription = async (req, res) => {
  try {
    const clinicId = req.emrUser.clinic_id;
    let sub = await getSubscription(clinicId);
    if (!sub) {
      await autoAssignBase(clinicId);
      sub = await getSubscription(clinicId);
    }
    const usage = await getUsage(clinicId);
    res.json({ subscription: sub, usage });
  } catch (err) {
    logger.error('[subscription] get failed:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/emr/subscription/license ────────────────────────────────────────
// Single source of truth: resolves full EffectiveLicense via EffectiveLicenseResolver

exports.getLicense = async (req, res) => {
  try {
    const { clinic_id, id: staff_id } = req.emrUser;
    if (!clinic_id || !staff_id) {
      return res.status(401).json({ error: 'Missing clinic or staff context' });
    }
    // Auto-provision base subscription if missing
    const existing = await getSubscription(clinic_id);
    if (!existing) await autoAssignBase(clinic_id);

    const license = await EffectiveLicenseResolver.resolveEffectiveLicenseSafely(clinic_id, staff_id);
    res.json(license);
  } catch (err) {
    logger.error('[subscription] getLicense failed:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/emr/subscription/plans ─────────────────────────────────────────

exports.getPlans = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM subscription_plans WHERE is_active = true ORDER BY id`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/emr/subscription/create-order ──────────────────────────────────

exports.createOrder = async (req, res) => {
  if (!['admin', 'owner'].includes(req.emrUser.role)) {
    return res.status(403).json({ error: 'Only clinic admins can manage subscriptions.' });
  }
  const { plan_key, billing_cycle, seat_count: rawSeatCount = 1 } = req.body;
  const seat_count = Math.max(1, Math.min(parseInt(rawSeatCount) || 1, 500));
  const clinicId = req.emrUser.clinic_id;

  try {
    const { rows: planRows } = await pool.query(
      `SELECT * FROM subscription_plans WHERE key = $1 AND is_active = true`,
      [plan_key],
    );
    if (!planRows.length) return res.status(404).json({ error: 'Plan not found' });
    const plan = planRows[0];

    const priceMap = {
      monthly: plan.price_monthly,
      yearly:  plan.price_yearly,
      '2year': plan.price_2year,
      '3year': plan.price_3year,
    };
    const pricePerSeat = priceMap[billing_cycle];
    if (!pricePerSeat && pricePerSeat !== 0) {
      return res.status(400).json({ error: 'Invalid billing_cycle' });
    }

    const amountPaise = pricePerSeat * seat_count;

    if (!rzp) {
      return res.status(503).json({ error: 'Payment gateway not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.' });
    }

    const order = await rzp.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      notes: {
        clinic_id:     String(clinicId),
        plan_key,
        billing_cycle,
        seat_count:    String(seat_count),
      },
    });

    // Log order in DB (use plan_id, not plan_key)
    await pool.query(
      `INSERT INTO subscription_orders
         (clinic_id, plan_id, seat_count, billing_cycle, amount_paise, razorpay_order_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
      [clinicId, plan.id, seat_count, billing_cycle, amountPaise, order.id],
    );

    res.json({
      order_id:   order.id,
      amount:     amountPaise,
      currency:   'INR',
      key_id:     process.env.RAZORPAY_KEY_ID,
      plan_name:  plan.display_name,
    });
  } catch (err) {
    logger.error('[subscription] create-order failed:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/emr/subscription/verify-payment ────────────────────────────────

exports.verifyPayment = async (req, res) => {
  if (!['admin', 'owner'].includes(req.emrUser.role)) {
    return res.status(403).json({ error: 'Only clinic admins can manage subscriptions.' });
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const clinicId = req.emrUser.clinic_id;

  try {
    // 1. Verify Razorpay HMAC signature
    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    const body   = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature || ''))) {
      return res.status(400).json({ error: 'Payment signature mismatch' });
    }

    // 2. Re-read stored order from DB — do NOT trust body params for plan/cycle/seats
    const { rows: orderRows } = await pool.query(
      `SELECT so.*, sp.key AS plan_key, sp.id AS plan_id_check
       FROM subscription_orders so
       JOIN subscription_plans sp ON sp.id = so.plan_id
       WHERE so.razorpay_order_id = $1 AND so.clinic_id = $2`,
      [razorpay_order_id, clinicId],
    );
    if (!orderRows.length) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderRows[0];

    // 3. Calculate expiry from stored order data
    const durationMap = { monthly: 1, yearly: 12, '2year': 24, '3year': 36 };
    const months      = durationMap[order.billing_cycle] || 1;
    const expiresAt   = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    // 4. Upsert subscription
    await pool.query(
      `INSERT INTO clinic_subscriptions
         (clinic_id, plan_id, seat_count, billing_cycle, status, started_at, expires_at, razorpay_order_id, razorpay_payment_id)
       VALUES ($1,$2,$3,$4,'active',NOW(),$5,$6,$7)
       ON CONFLICT (clinic_id) DO UPDATE SET
         plan_id             = EXCLUDED.plan_id,
         seat_count          = EXCLUDED.seat_count,
         billing_cycle       = EXCLUDED.billing_cycle,
         status              = 'active',
         started_at          = NOW(),
         expires_at          = EXCLUDED.expires_at,
         razorpay_order_id   = EXCLUDED.razorpay_order_id,
         razorpay_payment_id = EXCLUDED.razorpay_payment_id,
         updated_at          = NOW()`,
      [clinicId, order.plan_id, order.seat_count, order.billing_cycle, expiresAt, razorpay_order_id, razorpay_payment_id],
    );

    // 5. Keep legacy emr_clinics.plan in sync
    await pool.query('UPDATE emr_clinics SET plan = $1 WHERE id = $2', [order.plan_key, clinicId]);

    // 6. Mark order as paid
    await pool.query(
      `UPDATE subscription_orders SET status='paid', razorpay_payment_id=$1, paid_at=NOW()
       WHERE razorpay_order_id=$2`,
      [razorpay_payment_id, razorpay_order_id],
    );

    logger.info(`[subscription] clinic ${clinicId} upgraded to ${order.plan_key} via ${order.billing_cycle}`);
    const sub   = await getSubscription(clinicId);
    const usage = await getUsage(clinicId);
    res.json({ ok: true, subscription: sub, usage });
  } catch (err) {
    logger.error('[subscription] verify-payment failed:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/emr/subscription/activate-test ─────────────────────────────────
// Test-only endpoint: upgrade plan without payment (requires TEST_UPGRADE_SECRET)

exports.activateTestPlan = async (req, res) => {
  const secret = process.env.TEST_UPGRADE_SECRET || 'infer-qa-upgrade-2024';
  if (req.headers['x-test-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { plan_key = 'pro', billing_cycle = 'yearly', seat_count = 10 } = req.body;
  const clinicId = req.emrUser.clinic_id;
  try {
    const { rows: [plan] } = await pool.query(
      'SELECT * FROM subscription_plans WHERE key = $1 AND is_active = true', [plan_key]
    );
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const durationMap = { monthly: 1, yearly: 12, '2year': 24, '3year': 36 };
    const months = durationMap[billing_cycle] || 12;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    await pool.query(
      `INSERT INTO clinic_subscriptions
         (clinic_id, plan_id, seat_count, billing_cycle, status, started_at, expires_at)
       VALUES ($1,$2,$3,$4,'active',NOW(),$5)
       ON CONFLICT (clinic_id) DO UPDATE SET
         plan_id       = EXCLUDED.plan_id,
         seat_count    = EXCLUDED.seat_count,
         billing_cycle = EXCLUDED.billing_cycle,
         status        = 'active',
         started_at    = NOW(),
         expires_at    = EXCLUDED.expires_at,
         updated_at    = NOW()`,
      [clinicId, plan.id, seat_count, billing_cycle, expiresAt]
    );
    await pool.query('UPDATE emr_clinics SET plan = $1 WHERE id = $2', [plan_key, clinicId]);

    logger.info(`[subscription] test-activate clinic ${clinicId} → ${plan_key}`);
    const sub = await getSubscription(clinicId);
    res.json({ ok: true, subscription: sub });
  } catch (err) {
    logger.error('[subscription] activate-test failed:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/emr/webhook/billing ────────────────────────────────────────────
// Razorpay server-side webhook with idempotency via subscription_webhook_log

exports.handleWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.warn('[webhook] RAZORPAY_WEBHOOK_SECRET not configured — webhook rejected');
      return res.status(503).json({ error: 'Webhook not configured' });
    }

    const signature = req.headers['x-razorpay-signature'];
    // rawBody is captured by the global body-parser middleware in server.js
    const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body));

    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''))) {
      logger.warn('[webhook] Invalid Razorpay signature');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : req.body;
    const result = await BillingService.processPaymentWebhook(payload);

    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error('[webhook] billing failed:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── Pro-only feature gate ─────────────────────────────────────────────────────
// Usage: router.post('/docassist', proOnlyCheck('ai_docassist'), handler)

exports.proOnlyCheck = (feature) => async (req, res, next) => {
  try {
    const clinicId = req.emrUser?.clinic_id;
    if (!clinicId) return res.status(401).json({ error: 'Unauthorized' });

    const sub = await getSubscription(clinicId);

    if (
      sub?.plan_key === 'pro' &&
      ['active', 'trial'].includes(sub.status) &&
      (!sub.expires_at || new Date(sub.expires_at) >= new Date())
    ) {
      return next();
    }

    return res.status(402).json({
      error:   'pro_required',
      feature,
      message: 'This feature is available on Infer Pro only. Please upgrade your plan.',
    });
  } catch (err) {
    logger.error('[pro-check] failed:', err.message);
    // Fail closed on errors — do not silently allow access
    return res.status(503).json({ error: 'Subscription service unavailable. Please try again.' });
  }
};

// ── Subscription limit check middleware ───────────────────────────────────────
// Usage: router.post('/patients', subscriptionCheck('patients'), ...)

exports.subscriptionCheck = (resource) => async (req, res, next) => {
  try {
    const clinicId = req.emrUser?.clinic_id;
    if (!clinicId) return next();

    const sub = await getSubscription(clinicId);

    // No subscription found — assign base and allow through
    if (!sub) return next();

    const isPro    = sub.plan_key === 'pro';
    const isActive = ['active', 'trial'].includes(sub.status);
    const isExpired = sub.expires_at && new Date(sub.expires_at) < new Date();

    // Active Pro (not expired) → unlimited access
    if (isPro && isActive && !isExpired) return next();

    // Expired Pro → fall back to base plan limits (not the pro plan's -1 unlimited)
    let planLimits = {
      patients:      sub.max_patients,
      appointments:  sub.max_appointments,
      prescriptions: sub.max_prescriptions,
    };
    if (isPro && isExpired) {
      const { rows: [basePlan] } = await pool.query(
        `SELECT max_patients, max_appointments, max_prescriptions FROM subscription_plans WHERE key = 'base'`
      );
      if (basePlan) {
        planLimits = {
          patients:      basePlan.max_patients,
          appointments:  basePlan.max_appointments,
          prescriptions: basePlan.max_prescriptions,
        };
      }
    }

    const limit = planLimits[resource];
    if (!limit || limit === -1) return next(); // unlimited

    const usage = await getUsage(clinicId);
    const used  = usage[resource] || 0;

    if (used >= limit) {
      return res.status(402).json({
        error:     'subscription_limit',
        resource,
        limit,
        used,
        plan:      sub.plan_key,
        plan_name: sub.display_name,
        message:   `You have reached the ${resource} limit (${limit}) on the ${sub.display_name}. Upgrade to Infer Pro for unlimited access.`,
      });
    }

    next();
  } catch (err) {
    logger.error('[subscription-check] failed:', err.message);
    return res.status(503).json({ error: 'Subscription service unavailable. Please try again.' });
  }
};
