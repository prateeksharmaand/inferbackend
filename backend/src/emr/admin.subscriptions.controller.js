const { pool } = require('../config/database');

// ── GET /api/admin/subscriptions ──────────────────────────────────────────────

exports.listSubscriptions = async (req, res) => {
  const { status, plan } = req.query;
  let where = 'WHERE 1=1';
  const params = [];

  if (status) { params.push(status); where += ` AND cs.status = $${params.length}`; }
  if (plan)   { params.push(plan);   where += ` AND sp.key = $${params.length}`; }

  const { rows } = await pool.query(
    `SELECT cs.*, c.name AS clinic_name, c.email AS clinic_email, c.status AS clinic_status,
            sp.key AS plan_key, sp.display_name AS plan_name,
            sp.price_monthly, sp.price_yearly
     FROM clinic_subscriptions cs
     JOIN emr_clinics       c  ON c.id  = cs.clinic_id
     JOIN subscription_plans sp ON sp.id = cs.plan_id
     ${where}
     ORDER BY cs.created_at DESC`,
    params
  );
  res.json(rows);
};

// ── PATCH /api/admin/subscriptions/:clinic_id ─────────────────────────────────
// Manually override plan / status / expiry

exports.updateSubscription = async (req, res) => {
  const { clinic_id } = req.params;
  const { plan_key, status, billing_cycle, expires_at, notes } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let planId;
    if (plan_key) {
      const { rows: [plan] } = await client.query(
        'SELECT id FROM subscription_plans WHERE key = $1', [plan_key]
      );
      if (!plan) return res.status(400).json({ error: `Unknown plan: ${plan_key}` });
      planId = plan.id;
    }

    const { rows } = await client.query(
      `UPDATE clinic_subscriptions
       SET plan_id      = COALESCE($1, plan_id),
           status       = COALESCE($2, status),
           billing_cycle= COALESCE($3, billing_cycle),
           expires_at   = COALESCE($4::timestamptz, expires_at),
           notes        = COALESCE($5, notes),
           updated_at   = NOW()
       WHERE clinic_id = $6 RETURNING *`,
      [planId || null, status, billing_cycle, expires_at || null, notes, clinic_id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Subscription not found' });

    // Also sync plan key on emr_clinics.plan (legacy column)
    if (plan_key) {
      await client.query(`UPDATE emr_clinics SET plan = $1 WHERE id = $2`, [plan_key, clinic_id]);
    }

    await client.query(
      `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details)
       VALUES ($1,'update_subscription','clinic',$2,$3)`,
      [req.adminUser.id, clinic_id, JSON.stringify(req.body)]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── GET /api/admin/subscriptions/revenue ──────────────────────────────────────

exports.getRevenue = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       DATE_TRUNC('month', paid_at) AS month,
       COUNT(*)::int                AS orders,
       SUM(amount_paise)::bigint    AS total_paise
     FROM subscription_orders
     WHERE status = 'paid'
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT 12`
  );
  res.json(rows);
};

// ── GET /api/admin/subscription-catalog ──────────────────────────────────────

exports.getCatalog = async (req, res) => {
  const [seats, addons, clinics] = await Promise.all([
    pool.query(`SELECT * FROM subscription_seat_types WHERE is_active = true ORDER BY id`),
    pool.query(`SELECT * FROM subscription_addons WHERE is_active = true ORDER BY id`),
    pool.query(`SELECT id, name FROM emr_clinics ORDER BY name`),
  ]);
  res.json({ seats: seats.rows, addons: addons.rows, clinics: clinics.rows });
};

// ── POST /api/admin/subscriptions/create ─────────────────────────────────────
// Manually create a detailed subscription for a clinic (seat-based)

exports.createSubscription = async (req, res) => {
  const {
    clinic_id, billing_cycle, status = 'active',
    expires_at, notes,
    seats = [],   // [{ key, quantity }]
    addons = [],  // [{ key, quantity }]
  } = req.body;

  if (!clinic_id || !billing_cycle)
    return res.status(400).json({ error: 'clinic_id and billing_cycle required' });

  const priceCol = { monthly: 'price_monthly', yearly: 'price_yearly', '2year': 'price_2year', '3year': 'price_3year' }[billing_cycle];
  if (!priceCol) return res.status(400).json({ error: 'Invalid billing_cycle' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Resolve seat prices
    const seatItems = [];
    for (const s of seats.filter(s => s.quantity > 0)) {
      const { rows: [st] } = await client.query(
        `SELECT * FROM subscription_seat_types WHERE key = $1`, [s.key]
      );
      if (!st) throw new Error(`Unknown seat type: ${s.key}`);
      seatItems.push({ key: st.key, display_name: st.display_name, quantity: s.quantity, unit_price_paise: st[priceCol] });
    }

    // Resolve addon prices
    const addonItems = [];
    for (const a of addons.filter(a => a.quantity > 0)) {
      const { rows: [ao] } = await client.query(
        `SELECT * FROM subscription_addons WHERE key = $1`, [a.key]
      );
      if (!ao) throw new Error(`Unknown addon: ${a.key}`);
      addonItems.push({ key: ao.key, display_name: ao.display_name, quantity: a.quantity, unit_price_paise: ao[priceCol] });
    }

    // Clear existing line items
    await client.query(`DELETE FROM clinic_subscription_items WHERE clinic_id = $1`, [clinic_id]);

    // Insert new line items
    for (const item of [...seatItems, ...addonItems]) {
      await client.query(
        `INSERT INTO clinic_subscription_items (clinic_id, item_type, item_key, display_name, quantity, unit_price_paise, billing_cycle)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [clinic_id, seatItems.includes(item) ? 'seat' : 'addon', item.key, item.display_name, item.quantity, item.unit_price_paise, billing_cycle]
      );
    }

    // Upsert clinic_subscriptions with 'pro' plan (has seats → treat as pro)
    const { rows: [plan] } = await client.query(`SELECT id FROM subscription_plans WHERE key = 'pro'`);
    await client.query(
      `INSERT INTO clinic_subscriptions (clinic_id, plan_id, billing_cycle, status, expires_at, notes)
       VALUES ($1,$2,$3,$4,$5::timestamptz,$6)
       ON CONFLICT (clinic_id) DO UPDATE SET
         plan_id = EXCLUDED.plan_id, billing_cycle = EXCLUDED.billing_cycle,
         status = EXCLUDED.status, expires_at = EXCLUDED.expires_at,
         notes = EXCLUDED.notes, updated_at = NOW()`,
      [clinic_id, plan.id, billing_cycle, status, expires_at || null, notes || null]
    );

    await client.query(`UPDATE emr_clinics SET plan = 'pro' WHERE id = $1`, [clinic_id]);

    await client.query(
      `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details)
       VALUES ($1,'create_subscription','clinic',$2,$3)`,
      [req.adminUser.id, clinic_id, JSON.stringify({ billing_cycle, seats: seatItems, addons: addonItems })]
    );

    await client.query('COMMIT');

    const totalPaise = [...seatItems, ...addonItems]
      .reduce((sum, i) => sum + i.unit_price_paise * i.quantity, 0);

    res.status(201).json({ message: 'Subscription created', total_paise: totalPaise });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── GET /api/admin/subscriptions/:clinic_id/items ────────────────────────────

exports.getSubscriptionItems = async (req, res) => {
  const { clinic_id } = req.params;
  const { rows } = await pool.query(
    `SELECT * FROM clinic_subscription_items WHERE clinic_id = $1 ORDER BY item_type, id`,
    [clinic_id]
  );
  res.json(rows);
};

// ── GET /api/admin/audit-logs ─────────────────────────────────────────────────

exports.getAuditLogs = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT al.*, sa.name AS admin_name, sa.email AS admin_email
     FROM admin_audit_logs al
     JOIN superadmins sa ON sa.id = al.admin_id
     ORDER BY al.created_at DESC
     LIMIT 200`
  );
  res.json(rows);
};
