const Razorpay = require('razorpay');
const crypto   = require('crypto');
const { pool } = require('../config/database');
const logger   = require('../utils/logger');

const rzp = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

// ── Helper ───────────────────────────────────────────────────────────────────

async function getSubscription(clinicId) {
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
      `SELECT COUNT(DISTINCT a.emr_patient_id)::int AS n
       FROM emr_appointments a WHERE a.clinic_id = $1`, [clinicId]
    ),
    pool.query(`SELECT COUNT(*)::int AS n FROM emr_appointments WHERE clinic_id = $1`, [clinicId]),
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

// ── GET /api/emr/subscription ────────────────────────────────────────────────

exports.getSubscription = async (req, res) => {
  try {
    const clinicId = req.emrUser.clinic_id;
    const sub = await getSubscription(clinicId);
    if (!sub) {
      await pool.query(
        `INSERT INTO clinic_subscriptions (clinic_id, plan_id, billing_cycle, status)
         SELECT $1, id, 'free', 'active' FROM subscription_plans WHERE key = 'base'
         ON CONFLICT (clinic_id) DO NOTHING`,
        [clinicId],
      );
      return exports.getSubscription(req, res);
    }
    const usage = await getUsage(clinicId);
    res.json({ subscription: sub, usage });
  } catch (err) {
    logger.error('[subscription] get failed:', err.message, err.stack);
    res.status(500).json({ error: err.message, detail: err.detail || err.stack });
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
  const { plan_key, billing_cycle, seat_count = 1 } = req.body;
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

    // Log order in DB
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
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_key, billing_cycle, seat_count = 1 } = req.body;
  const clinicId = req.emrUser.clinic_id;

  try {
    // Verify Razorpay signature
    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    const body   = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment signature mismatch' });
    }

    // Get plan
    const { rows: planRows } = await pool.query(
      `SELECT * FROM subscription_plans WHERE key = $1`, [plan_key],
    );
    if (!planRows.length) return res.status(404).json({ error: 'Plan not found' });
    const plan = planRows[0];

    // Calculate expiry
    const durationMap = { monthly: 1, yearly: 12, '2year': 24, '3year': 36 };
    const months      = durationMap[billing_cycle] || 12;
    const expiresAt   = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    // Update or insert subscription
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
      [clinicId, plan.id, seat_count, billing_cycle, expiresAt, razorpay_order_id, razorpay_payment_id],
    );

    // Mark order as paid
    await pool.query(
      `UPDATE subscription_orders SET status='paid', razorpay_payment_id=$1, paid_at=NOW()
       WHERE razorpay_order_id=$2`,
      [razorpay_payment_id, razorpay_order_id],
    );

    logger.info(`[subscription] clinic ${clinicId} upgraded to ${plan_key} via ${billing_cycle}`);
    const sub = await getSubscription(clinicId);
    const usage = await getUsage(clinicId);
    res.json({ ok: true, subscription: sub, usage });
  } catch (err) {
    logger.error('[subscription] verify-payment failed:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── Pro-only feature gate ─────────────────────────────────────────────────────
// Blocks access to AI features for non-pro (base) clinics.
// Usage: router.post('/docassist', proOnlyCheck('ai_docassist'), handler)

exports.proOnlyCheck = (feature) => async (req, res, next) => {
  try {
    const clinicId = req.emrUser?.clinic_id;
    if (!clinicId) return next();

    const sub = await getSubscription(clinicId);

    // Allow if pro and active/not expired
    if (sub?.plan_key === 'pro' && sub.status === 'active') {
      if (!sub.expires_at || new Date(sub.expires_at) >= new Date()) return next();
    }

    return res.status(402).json({
      error:    'pro_required',
      feature,
      message:  'This feature is available on Infer Pro only. Please upgrade your plan.',
    });
  } catch (err) {
    logger.error('[pro-check] failed:', err.message);
    next(); // fail open
  }
};

// ── Subscription limit check middleware ───────────────────────────────────────
// Usage: router.post('/patients', subscriptionCheck('patients'), ...)

exports.subscriptionCheck = (resource) => async (req, res, next) => {
  try {
    const clinicId = req.emrUser?.clinic_id;
    if (!clinicId) return next();

    const sub = await getSubscription(clinicId);
    if (!sub || sub.plan_key === 'pro' || sub.status !== 'active') return next();

    // Check expiry
    if (sub.expires_at && new Date(sub.expires_at) < new Date()) {
      // Expired pro — don't block, let them continue on base limits
    }

    const limits = {
      patients:      sub.max_patients,
      appointments:  sub.max_appointments,
      prescriptions: sub.max_prescriptions,
    };

    const limit = limits[resource];
    if (!limit || limit === -1) return next(); // unlimited

    const usage = await getUsage(clinicId);
    const used  = usage[resource] || 0;

    if (used >= limit) {
      return res.status(402).json({
        error:       'subscription_limit',
        resource,
        limit,
        used,
        plan:        sub.plan_key,
        plan_name:   sub.display_name,
        message:     `You have reached the ${resource} limit (${limit}) on the ${sub.display_name}. Upgrade to Infer Pro for unlimited access.`,
      });
    }

    next();
  } catch (err) {
    logger.error('[subscription-check] failed:', err.message);
    next(); // fail open — don't block clinical workflow
  }
};
