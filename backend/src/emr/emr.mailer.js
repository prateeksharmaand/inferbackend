const nodemailer = require('nodemailer');

function buildMailer() {
  return nodemailer.createTransport({
    host:   process.env.MTP_HOST  || process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
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

// ── Prescription email (HTML body passed from frontend) ───────────────────────
async function sendPrescription({ to, patientName, clinicName, htmlContent }) {
  if (!to) return;
  const mailer = buildMailer();
  await mailer.sendMail({
    from: FROM, to,
    subject: `Your Prescription — ${clinicName}`,
    html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#2563eb;padding:20px 24px;border-radius:10px 10px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:20px;">${clinicName}</h2>
        <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px;">Prescription for ${patientName}</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;overflow:hidden;">
        ${htmlContent}
      </div>
      <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:16px;">
        Sent by Infer EMR · support@inferapp.online
      </p>
    </div>`,
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

module.exports = { sendAppointmentConfirmation, sendPrescription, sendReceipt };
