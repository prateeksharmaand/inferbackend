/**
 * A patient's lab reports, built from formal lab_reports, uploaded results and lab orders,
 * with catalogue descriptions, letterhead and signatories. Used by the Lab Reports tab,
 * the printable PDF and the emailed report.
 */
async function loadPatientLabReports(pool, id, queryUhid) {

  // 1. Resolve UHID â€” prefer query param, then look up from emr_appointments
  let uhid = queryUhid || null;
  if (!uhid) {
    const { rows: uhidRows } = await pool.query(
      `SELECT uhid FROM patient_clinics WHERE patient_id::text = $1 AND uhid IS NOT NULL LIMIT 1`,
      [id]
    );
    uhid = uhidRows[0]?.uhid || null;
  }
  // Also try matching by patient_id via patient_clinics
  if (!uhid && id && id !== 'unknown') {
    const { rows: uhidRows2 } = await pool.query(
      `SELECT pc.uhid FROM patient_clinics pc
       JOIN emr_patients p ON p.id = pc.patient_id
       WHERE p.id::text = $1 AND pc.uhid IS NOT NULL AND p.deleted_at IS NULL LIMIT 1`,
      [id]
    );
    uhid = uhidRows2[0]?.uhid || null;
  }

  // 2. Formal lab_reports (any status)
  const { rows: formalReports } = await pool.query(
    `SELECT r.id, r.report_number, r.created_at, r.observations, r.clinical_notes, r.pdf_path,
            l.facility_name AS lab_name, o.order_number, r.lab_id,
            r.approved_at, r.released_at, o.collected_at, o.received_at_lab, o.reported_at, o.created_at AS registered_at,
            array_agg(json_build_object(
              'test_name', res.test_name,
              'test_code', res.test_code,
              'reference_range_low', res.reference_range_low,
              'reference_range_high', res.reference_range_high,
              'result_value', res.result_value,
              'result_unit', res.result_unit,
              'is_critical', res.is_critical_value
            )) FILTER (WHERE res.id IS NOT NULL) AS results
     FROM lab_reports r
     LEFT JOIN laboratories l ON l.id = r.lab_id
     LEFT JOIN lab_orders o ON o.id = r.order_id
     LEFT JOIN lab_test_results res ON (res.patient_uhid = $2 OR res.patient_id::text = $1) AND res.lab_id = r.lab_id
     WHERE (r.patient_uhid = $2 OR r.patient_id::text = $1)
     GROUP BY r.id, l.facility_name, o.order_number, o.collected_at, o.received_at_lab, o.reported_at, o.created_at
     ORDER BY r.created_at DESC`,
    [id, uhid || '']
  );

  // 3. Direct lab_test_results by UHID (uploaded results without a formal report)
  //    Group by lab + date to form virtual report cards
  let virtualReports = [];
  if (uhid) {
    const { rows: rawResults } = await pool.query(
      `SELECT res.id, res.test_name, res.test_code, res.result_value, res.result_unit, res.received_timestamp, res.result_timestamp,
              res.is_critical_value, res.collection_timestamp, res.result_status,
              res.reference_range_low, res.reference_range_high,
              l.facility_name AS lab_name, l.id AS lab_id
       FROM lab_test_results res
       LEFT JOIN laboratories l ON l.id = res.lab_id
       WHERE res.patient_uhid = $1
       ORDER BY res.collection_timestamp DESC`,
      [uhid]
    );

    // Group by lab + date
    const grouped = {};
    for (const r of rawResults) {
      const dateKey = r.collection_timestamp
        ? new Date(r.collection_timestamp).toISOString().split('T')[0]
        : 'unknown';
      const key = `${r.lab_id || 'unknown'}__${dateKey}`;
      if (!grouped[key]) {
        grouped[key] = {
          id: `vr_${key}`,
          report_number: null,
          order_number: null,
          lab_name: r.lab_name || 'Lab',
          lab_id: r.lab_id,
          created_at: r.collection_timestamp || new Date().toISOString(),
          collected_at: r.collection_timestamp, received_at_lab: r.received_timestamp, reported_at: r.result_timestamp,
          observations: null,
          clinical_notes: null,
          pdf_path: null,
          results: [],
        };
      }
      grouped[key].results.push({
        test_name: r.test_name,
        test_code: r.test_code,
        result_value: r.result_value,
        result_unit: r.result_unit,
        is_critical: r.is_critical_value,
        reference_range_low: r.reference_range_low,
        reference_range_high: r.reference_range_high,
        result_status: r.result_status,
      });
    }
    virtualReports = Object.values(grouped);
  }

  // Also check lab_orders by UHID and pull their samples' results
  if (uhid) {
    const { rows: orderResults } = await pool.query(
      `SELECT o.id AS order_id, o.order_number, o.created_at, o.clinical_notes, o.status AS order_status, o.lab_id,
              o.collected_at, o.received_at_lab, o.reported_at,
              l.facility_name AS lab_name,
              json_agg(json_build_object(
                'test_name', oi.test_name,
                'test_code', oi.test_code,
                'panel_name', pnl.panel_name,
                'panel_description', pnl.description,
                'result_value', COALESCE(ltr.result_value, ltr2.result_value),
                'result_unit', COALESCE(ltr.result_unit, ltr2.result_unit),
                'is_critical', COALESCE(ltr.is_critical_value, ltr2.is_critical_value, false),
                'reference_range_low', COALESCE(ltr.reference_range_low, ltr2.reference_range_low),
                'reference_range_high', COALESCE(ltr.reference_range_high, ltr2.reference_range_high),
                'result_status', COALESCE(ltr.result_status, ltr2.result_status)
              ) ORDER BY oi.test_name) AS results
       FROM lab_orders o
       LEFT JOIN laboratories l ON l.id = o.lab_id
       LEFT JOIN lab_order_items oi ON oi.order_id = o.id
       LEFT JOIN lab_test_panels pnl ON pnl.id = oi.panel_id
       LEFT JOIN lab_test_results ltr ON ltr.id = oi.result_id
       LEFT JOIN lab_test_results ltr2
         ON ltr.id IS NULL
         AND ltr2.patient_uhid = o.patient_uhid
         AND (LOWER(ltr2.test_code) = LOWER(oi.test_code) OR LOWER(ltr2.test_name) = LOWER(oi.test_name))
       WHERE o.patient_uhid = $1
       GROUP BY o.id, l.facility_name
       ORDER BY o.created_at DESC`,
      [uhid]
    );

    // Only add order-based cards if not already covered by virtualReports or formalReports
    const coveredOrderNums = new Set([
      ...formalReports.map(r => r.order_number),
      ...virtualReports.map(r => r.order_number),
    ]);
    for (const o of orderResults) {
      if (!coveredOrderNums.has(o.order_number)) {
        virtualReports.push({
          id: `order_${o.order_id}`,
          report_number: null,
          order_number: o.order_number,
          order_status: o.order_status,
          lab_name: o.lab_name || 'Lab',
          lab_id: o.lab_id,
          created_at: o.created_at,
          registered_at: o.created_at, collected_at: o.collected_at, received_at_lab: o.received_at_lab, reported_at: o.reported_at,
          observations: null,
          clinical_notes: o.clinical_notes || null,
          pdf_path: null,
          results: (o.results || []).filter(r => r.test_name),
        });
      }
    }
  }

  // Merge and sort by date
  const all = [...formalReports, ...virtualReports].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  // Add each test's description and reference range from the catalogue (by name)
  const names = [...new Set(all.flatMap(r => (r.results || []).map(x => x?.test_name).filter(Boolean)
    .map(n => n.trim().toLowerCase())))];
  if (names.length) {
    const { DESCRIPTIONS } = require('../../services/laboratory/testDescriptions');
    const { rows: cat } = await pool.query(
      `SELECT DISTINCT ON (lower(trim(test_name))) lower(trim(test_name)) AS k, test_code, description,
              reference_range_low, reference_range_high, reference_range_text, unit, category, sub_category, specimen_type
         FROM lab_test_catalog WHERE lower(trim(test_name)) = ANY($1)
        ORDER BY lower(trim(test_name)), (description IS NOT NULL) DESC`, [names]);
    const info = Object.fromEntries(cat.map(c => [c.k, c]));
    for (const r of all) {
      for (const x of r.results || []) {
        const c = x?.test_name && info[x.test_name.trim().toLowerCase()];
        if (!c) continue;
        x.description = c.description || DESCRIPTIONS[c.test_code] || null;
        x.test_code = x.test_code || c.test_code;
        x.category = c.category || null;
        x.sub_category = c.sub_category || null;
        x.specimen_type = c.specimen_type || null;
        x.reference_range_text = c.reference_range_text || null;
        if (x.reference_range_low == null && x.reference_range_high == null) {
          x.reference_range_low = c.reference_range_low;
          x.reference_range_high = c.reference_range_high;
        }
        if (!x.result_unit && x.result_value != null) x.result_unit = c.unit;
      }
    }
  }
  // Letterhead + signatories for printing the report
  const labIds = [...new Set(all.map(r => r.lab_id).filter(Boolean))];
  if (labIds.length) {
    const { rows: labs } = await pool.query(
      `SELECT id, facility_name, address_line1, city, state, postal_code, phone, email, accreditation_number, is_nabl_accredited
         FROM laboratories WHERE id = ANY($1::uuid[])`, [labIds]);
    const { rows: staff } = await pool.query(
      `SELECT lab_id, name, lab_role FROM emr_lab_staff WHERE lab_id = ANY($1::uuid[]) AND is_active = true ORDER BY created_at`, [labIds]);
    const byLab = Object.fromEntries(labs.map(l => [l.id, { ...l, staff: staff.filter(s => s.lab_id === l.id).map(({ name, lab_role }) => ({ name, role: lab_role })) }]));
    for (const r of all) r.lab = byLab[r.lab_id] || null;
  }
  return all;
}

/**
 * The patient as this clinic knows them (latest visit wins), or null if the patient
 * is not this clinic's — callers must 404 then.
 */
async function loadPatientForReport(pool, clinicId, id, uhid) {
  const pid = /^\d+$/.test(String(id || '')) ? Number(id) : null;
  const { rows: [a] } = await pool.query(
    `SELECT a.patient_name, a.patient_mobile, a.patient_dob, a.patient_gender, NULLIF(a.patient_email, '') AS patient_email,
            d.name AS doctor_name, a.emr_patient_id, pc.uhid
       FROM emr_appointments a
       LEFT JOIN emr_clinic_staff d ON d.id = a.doctor_id
       LEFT JOIN patient_clinics pc ON pc.patient_id = a.emr_patient_id AND pc.clinic_id = a.clinic_id
      WHERE a.clinic_id = $1 AND (a.emr_patient_id = $2 OR ($3::text IS NOT NULL AND pc.uhid = $3))
      ORDER BY a.appointment_date DESC NULLS LAST, a.created_at DESC LIMIT 1`, [clinicId, pid, uhid || null]);
  const { rows: [p] } = await pool.query(
    `SELECT p.name, p.mobile, p.dob, p.gender, NULLIF(p.email, '') AS email, pc.uhid
       FROM emr_patients p JOIN patient_clinics pc ON pc.patient_id = p.id AND pc.clinic_id = $1
      WHERE p.id = $2 AND p.deleted_at IS NULL LIMIT 1`, [clinicId, pid ?? a?.emr_patient_id ?? null]);
  if (!a && !p) return null;
  // latest email the clinic has for this patient, from any visit
  const mobile10 = String(a?.patient_mobile || p?.mobile || '').replace(/\D/g, '').slice(-10);
  let email = p?.email || a?.patient_email || null;
  if (!email && mobile10) {
    const { rows: [e] } = await pool.query(
      `SELECT patient_email FROM emr_appointments
        WHERE clinic_id = $1 AND NULLIF(patient_email, '') IS NOT NULL
          AND right(regexp_replace(COALESCE(patient_mobile, ''), '\\D', '', 'g'), 10) = $2
        ORDER BY created_at DESC LIMIT 1`, [clinicId, mobile10]);
    email = e?.patient_email || null;
  }
  return {
    name: p?.name || a?.patient_name, mobile: p?.mobile || a?.patient_mobile, dob: p?.dob || a?.patient_dob,
    gender: p?.gender || a?.patient_gender, uhid: uhid || p?.uhid || a?.uhid || null, email,
    referred_by: a?.doctor_name ? (/^dr\.?\s/i.test(a.doctor_name) ? a.doctor_name : `Dr ${a.doctor_name}`) : null,
  };
}

module.exports = { loadPatientLabReports, loadPatientForReport };
