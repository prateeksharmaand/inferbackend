/**
 * EMR Analytics — Form 25 (Income-tax Rules 2026, Rule 6F)
 * Daily case register for medical practitioners
 * Required for gross receipts > ₹1,50,000 in any of last 3 FYs
 */
const { pool } = require('../config/database');

// GET /api/emr/analytics/form25
// Query: from, to, doctor_id, search, page, limit
const getForm25 = async (req, res) => {
  const {
    from, to, doctor_id, search,
    page = 1, limit = 50,
  } = req.query;

  const clinicId = req.emrUser.clinic_id;
  const offset   = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  // Default: last 30 days
  const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const dateTo   = to   || new Date().toISOString().slice(0, 10);

  const params  = [clinicId, dateFrom, dateTo];
  let whereParts = [];

  if (doctor_id) { params.push(doctor_id); whereParts.push(`a.doctor_id = $${params.length}`); }
  if (search)    {
    params.push(`%${search}%`);
    whereParts.push(
      `(LOWER(COALESCE(r.patient_name, a.patient_name)) LIKE LOWER($${params.length})
        OR LOWER(CONCAT(COALESCE(c.uhid_prefix,'RX'),'-',r.id)) LIKE LOWER($${params.length}))`
    );
  }

  const extraWhere = whereParts.length ? `AND ${whereParts.join(' AND ')}` : '';

  const baseSql = `
    FROM emr_receipts r
    JOIN emr_appointments a ON a.id = r.appointment_id
    LEFT JOIN emr_doctors d ON d.id = a.doctor_id
    JOIN emr_clinics c ON c.id = r.clinic_id
    WHERE r.clinic_id = $1
      AND r.created_at::date >= $2
      AND r.created_at::date <= $3
      ${extraWhere}
  `;

  // Total count + sum for this filter
  const { rows: [totals] } = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(r.grand_total), 0) AS total_collected ${baseSql}`,
    params
  );

  // Paginated records
  const dataParams = [...params, parseInt(limit, 10), offset];
  const { rows } = await pool.query(
    `SELECT
       a.appointment_date,
       r.created_at::date          AS receipt_date,
       d.name                      AS doctor_name,
       c.name                      AS clinic_name,
       CONCAT(COALESCE(NULLIF(c.uhid_prefix,''), 'RX'), '-', r.id) AS receipt_number,
       COALESCE(r.patient_name, a.patient_name, 'Unknown') AS patient_name,
       a.uhid,
       (SELECT COALESCE(STRING_AGG(item->>'name', ', '), 'Consultation')
        FROM jsonb_array_elements(r.items) AS item
        WHERE (item->>'name') IS NOT NULL AND (item->>'name') <> '') AS service_name,
       r.grand_total               AS amount_collected,
       r.total_discount,
       r.paymode,
       r.remarks,
       r.id                        AS receipt_id
     ${baseSql}
     ORDER BY a.appointment_date DESC, r.created_at DESC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );

  res.json({
    records: rows,
    total:            parseInt(totals.total, 10),
    total_collected:  parseFloat(totals.total_collected),
    page:             parseInt(page, 10),
    limit:            parseInt(limit, 10),
    from: dateFrom,
    to:   dateTo,
  });
};

// GET /api/emr/analytics/form25/summary — monthly totals for current FY
const getForm25Summary = async (req, res) => {
  const clinicId = req.emrUser.clinic_id;

  // Current financial year: April 1 of this/last year
  const now = new Date();
  const fyStart = now.getMonth() >= 3
    ? `${now.getFullYear()}-04-01`
    : `${now.getFullYear() - 1}-04-01`;

  const { rows } = await pool.query(
    `SELECT
       TO_CHAR(DATE_TRUNC('month', r.created_at), 'Mon YYYY') AS month,
       DATE_TRUNC('month', r.created_at)                       AS month_start,
       COUNT(*)                                                 AS receipt_count,
       COALESCE(SUM(r.grand_total), 0)                         AS total_collected
     FROM emr_receipts r
     JOIN emr_appointments a ON a.id = r.appointment_id
     WHERE r.clinic_id = $1 AND r.created_at::date >= $2
     GROUP BY DATE_TRUNC('month', r.created_at)
     ORDER BY month_start DESC`,
    [clinicId, fyStart]
  );

  const fyTotal = rows.reduce((s, r) => s + parseFloat(r.total_collected), 0);
  res.json({ months: rows, fy_total: fyTotal, fy_start: fyStart });
};

module.exports = { getForm25, getForm25Summary };
