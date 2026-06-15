const nodemailer = require('nodemailer');
const { generatePrescriptionPDF } = require('./emr.pdfgen');

function buildMailer() {
  const port   = parseInt(process.env.SMTP_PORT || '587');
  const secure = port === 465;
  return nodemailer.createTransport({
    host:             process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls:              { rejectUnauthorized: false },
    connectionTimeout: 15000,
    greetingTimeout:   10000,
    socketTimeout:     20000,
  });
}

const FROM = `"${process.env.FROM_NAME || 'Infer EMR'}" <${process.env.SMTP_FROM || 'support@inferapp.online'}>`;

// ── Appointment confirmation ──────────────────────────────────────────────────
async function sendAppointmentConfirmation({ to, patientName, clinicName, date, time, doctor, tokenNo }) {
  if (!to) return;
  const mailer = buildMailer();
  const dateStr = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  await mailer.sendMail({
    from: FROM, to,
    subject: `Appointment Confirmed — ${clinicName}`,
    html: `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <div style="background:#2563eb;padding:20px 24px;">
        <h2 style="color:#fff;margin:0;font-size:20px;">${clinicName}</h2>
        <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px;">Appointment Confirmation</p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;font-size:15px;">Dear <strong>${patientName}</strong>,</p>
        <p style="margin:0 0 16px;color:#475569;">Your appointment has been scheduled. Here are your details:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;width:40%;">Token No.</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">#${tokenNo}</td></tr>
          <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;">Date</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${dateStr}</td></tr>
          ${time ? `<tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;">Time</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${time}</td></tr>` : ''}
          ${doctor ? `<tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;">Doctor</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${doctor}</td></tr>` : ''}
          <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;">Clinic</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${clinicName}</td></tr>
        </table>
        <p style="margin:20px 0 0;font-size:13px;color:#94a3b8;">Please arrive 10 minutes early. For queries, contact the clinic directly.</p>
      </div>
      <div style="padding:12px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
        Sent by Infer EMR · support@inferapp.online
      </div>
    </div>`,
  });
}

// ── Prescription email with PDF attachment ────────────────────────────────────
async function sendPrescriptionFromAppt({ to, patientName, clinicName, clinicAddress, doctorName, appt, encounter }) {
  if (!to) return;
  const mailer  = buildMailer();
  const dateStr = appt?.appointment_date
    ? new Date(appt.appointment_date.toString().slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN');

  // Generate PDF
  const pdfBuffer = await generatePrescriptionPDF({ appt, encounter, clinicName, clinicAddress, doctorName });
  const filename  = `Prescription_${(patientName || 'Patient').replace(/\s+/g, '_')}_${appt?.appointment_date?.toString?.().slice(0,10) || 'today'}.pdf`;

  await mailer.sendMail({
    from: FROM, to,
    subject: `Your Prescription — ${clinicName}`,
    html: `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <div style="background:#2563eb;padding:20px 24px;">
        <h2 style="color:#fff;margin:0;font-size:20px;">${clinicName}</h2>
        <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px;">Prescription — ${dateStr}</p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 10px;font-size:15px;">Dear <strong>${patientName}</strong>,</p>
        <p style="margin:0 0 16px;color:#475569;font-size:13px;">
          Your prescription from <strong>${clinicName}</strong> is attached as a PDF.
          Please follow the instructions provided by your doctor.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
          ${appt?.uhid ? `<tr><td style="padding:6px 10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;width:38%;">UHID</td><td style="padding:6px 10px;border:1px solid #e2e8f0;">${appt.uhid}</td></tr>` : ''}
          <tr><td style="padding:6px 10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;">Date</td><td style="padding:6px 10px;border:1px solid #e2e8f0;">${dateStr}</td></tr>
          ${appt?.token_number ? `<tr><td style="padding:6px 10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;">Token</td><td style="padding:6px 10px;border:1px solid #e2e8f0;">#${appt.token_number}</td></tr>` : ''}
          ${doctorName ? `<tr><td style="padding:6px 10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;">Doctor</td><td style="padding:6px 10px;border:1px solid #e2e8f0;">Dr. ${doctorName}</td></tr>` : ''}
        </table>
        <p style="margin:0;font-size:12px;color:#94a3b8;">📎 Prescription PDF is attached to this email.</p>
      </div>
      <div style="padding:12px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
        Sent by Infer EMR · support@inferapp.online
      </div>
    </div>`,
    attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
  });
}

// ── Receipt email ─────────────────────────────────────────────────────────────
async function sendReceipt({ to, patientName, clinicName, receiptData }) {
  if (!to) return;
  const mailer = buildMailer();
  const { grand_total, paymode, items = [], created_at } = receiptData;
  const dateStr = new Date(created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const itemRows = items.map(i =>
    `<tr>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;">${i.description || i.name || ''}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">₹${(+i.amount || 0).toFixed(2)}</td>
    </tr>`
  ).join('');

  await mailer.sendMail({
    from: FROM, to,
    subject: `Payment Receipt — ${clinicName}`,
    html: `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <div style="background:#059669;padding:20px 24px;">
        <h2 style="color:#fff;margin:0;font-size:20px;">${clinicName}</h2>
        <p style="color:#a7f3d0;margin:4px 0 0;font-size:13px;">Payment Receipt · ${dateStr}</p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;font-size:15px;">Dear <strong>${patientName}</strong>,</p>
        <p style="margin:0 0 12px;color:#475569;">Thank you for your payment. Here is your receipt:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
          <thead><tr style="background:#f8fafc;">
            <th style="padding:8px 10px;text-align:left;border:1px solid #e2e8f0;">Description</th>
            <th style="padding:8px 10px;text-align:right;border:1px solid #e2e8f0;">Amount</th>
          </tr></thead>
          <tbody>${itemRows}</tbody>
          <tfoot><tr style="background:#f0fdf4;">
            <td style="padding:10px;font-weight:700;border-top:2px solid #059669;">Total Paid</td>
            <td style="padding:10px;font-weight:700;text-align:right;border-top:2px solid #059669;color:#059669;">₹${(+grand_total || 0).toFixed(2)}</td>
          </tr></tfoot>
        </table>
        <p style="margin:0;font-size:13px;color:#64748b;">Payment mode: <strong>${paymode || 'Cash'}</strong></p>
      </div>
      <div style="padding:12px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
        Sent by Infer EMR · support@inferapp.online
      </div>
    </div>`,
  });
}

module.exports = { sendAppointmentConfirmation, sendPrescriptionFromAppt, sendReceipt };
