/**
 * Analytics Service
 * Lab performance metrics and reporting
 */

const { query } = require('../../config/database');

class AnalyticsService {
  async getDashboard(lab_id, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();

    const [volume, tat, critical, revenue] = await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status != 'CANCELLED') AS total_orders,
           COUNT(*) FILTER (WHERE status IN ('RESULTED','REPORTED')) AS completed_orders,
           COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled_orders,
           COUNT(*) FILTER (WHERE priority = 'STAT') AS stat_orders,
           COUNT(*) FILTER (WHERE priority = 'URGENT') AS urgent_orders,
           COUNT(*) FILTER (WHERE status = 'PENDING') AS "PENDING",
           COUNT(*) FILTER (WHERE status = 'SCHEDULED') AS "SCHEDULED",
           COUNT(*) FILTER (WHERE status = 'COLLECTED') AS "COLLECTED",
           COUNT(*) FILTER (WHERE status = 'RECEIVED') AS "RECEIVED",
           COUNT(*) FILTER (WHERE status = 'PROCESSING') AS "PROCESSING",
           COUNT(*) FILTER (WHERE status = 'RESULTED') AS "RESULTED",
           COUNT(*) FILTER (WHERE status = 'REPORTED') AS "REPORTED"
         FROM lab_orders WHERE lab_id = $1 AND created_at >= $2`,
        [lab_id, sinceISO]
      ),
      query(
        `SELECT
           AVG(EXTRACT(EPOCH FROM (reported_at - created_at))/3600) AS avg_tat_hours,
           MIN(EXTRACT(EPOCH FROM (reported_at - created_at))/3600) AS min_tat_hours,
           MAX(EXTRACT(EPOCH FROM (reported_at - created_at))/3600) AS max_tat_hours
         FROM lab_orders
         WHERE lab_id = $1 AND created_at >= $2 AND reported_at IS NOT NULL`,
        [lab_id, sinceISO]
      ),
      query(
        `SELECT COUNT(*) AS critical_count
         FROM lab_test_results ltr
         WHERE ltr.lab_id = $1 AND ltr.collection_timestamp >= $2 AND ltr.is_critical_value = TRUE`,
        [lab_id, sinceISO]
      ),
      query(
        `SELECT COALESCE(SUM(total_cost),0) AS total_revenue
         FROM lab_orders WHERE lab_id = $1 AND created_at >= $2 AND status != 'CANCELLED'`,
        [lab_id, sinceISO]
      ),
    ]);

    // total_patients in a separate try so a missing column doesn't kill the whole response
    let total_patients = 0;
    try {
      const ptRes = await query(
        `SELECT COUNT(DISTINCT COALESCE(patient_uhid, patient_id::text)) AS cnt
         FROM lab_orders WHERE lab_id = $1 AND created_at >= $2`,
        [lab_id, sinceISO]
      );
      total_patients = Number(ptRes.rows[0]?.cnt) || 0;
    } catch { /* migration not yet run — ignore */ }

    return {
      lab_id,
      period_days: days,
      orders: { ...volume.rows[0], total_patients },
      turnaround: tat.rows[0],
      critical_values: critical.rows[0],
      revenue: revenue.rows[0],
    };
  }

  async getTestVolume(lab_id, start_date, end_date) {
    const params = [lab_id];
    let where = 'lo.lab_id = $1';
    let idx = 2;
    if (start_date) { where += ` AND lo.created_at >= $${idx++}`; params.push(start_date); }
    if (end_date) { where += ` AND lo.created_at <= $${idx++}`; params.push(end_date); }

    const res = await query(
      `SELECT oi.test_code, oi.test_name,
              COUNT(*) AS order_count,
              COUNT(*) FILTER (WHERE oi.status = 'RESULTED') AS resulted_count
       FROM lab_order_items oi
       JOIN lab_orders lo ON lo.id = oi.order_id
       WHERE ${where}
       GROUP BY oi.test_code, oi.test_name
       ORDER BY order_count DESC`,
      params
    );
    return res.rows;
  }

  async getTurnaroundStats(lab_id, start_date, end_date) {
    const params = [lab_id];
    let where = 'lo.lab_id = $1 AND lo.reported_at IS NOT NULL';
    let idx = 2;
    if (start_date) { where += ` AND lo.created_at >= $${idx++}`; params.push(start_date); }
    if (end_date) { where += ` AND lo.created_at <= $${idx++}`; params.push(end_date); }

    const res = await query(
      `SELECT
           oi.test_code,
           oi.test_name,
           COUNT(*) AS sample_count,
           AVG(EXTRACT(EPOCH FROM (lo.reported_at - lo.created_at))/3600) AS avg_hours,
           MIN(EXTRACT(EPOCH FROM (lo.reported_at - lo.created_at))/3600) AS min_hours,
           MAX(EXTRACT(EPOCH FROM (lo.reported_at - lo.created_at))/3600) AS max_hours,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (lo.reported_at - lo.created_at))/3600) AS median_hours
       FROM lab_order_items oi
       JOIN lab_orders lo ON lo.id = oi.order_id
       WHERE ${where}
       GROUP BY oi.test_code, oi.test_name
       ORDER BY avg_hours DESC`,
      params
    );
    return res.rows;
  }

  async getCriticalValueStats(lab_id, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const res = await query(
      `SELECT
           ltr.test_code,
           ltr.test_name,
           COUNT(*) AS critical_count,
           AVG(ltr.result_value::numeric) AS avg_critical_value
       FROM lab_test_results ltr
       WHERE ltr.lab_id = $1 AND ltr.is_critical_value = TRUE AND ltr.collection_timestamp >= $2
       GROUP BY ltr.test_code, ltr.test_name
       ORDER BY critical_count DESC`,
      [lab_id, since.toISOString()]
    );
    return res.rows;
  }

  async getRevenueStats(lab_id, start_date, end_date) {
    const params = [lab_id];
    let where = `lo.lab_id = $1 AND lo.status != 'CANCELLED'`;
    let idx = 2;
    if (start_date) { where += ` AND lo.created_at >= $${idx++}`; params.push(start_date); }
    if (end_date) { where += ` AND lo.created_at <= $${idx++}`; params.push(end_date); }

    const [summary, daily] = await Promise.all([
      query(
        `SELECT
           COALESCE(SUM(total_cost),0) AS total_revenue,
           COUNT(*) AS billed_orders,
           AVG(total_cost) AS avg_order_value
         FROM lab_orders lo WHERE ${where}`,
        params
      ),
      query(
        `SELECT DATE(lo.created_at) AS date,
                COALESCE(SUM(total_cost),0) AS daily_revenue,
                COUNT(*) AS orders
         FROM lab_orders lo WHERE ${where}
         GROUP BY DATE(lo.created_at)
         ORDER BY date ASC`,
        params
      ),
    ]);

    return { summary: summary.rows[0], daily: daily.rows };
  }

  async getComplianceReport(lab_id, start_date, end_date) {
    const params = [lab_id];
    let where = 'lo.lab_id = $1';
    let idx = 2;
    if (start_date) { where += ` AND lo.created_at >= $${idx++}`; params.push(start_date); }
    if (end_date) { where += ` AND lo.created_at <= $${idx++}`; params.push(end_date); }

    const res = await query(
      `SELECT
           COUNT(*) AS total_ordered,
           COUNT(*) FILTER (WHERE status IN ('RESULTED','REPORTED')) AS completed,
           COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
           COUNT(*) FILTER (WHERE reported_at IS NOT NULL
             AND EXTRACT(EPOCH FROM (reported_at - created_at))/3600 <= 24) AS tat_met_24h,
           COUNT(*) FILTER (WHERE reported_at IS NOT NULL
             AND EXTRACT(EPOCH FROM (reported_at - created_at))/3600 <= 48) AS tat_met_48h,
           AVG(EXTRACT(EPOCH FROM (reported_at - created_at))/3600)
             FILTER (WHERE reported_at IS NOT NULL) AS avg_tat_hours
       FROM lab_orders lo WHERE ${where}`,
      params
    );

    const row = res.rows[0];
    const total = parseInt(row.total_ordered) || 0;
    const completed = parseInt(row.completed) || 0;

    return {
      lab_id,
      period: { start_date, end_date },
      total_ordered: total,
      completed,
      cancelled: parseInt(row.cancelled) || 0,
      completion_rate: total > 0 ? ((completed / total) * 100).toFixed(2) + '%' : '0%',
      tat_compliance_24h: completed > 0 ? ((parseInt(row.tat_met_24h) / completed) * 100).toFixed(2) + '%' : '0%',
      tat_compliance_48h: completed > 0 ? ((parseInt(row.tat_met_48h) / completed) * 100).toFixed(2) + '%' : '0%',
      avg_tat_hours: row.avg_tat_hours ? parseFloat(row.avg_tat_hours).toFixed(2) : null,
    };
  }

  async snapshotDaily(lab_id, date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const [orders, critical, revenue, testCounts] = await Promise.all([
      query(
        `SELECT
           COUNT(*) AS total_orders,
           COUNT(*) FILTER (WHERE status IN ('RESULTED','REPORTED')) AS completed_orders,
           COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled_orders,
           AVG(EXTRACT(EPOCH FROM (reported_at - created_at))/3600)
             FILTER (WHERE reported_at IS NOT NULL) AS avg_tat
         FROM lab_orders
         WHERE lab_id = $1 AND created_at BETWEEN $2 AND $3`,
        [lab_id, dayStart.toISOString(), dayEnd.toISOString()]
      ),
      query(
        `SELECT COUNT(*) AS critical_count
         FROM lab_test_results ltr
         WHERE ltr.lab_id = $1 AND ltr.collection_timestamp BETWEEN $2 AND $3 AND ltr.is_critical_value = TRUE`,
        [lab_id, dayStart.toISOString(), dayEnd.toISOString()]
      ),
      query(
        `SELECT COALESCE(SUM(total_cost),0) AS total_revenue
         FROM lab_orders WHERE lab_id = $1 AND created_at BETWEEN $2 AND $3 AND status != 'CANCELLED'`,
        [lab_id, dayStart.toISOString(), dayEnd.toISOString()]
      ),
      query(
        `SELECT oi.test_code, COUNT(*) AS cnt
         FROM lab_order_items oi
         JOIN lab_orders lo ON lo.id = oi.order_id
         WHERE lo.lab_id = $1 AND lo.created_at BETWEEN $2 AND $3
         GROUP BY oi.test_code`,
        [lab_id, dayStart.toISOString(), dayEnd.toISOString()]
      ),
    ]);

    const testCountsMap = {};
    for (const row of testCounts.rows) testCountsMap[row.test_code] = parseInt(row.cnt);

    const snap = orders.rows[0];
    const dateStr = dayStart.toISOString().split('T')[0];

    const res = await query(
      `INSERT INTO lab_analytics_daily
         (lab_id, date, total_orders, completed_orders, cancelled_orders,
          critical_value_count, avg_turnaround_hours, total_revenue, test_counts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (lab_id, date) DO UPDATE SET
         total_orders = EXCLUDED.total_orders,
         completed_orders = EXCLUDED.completed_orders,
         cancelled_orders = EXCLUDED.cancelled_orders,
         critical_value_count = EXCLUDED.critical_value_count,
         avg_turnaround_hours = EXCLUDED.avg_turnaround_hours,
         total_revenue = EXCLUDED.total_revenue,
         test_counts = EXCLUDED.test_counts
       RETURNING *`,
      [
        lab_id,
        dateStr,
        parseInt(snap.total_orders) || 0,
        parseInt(snap.completed_orders) || 0,
        parseInt(snap.cancelled_orders) || 0,
        parseInt(critical.rows[0].critical_count) || 0,
        snap.avg_tat ? parseFloat(snap.avg_tat).toFixed(2) : null,
        parseFloat(revenue.rows[0].total_revenue) || 0,
        JSON.stringify(testCountsMap),
      ]
    );

    return res.rows[0];
  }
}

module.exports = new AnalyticsService();
