/**
 * EMR Analytics Controller
 * Endpoints: appointments, patients, real-time report, prescriptions, Form 25
 */
const { pool } = require('../config/database');

// ── Shared date helpers ───────────────────────────────────────────────────
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);
function fyStart() {
  const now = new Date();
  const yr  = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${yr}-04-01`;
}

// ═══════════════════════════════════════════════════════════════════════════
// APPOINTMENT DASHBOARD
// GET /api/emr/analytics/appointments?from&to&doctor_id
// ═══════════════════════════════════════════════════════════════════════════
const getAppointmentDashboard = async (req, res) => {
  const cid   = req.emrUser.clinic_id;
  const from  = req.query.from || daysAgo(30);
  const to    = req.query.to   || todayStr();
  const docId = req.query.doctor_id || null;

  const base = docId
    ? `WHERE a.clinic_id=$1 AND a.appointment_date BETWEEN $2 AND $3 AND a.doctor_id=$4`
    : `WHERE a.clinic_id=$1 AND a.appointment_date BETWEEN $2 AND $3`;
  const p = docId ? [cid, from, to, docId] : [cid, from, to];

  const [kpi, weekly, rxTrend, statusDist, channelDist, newVsOld,
         toolUsage, dailyReport, next30] = await Promise.all([

    // KPIs
    pool.query(`
      SELECT
        COUNT(*)                                                           AS total,
        ROUND(AVG(CASE
          WHEN a.checked_in_at IS NOT NULL AND a.appointment_time IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (
                 a.checked_in_at - (a.appointment_date + a.appointment_time)
               )) / 60)
          END)::numeric, 1)                                               AS avg_wait_min,
        ROUND(AVG(CASE
          WHEN a.checked_in_at IS NOT NULL AND a.completed_at IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (a.completed_at - a.checked_in_at)) / 60)
          END)::numeric, 1)                                               AS avg_consult_min,
        COUNT(*) FILTER (WHERE a.status = 'completed')                   AS completed,
        COUNT(*) FILTER (WHERE a.status = 'cancelled')                   AS cancelled
      FROM emr_appointments a ${base}`, p),

    // Weekly appointment trend (last 8 weeks from 'to')
    pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('week', a.appointment_date), 'DD Mon') AS week,
             COUNT(*) AS count
      FROM emr_appointments a
      WHERE a.clinic_id=$1 AND a.appointment_date >= $2::date - 49 AND a.appointment_date <= $3
      GROUP BY DATE_TRUNC('week', a.appointment_date)
      ORDER BY DATE_TRUNC('week', a.appointment_date)`, [cid, from, to]),

    // Weekly Rx trend
    pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('week', a.appointment_date), 'DD Mon') AS week,
             COUNT(e.id) AS count
      FROM emr_appointments a
      LEFT JOIN emr_encounters e ON e.appointment_id = a.id
      WHERE a.clinic_id=$1 AND a.appointment_date >= $2::date - 49 AND a.appointment_date <= $3
      GROUP BY DATE_TRUNC('week', a.appointment_date)
      ORDER BY DATE_TRUNC('week', a.appointment_date)`, [cid, from, to]),

    // Status distribution
    pool.query(`
      SELECT INITCAP(REPLACE(a.status,'_',' ')) AS name, COUNT(*) AS value
      FROM emr_appointments a ${base}
      GROUP BY a.status ORDER BY value DESC`, p),

    // Channel distribution
    pool.query(`
      SELECT INITCAP(REPLACE(COALESCE(a.channel,'walk_in'),'_',' ')) AS name,
             COUNT(*) AS value
      FROM emr_appointments a ${base}
      GROUP BY a.channel ORDER BY value DESC`, p),

    // New vs returning patient (based on whether it's first visit)
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_first = 1) AS new_patients,
        COUNT(*) FILTER (WHERE is_first = 0) AS old_patients
      FROM (
        SELECT a.id,
          CASE WHEN a.patient_mobile IS NOT NULL AND a.patient_mobile != ''
               THEN (SELECT COUNT(*) FROM emr_appointments p
                     WHERE p.clinic_id = a.clinic_id
                       AND p.patient_mobile = a.patient_mobile
                       AND p.id < a.id)
               ELSE 0 END AS is_first
        FROM emr_appointments a ${base}
      ) sq`, p),

    // Tool usage (encounters with different content)
    pool.query(`
      SELECT
        COUNT(e.id)                                        AS total_rx,
        COUNT(e.id) FILTER (WHERE e.vitals != '{}')        AS with_vitals,
        COUNT(e.id) FILTER (WHERE e.canvas_image IS NOT NULL) AS with_canvas,
        COUNT(e.id) FILTER (WHERE jsonb_array_length(e.symptoms) > 0)   AS with_symptoms,
        COUNT(e.id) FILTER (WHERE jsonb_array_length(e.medications) > 0) AS with_meds,
        COUNT(e.id) FILTER (WHERE jsonb_array_length(e.lab_investigations) > 0) AS with_labs,
        COUNT(e.id) FILTER (WHERE jsonb_array_length(e.diagnosis) > 0)  AS with_diagnosis
      FROM emr_appointments a
      LEFT JOIN emr_encounters e ON e.appointment_id = a.id
      ${base.replace('WHERE a.', 'WHERE a.')}`, p),

    // Daily appointments report
    pool.query(`
      SELECT a.appointment_date::text AS date,
             COUNT(*)                                                  AS total,
             COUNT(*) FILTER (WHERE a.status='completed')              AS completed,
             COUNT(*) FILTER (WHERE a.status IN ('cancelled','no_show')) AS cancelled
      FROM emr_appointments a ${base}
      GROUP BY a.appointment_date ORDER BY a.appointment_date DESC
      LIMIT 30`, p),

    // Next 30 days upcoming
    pool.query(`
      SELECT appointment_date::text AS date, COUNT(*) AS count
      FROM emr_appointments
      WHERE clinic_id=$1 AND appointment_date > CURRENT_DATE
        AND appointment_date <= CURRENT_DATE + 30
        AND status IN ('booked','rescheduled')
      GROUP BY appointment_date ORDER BY appointment_date
      LIMIT 30`, [cid]),
  ]);

  // Merge weekly + rx into combined trend
  const weekMap = {};
  for (const r of weekly.rows)  weekMap[r.week] = { week: r.week, appointments: parseInt(r.count, 10), rx: 0 };
  for (const r of rxTrend.rows) if (weekMap[r.week]) weekMap[r.week].rx = parseInt(r.count, 10);
  const weeklyTrend = Object.values(weekMap);

  // Tool usage bar format
  const tu = toolUsage.rows[0] || {};
  const toolBar = [
    { name: 'Prescriptions', value: parseInt(tu.total_rx, 10) || 0 },
    { name: 'With Vitals',   value: parseInt(tu.with_vitals, 10) || 0 },
    { name: 'With Diagnosis',value: parseInt(tu.with_diagnosis, 10) || 0 },
    { name: 'With Meds',     value: parseInt(tu.with_meds, 10) || 0 },
    { name: 'With Labs',     value: parseInt(tu.with_labs, 10) || 0 },
    { name: 'With Canvas',   value: parseInt(tu.with_canvas, 10) || 0 },
  ];

  const k = kpi.rows[0] || {};
  res.json({
    kpi: {
      total:           parseInt(k.total, 10) || 0,
      avg_wait_min:    parseFloat(k.avg_wait_min) || 0,
      avg_consult_min: parseFloat(k.avg_consult_min) || 0,
      completed:       parseInt(k.completed, 10) || 0,
      cancelled:       parseInt(k.cancelled, 10) || 0,
    },
    weekly_trend:    weeklyTrend,
    status_dist:     statusDist.rows.map(r => ({ name: r.name, value: parseInt(r.value, 10) })),
    channel_dist:    channelDist.rows.map(r => ({ name: r.name, value: parseInt(r.value, 10) })),
    new_vs_old:      [
      { name: 'New Patients',       value: parseInt(newVsOld.rows[0]?.new_patients, 10) || 0 },
      { name: 'Returning Patients', value: parseInt(newVsOld.rows[0]?.old_patients,  10) || 0 },
    ],
    tool_usage:      toolBar,
    daily_report:    dailyReport.rows,
    next_30_days:    next30.rows.map(r => ({ date: r.date.slice(5), count: parseInt(r.count, 10) })),
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// PATIENTS DASHBOARD
// GET /api/emr/analytics/patients?from&to
// ═══════════════════════════════════════════════════════════════════════════
const getPatientsDashboard = async (req, res) => {
  const cid  = req.emrUser.clinic_id;
  const from = req.query.from || daysAgo(90);
  const to   = req.query.to   || todayStr();

  const [dbSize, monthlyNew, monthlyReturning, waitConsult, referredTo, churn] = await Promise.all([

    // Total patient database
    pool.query(`
      SELECT COUNT(DISTINCT patient_mobile) AS total_patients,
             COUNT(*) AS total_visits
      FROM emr_appointments WHERE clinic_id=$1 AND patient_mobile IS NOT NULL`, [cid]),

    // New patients per month (first visit in period)
    pool.query(`
      SELECT TO_CHAR(first_visit, 'Mon YY') AS month,
             DATE_TRUNC('month', first_visit) AS month_start,
             COUNT(*) AS new_patients
      FROM (
        SELECT patient_mobile, MIN(appointment_date) AS first_visit
        FROM emr_appointments WHERE clinic_id=$1 AND patient_mobile IS NOT NULL
        GROUP BY patient_mobile
      ) fv
      WHERE first_visit BETWEEN $2 AND $3
      GROUP BY DATE_TRUNC('month', first_visit), TO_CHAR(first_visit,'Mon YY')
      ORDER BY month_start`, [cid, from, to]),

    // Returning patients per month
    pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month',a.appointment_date),'Mon YY') AS month,
             DATE_TRUNC('month',a.appointment_date) AS month_start,
             COUNT(DISTINCT a.patient_mobile) AS returning_patients
      FROM emr_appointments a
      WHERE a.clinic_id=$1 AND a.appointment_date BETWEEN $2 AND $3
        AND a.patient_mobile IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM emr_appointments older
          WHERE older.clinic_id = a.clinic_id
            AND older.patient_mobile = a.patient_mobile
            AND older.appointment_date < a.appointment_date
        )
      GROUP BY DATE_TRUNC('month',a.appointment_date)
      ORDER BY month_start`, [cid, from, to]),

    // Waiting & consultation time avg per week
    pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('week',a.appointment_date),'DD Mon') AS week,
        ROUND(AVG(CASE
          WHEN a.checked_in_at IS NOT NULL AND a.appointment_time IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (
                 a.checked_in_at - (a.appointment_date + a.appointment_time)
               ))/60) END)::numeric,1) AS avg_wait,
        ROUND(AVG(CASE
          WHEN a.checked_in_at IS NOT NULL AND a.completed_at IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (a.completed_at - a.checked_in_at))/60)
          END)::numeric,1) AS avg_consult
      FROM emr_appointments a
      WHERE a.clinic_id=$1 AND a.appointment_date BETWEEN $2 AND $3
      GROUP BY DATE_TRUNC('week',a.appointment_date)
      ORDER BY DATE_TRUNC('week',a.appointment_date)`, [cid, from, to]),

    // Top referrals
    pool.query(`
      SELECT TRIM(e.refer_to) AS referred_to, COUNT(*) AS count
      FROM emr_encounters e
      JOIN emr_appointments a ON a.id = e.appointment_id
      WHERE a.clinic_id=$1 AND e.refer_to IS NOT NULL AND e.refer_to != ''
        AND a.appointment_date BETWEEN $2 AND $3
      GROUP BY TRIM(e.refer_to) ORDER BY count DESC LIMIT 10`, [cid, from, to]),

    // Churn (patients with last visit > 90 days ago)
    pool.query(`
      SELECT COUNT(*) AS churned
      FROM (
        SELECT patient_mobile, MAX(appointment_date) AS last_visit
        FROM emr_appointments WHERE clinic_id=$1 AND patient_mobile IS NOT NULL
        GROUP BY patient_mobile
        HAVING MAX(appointment_date) < CURRENT_DATE - 90
      ) c`, [cid]),
  ]);

  // Merge new + returning into monthly chart
  const monthMap = {};
  for (const r of monthlyNew.rows)       monthMap[r.month] = { month: r.month, new: parseInt(r.new_patients, 10), returning: 0 };
  for (const r of monthlyReturning.rows) {
    if (!monthMap[r.month]) monthMap[r.month] = { month: r.month, new: 0, returning: 0 };
    monthMap[r.month].returning = parseInt(r.returning_patients, 10);
  }

  const db = dbSize.rows[0] || {};
  res.json({
    kpi: {
      total_patients:   parseInt(db.total_patients, 10) || 0,
      total_visits:     parseInt(db.total_visits, 10)   || 0,
      churned_patients: parseInt(churn.rows[0]?.churned, 10) || 0,
    },
    monthly_patients:  Object.values(monthMap),
    wait_consult_trend: waitConsult.rows,
    referred_to:       referredTo.rows.map(r => ({ name: r.referred_to, value: parseInt(r.count, 10) })),
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// REAL-TIME REPORT DASHBOARD
// GET /api/emr/analytics/realtime?from&to&doctor_id
// ═══════════════════════════════════════════════════════════════════════════
const getRealtimeDashboard = async (req, res) => {
  const cid   = req.emrUser.clinic_id;
  const from  = req.query.from || todayStr();
  const to    = req.query.to   || todayStr();
  const docId = req.query.doctor_id || null;

  const docFilter = docId ? `AND a.doctor_id=${parseInt(docId, 10)}` : '';

  const [totals, paymode, daily, serviceWise, patientLevel] = await Promise.all([

    // Totals
    pool.query(`
      SELECT
        COALESCE(SUM(r.grand_total),0)  AS total_collected,
        COALESCE(SUM(r.total_discount),0) AS total_discount,
        COUNT(r.id)                     AS receipt_count,
        COUNT(DISTINCT r.patient_name)  AS patient_count
      FROM emr_receipts r
      JOIN emr_appointments a ON a.id = r.appointment_id
      WHERE r.clinic_id=$1 AND r.created_at::date BETWEEN $2 AND $3 ${docFilter}`,
      [cid, from, to]),

    // Paymode distribution
    pool.query(`
      SELECT COALESCE(r.paymode,'Cash') AS name, COALESCE(SUM(r.grand_total),0) AS value
      FROM emr_receipts r
      JOIN emr_appointments a ON a.id = r.appointment_id
      WHERE r.clinic_id=$1 AND r.created_at::date BETWEEN $2 AND $3 ${docFilter}
      GROUP BY r.paymode ORDER BY value DESC`, [cid, from, to]),

    // Daily payment trend
    pool.query(`
      SELECT r.created_at::date::text AS date, COALESCE(SUM(r.grand_total),0) AS amount, COUNT(*) AS receipts
      FROM emr_receipts r
      JOIN emr_appointments a ON a.id = r.appointment_id
      WHERE r.clinic_id=$1 AND r.created_at::date BETWEEN $2 AND $3 ${docFilter}
      GROUP BY r.created_at::date ORDER BY r.created_at::date`, [cid, from, to]),

    // Service-wise revenue
    pool.query(`
      SELECT item->>'name' AS service, COALESCE(SUM((item->>'amount')::numeric * COALESCE((item->>'qty')::int,1)),0) AS revenue, COUNT(*) AS count
      FROM emr_receipts r
      JOIN emr_appointments a ON a.id = r.appointment_id,
      jsonb_array_elements(r.items) AS item
      WHERE r.clinic_id=$1 AND r.created_at::date BETWEEN $2 AND $3 ${docFilter}
        AND (item->>'name') IS NOT NULL AND (item->>'name') != ''
      GROUP BY item->>'name' ORDER BY revenue DESC LIMIT 15`, [cid, from, to]),

    // Patient-level financial detail
    pool.query(`
      SELECT COALESCE(r.patient_name,'Unknown') AS patient_name, r.uhid,
             COUNT(r.id) AS receipts, COALESCE(SUM(r.grand_total),0) AS total_paid,
             COALESCE(SUM(r.total_discount),0) AS total_discount,
             MAX(r.created_at)::date::text AS last_payment
      FROM emr_receipts r
      JOIN emr_appointments a ON a.id = r.appointment_id
      WHERE r.clinic_id=$1 AND r.created_at::date BETWEEN $2 AND $3 ${docFilter}
      GROUP BY r.patient_name, r.uhid ORDER BY total_paid DESC LIMIT 50`, [cid, from, to]),
  ]);

  const t = totals.rows[0] || {};
  res.json({
    kpi: {
      total_collected: parseFloat(t.total_collected) || 0,
      total_discount:  parseFloat(t.total_discount)  || 0,
      receipt_count:   parseInt(t.receipt_count, 10)  || 0,
      patient_count:   parseInt(t.patient_count, 10)  || 0,
    },
    paymode_dist: paymode.rows.map(r => ({ name: r.name, value: parseFloat(r.value) })),
    daily_trend:  daily.rows.map(r => ({ date: r.date.slice(5), amount: parseFloat(r.amount), receipts: parseInt(r.receipts, 10) })),
    service_wise: serviceWise.rows.map(r => ({ name: r.service, value: parseFloat(r.revenue), count: parseInt(r.count, 10) })),
    patient_level: patientLevel.rows,
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// PRESCRIPTION ANALYTICS
// GET /api/emr/analytics/prescriptions?from&to&doctor_id&tab
// ═══════════════════════════════════════════════════════════════════════════
const getPrescriptionAnalytics = async (req, res) => {
  const cid   = req.emrUser.clinic_id;
  const from  = req.query.from || daysAgo(30);
  const to    = req.query.to   || todayStr();
  const tab   = req.query.tab  || 'symptoms';

  const base = `FROM emr_encounters e JOIN emr_appointments a ON a.id = e.appointment_id
                WHERE a.clinic_id=$1 AND a.appointment_date BETWEEN $2 AND $3`;
  const p = [cid, from, to];

  let result = {};

  if (tab === 'symptoms') {
    const { rows } = await pool.query(`
      SELECT sym->>'name' AS name, COUNT(*) AS value
      FROM emr_encounters e
      JOIN emr_appointments a ON a.id = e.appointment_id,
      jsonb_array_elements(e.symptoms) AS sym
      WHERE a.clinic_id=$1 AND a.appointment_date BETWEEN $2 AND $3
        AND sym->>'name' IS NOT NULL AND sym->>'name' != ''
      GROUP BY sym->>'name' ORDER BY value DESC LIMIT 20`, p);
    result = { data: rows.map(r => ({ name: r.name, value: parseInt(r.value, 10) })) };

  } else if (tab === 'diagnosis') {
    const { rows } = await pool.query(`
      SELECT diag->>'display' AS name, COUNT(*) AS value
      FROM emr_encounters e
      JOIN emr_appointments a ON a.id = e.appointment_id,
      jsonb_array_elements(e.diagnosis) AS diag
      WHERE a.clinic_id=$1 AND a.appointment_date BETWEEN $2 AND $3
        AND diag->>'display' IS NOT NULL
      GROUP BY diag->>'display' ORDER BY value DESC LIMIT 20`, p);
    result = { data: rows.map(r => ({ name: r.name || 'Unknown', value: parseInt(r.value, 10) })) };

  } else if (tab === 'labtest') {
    const { rows } = await pool.query(`
      SELECT lab->>'test' AS name, COUNT(*) AS value
      FROM emr_encounters e
      JOIN emr_appointments a ON a.id = e.appointment_id,
      jsonb_array_elements(e.lab_investigations) AS lab
      WHERE a.clinic_id=$1 AND a.appointment_date BETWEEN $2 AND $3
        AND lab->>'test' IS NOT NULL AND lab->>'test' != ''
      GROUP BY lab->>'test' ORDER BY value DESC LIMIT 20`, p);
    result = { data: rows.map(r => ({ name: r.name, value: parseInt(r.value, 10) })) };

  } else if (tab === 'procedure') {
    const { rows } = await pool.query(`
      SELECT proc AS name, COUNT(*) AS value
      FROM emr_encounters e
      JOIN emr_appointments a ON a.id = e.appointment_id,
      jsonb_array_elements_text(e.procedures) AS proc
      WHERE a.clinic_id=$1 AND a.appointment_date BETWEEN $2 AND $3
        AND proc IS NOT NULL AND proc != ''
      GROUP BY proc ORDER BY value DESC LIMIT 20`, p);
    result = { data: rows.map(r => ({ name: r.name, value: parseInt(r.value, 10) })) };

  } else if (tab === 'vitals') {
    const { rows } = await pool.query(`
      SELECT a.appointment_date::text AS date,
        AVG((e.vitals->>'bp_systolic')::numeric)  FILTER (WHERE e.vitals->>'bp_systolic' IS NOT NULL) AS systolic,
        AVG((e.vitals->>'bp_diastolic')::numeric) FILTER (WHERE e.vitals->>'bp_diastolic' IS NOT NULL) AS diastolic,
        AVG((e.vitals->>'pulse')::numeric)         FILTER (WHERE e.vitals->>'pulse' IS NOT NULL) AS pulse,
        AVG((e.vitals->>'temp')::numeric)          FILTER (WHERE e.vitals->>'temp' IS NOT NULL) AS temp
      ${base} AND e.vitals IS NOT NULL AND e.vitals != '{}'
      GROUP BY a.appointment_date ORDER BY a.appointment_date LIMIT 30`, p);
    result = { data: rows };

  } else if (tab === 'medications') {
    const { rows } = await pool.query(`
      SELECT med->>'name' AS name, COUNT(*) AS value
      FROM emr_encounters e
      JOIN emr_appointments a ON a.id = e.appointment_id,
      jsonb_array_elements(e.medications) AS med
      WHERE a.clinic_id=$1 AND a.appointment_date BETWEEN $2 AND $3
        AND med->>'name' IS NOT NULL AND med->>'name' != ''
      GROUP BY med->>'name' ORDER BY value DESC LIMIT 20`, p);
    result = { data: rows.map(r => ({ name: r.name, value: parseInt(r.value, 10) })) };

  } else if (tab === 'assessments') {
    const { rows } = await pool.query(`
      SELECT COUNT(e.id) AS total_encounters,
             COUNT(*) FILTER (WHERE e.examination_findings IS NOT NULL AND e.examination_findings != '') AS with_exam,
             COUNT(*) FILTER (WHERE e.chief_complaint IS NOT NULL AND e.chief_complaint != '') AS with_complaint
      ${base}`, p);
    result = { data: rows[0] };

  } else if (tab === 'vaccinations') {
    // Top vaccines given (by name)
    const { rows: topRows } = await pool.query(`
      SELECT vacc_entry.key AS vacc_key,
             vacc_entry.value->>'status' AS status,
             COUNT(*) AS cnt
      FROM emr_encounters e
      JOIN emr_appointments a ON a.id = e.appointment_id,
      jsonb_each(COALESCE(e.vaccinations, '{}')) AS vacc_entry
      WHERE a.clinic_id=$1 AND a.appointment_date BETWEEN $2 AND $3
        AND vacc_entry.value->>'status' IS NOT NULL
        AND vacc_entry.value->>'status' != ''
      GROUP BY vacc_key, status
      ORDER BY cnt DESC`, p);

    // Aggregate top 15 given vaccines
    const givenMap = {};
    const statusTotals = { given: 0, due: 0, refused: 0, missed: 0 };
    topRows.forEach(r => {
      const name = r.vacc_key.replace(/^(iap_|other_)/, '').replace(/_/g, ' ');
      const st   = r.status;
      const cnt  = parseInt(r.cnt, 10);
      if (st === 'given') givenMap[name] = (givenMap[name] || 0) + cnt;
      if (statusTotals[st] !== undefined) statusTotals[st] += cnt;
    });
    const topGiven = Object.entries(givenMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([name, value]) => ({ name, value }));

    // Monthly vaccination trend
    const { rows: monthRows } = await pool.query(`
      SELECT TO_CHAR(a.appointment_date, 'Mon YYYY') AS month,
             DATE_TRUNC('month', a.appointment_date) AS month_ts,
             COUNT(*) AS total_given
      FROM emr_encounters e
      JOIN emr_appointments a ON a.id = e.appointment_id,
      jsonb_each(COALESCE(e.vaccinations, '{}')) AS vacc_entry
      WHERE a.clinic_id=$1 AND a.appointment_date BETWEEN $2 AND $3
        AND vacc_entry.value->>'status' = 'given'
      GROUP BY month, month_ts ORDER BY month_ts`, p);

    result = {
      data: {
        topGiven,
        statusBreakdown: [
          { name: 'Given',           value: statusTotals.given,   color: '#16a34a' },
          { name: 'Due',             value: statusTotals.due,     color: '#2563eb' },
          { name: 'Patient Refused', value: statusTotals.refused, color: '#d97706' },
          { name: 'Missed',          value: statusTotals.missed,  color: '#dc2626' },
        ].filter(s => s.value > 0),
        monthlyTrend: monthRows.map(r => ({ month: r.month, given: parseInt(r.total_given, 10) })),
      }
    };
  }

  res.json({ tab, ...result });
};

// ═══════════════════════════════════════════════════════════════════════════
// FORM 25 (kept from original)
// ═══════════════════════════════════════════════════════════════════════════
const getForm25 = async (req, res) => {
  const { from, to, doctor_id, search, page = 1, limit = 50 } = req.query;
  const cid    = req.emrUser.clinic_id;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const dateFrom = from || daysAgo(30);
  const dateTo   = to   || todayStr();

  const params = [cid, dateFrom, dateTo];
  const extras = [];
  if (doctor_id) { params.push(doctor_id); extras.push(`a.doctor_id=$${params.length}`); }
  if (search)    { params.push(`%${search}%`); extras.push(`(LOWER(COALESCE(r.patient_name,a.patient_name)) LIKE LOWER($${params.length}) OR LOWER(CONCAT(COALESCE(c.uhid_prefix,'RX'),'-',r.id)) LIKE LOWER($${params.length}))`); }
  const extra = extras.length ? `AND ${extras.join(' AND ')}` : '';

  const baseSql = `FROM emr_receipts r JOIN emr_appointments a ON a.id=r.appointment_id LEFT JOIN emr_doctors d ON d.id=a.doctor_id JOIN emr_clinics c ON c.id=r.clinic_id WHERE r.clinic_id=$1 AND r.created_at::date>=$2 AND r.created_at::date<=$3 ${extra}`;

  const [totals, records] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total, COALESCE(SUM(r.grand_total),0) AS total_collected ${baseSql}`, params),
    pool.query(`SELECT a.appointment_date, r.created_at::date AS receipt_date, d.name AS doctor_name, c.name AS clinic_name, CONCAT(COALESCE(NULLIF(c.uhid_prefix,''),'RX'),'-',r.id) AS receipt_number, COALESCE(r.patient_name,a.patient_name,'Unknown') AS patient_name, a.uhid, (SELECT COALESCE(STRING_AGG(item->>'name',', '),'Consultation') FROM jsonb_array_elements(r.items) AS item WHERE (item->>'name') IS NOT NULL AND (item->>'name')<>'') AS service_name, r.grand_total AS amount_collected, r.paymode, r.remarks, r.id AS receipt_id ${baseSql} ORDER BY a.appointment_date DESC, r.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, parseInt(limit,10), offset]),
  ]);

  res.json({ records: records.rows, total: parseInt(totals.rows[0].total,10), total_collected: parseFloat(totals.rows[0].total_collected), page: parseInt(page,10), limit: parseInt(limit,10), from: dateFrom, to: dateTo });
};

const getForm25Summary = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(DATE_TRUNC('month',r.created_at),'Mon YYYY') AS month, DATE_TRUNC('month',r.created_at) AS month_start, COUNT(*) AS receipt_count, COALESCE(SUM(r.grand_total),0) AS total_collected FROM emr_receipts r JOIN emr_appointments a ON a.id=r.appointment_id WHERE r.clinic_id=$1 AND r.created_at::date>=$2 GROUP BY DATE_TRUNC('month',r.created_at) ORDER BY month_start DESC`,
    [req.emrUser.clinic_id, fyStart()]
  );
  const fyTotal = rows.reduce((s, r) => s + parseFloat(r.total_collected), 0);
  res.json({ months: rows, fy_total: fyTotal, fy_start: fyStart() });
};

module.exports = { getAppointmentDashboard, getPatientsDashboard, getRealtimeDashboard, getPrescriptionAnalytics, getForm25, getForm25Summary };
