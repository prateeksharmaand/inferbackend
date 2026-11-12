/**
 * When a lab order is released (status → REPORTED), email the report PDF to the patient
 * if the clinic has an email for them. Fire-and-forget: never blocks or fails the lab's update.
 */
const { pool } = require('../../config/database');
const { loadPatientLabReports, loadPatientForReport } = require('./data');
const { buildLabReportPdf } = require('./pdf');

async function emailReleasedOrder(order) {
  if (!order?.patient_uhid && !order?.emr_patient_id) return { sent: false, reason: 'no patient on order' };
  let clinicId = order.clinic_id;
  if (!clinicId && order.patient_uhid) {
    const { rows: [pc] } = await pool.query(`SELECT clinic_id FROM patient_clinics WHERE uhid = $1 LIMIT 1`, [order.patient_uhid]);
    clinicId = pc?.clinic_id;
  }
  if (!clinicId) return { sent: false, reason: 'clinic unknown' };
  const patient = await loadPatientForReport(pool, clinicId, order.emr_patient_id, order.patient_uhid);
  if (!patient?.email) return { sent: false, reason: 'no patient email' };
  const reports = await loadPatientLabReports(pool, order.emr_patient_id ? String(order.emr_patient_id) : 'unknown', patient.uhid || order.patient_uhid);
  const report = reports.find(r => r.id === `order_${order.id}`) || reports.find(r => r.order_number && r.order_number === order.order_number);
  if (!report || !(report.results || []).some(x => x?.result_value != null)) return { sent: false, reason: 'no results yet' };
  const { rows: [clinic] } = await pool.query(`SELECT name FROM emr_clinics WHERE id = $1`, [clinicId]);
  const pdf = await buildLabReportPdf({ report, patient, clinicName: clinic?.name || '' });
  const n = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const abnormalCount = report.results.filter(x => {
    const v = n(x.result_value), lo = n(x.reference_range_low), hi = n(x.reference_range_high);
    return v !== null && ((hi !== null && v > hi) || (lo !== null && v < lo));
  }).length;
  const mailer = require('../emr.mailer');
  await mailer.sendLabReport({
    to: patient.email, patientName: patient.name, clinicName: clinic?.name || '',
    labName: report.lab?.facility_name || report.lab_name, pdfBuffer: pdf,
    filename: `Lab-Report-${String(order.order_number || 'report').replace(/[^A-Za-z0-9-]+/g, '')}.pdf`, abnormalCount,
  });
  return { sent: true };
}

function emailReleasedOrderInBackground(order) {
  setImmediate(() => {
    emailReleasedOrder(order)
      .then(r => console.log(`[lab-report email] order ${order?.order_number}: ${r.sent ? 'sent' : `skipped (${r.reason})`}`))
      .catch(e => console.error(`[lab-report email] order ${order?.order_number} failed:`, e.message));
  });
}

module.exports = { emailReleasedOrder, emailReleasedOrderInBackground };
