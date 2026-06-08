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
