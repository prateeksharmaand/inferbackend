const PDFDocument = require('pdfkit');

function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function safeArr(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// Generate prescription PDF buffer from appt + encounter data
function generatePrescriptionPDF({ appt, encounter, clinicName, clinicAddress, doctorName }) {
  return new Promise((resolve, reject) => {
    const doc  = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const bufs = [];
    doc.on('data', d => bufs.push(d));
    doc.on('end',  () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    const W       = doc.page.width - 80; // usable width
    const PRIMARY = '#2563eb';
    const GRAY    = '#64748b';
    const LIGHT   = '#f8fafc';

    // ── Header ────────────────────────────────────────────────────────────────
    doc.rect(40, 40, doc.page.width - 80, 60).fill(PRIMARY);
    doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
      .text(clinicName || 'Clinic', 56, 52);
    if (clinicAddress) {
      doc.fontSize(9).font('Helvetica').fillColor('#bfdbfe')
        .text(clinicAddress, 56, 72);
    }
    doc.moveDown(0.5);

    // ── Patient info bar ──────────────────────────────────────────────────────
    const barY = 110;
    doc.rect(40, barY, doc.page.width - 80, 36).fill('#f1f5f9');
    doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold');
    doc.text(`${appt.patient_name || ''}`, 56, barY + 6);
    doc.font('Helvetica').fillColor(GRAY).fontSize(9);
    const meta = [
      appt.patient_gender === 'M' ? 'Male' : appt.patient_gender === 'F' ? 'Female' : '',
      appt.patient_dob ? `DOB: ${fmtDate(appt.patient_dob?.toString?.().slice(0,10))}` : '',
      appt.uhid ? `UHID: ${appt.uhid}` : '',
      appt.patient_mobile ? `Mob: ${appt.patient_mobile}` : '',
    ].filter(Boolean).join('  ·  ');
    doc.text(meta, 56, barY + 20);

    // Date / doctor on right
    const dateStr = fmtDate(appt.appointment_date?.toString?.().slice(0,10));
    doc.fillColor(GRAY).fontSize(9);
    doc.text(`Date: ${dateStr}`, doc.page.width - 200, barY + 6, { width: 160, align: 'right' });
    if (doctorName) doc.text(`Dr. ${doctorName}`, doc.page.width - 200, barY + 20, { width: 160, align: 'right' });

    doc.y = barY + 46;
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
    doc.y += 10;

    // ── Helper: section heading ───────────────────────────────────────────────
    function section(title) {
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.fillColor(PRIMARY).fontSize(9).font('Helvetica-Bold')
        .text(title.toUpperCase(), 40, doc.y, { continued: false });
      doc.moveTo(40, doc.y + 2).lineTo(doc.page.width - 40, doc.y + 2)
        .strokeColor(PRIMARY).lineWidth(0.5).stroke();
      doc.y += 8;
      doc.fillColor('#1e293b').fontSize(9.5).font('Helvetica');
    }

    // ── Helper: key-value line ────────────────────────────────────────────────
    function kvLine(label, value) {
      if (!value) return;
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(9).text(label + ': ', 40, doc.y, { continued: true });
      doc.fillColor('#1e293b').font('Helvetica').text(value, { width: W });
      doc.y += 4;
    }

    const enc = encounter || {};

    // Vitals
    const vitals = enc.vitals || {};
    const VMAP = { bp_systolic:'BP Sys', bp_diastolic:'BP Dia', pulse:'Pulse', spo2:'SpO2',
                   temp:'Temp', weight:'Weight', height:'Height', bmi:'BMI' };
    const VUNIT = { bp_systolic:'mmHg', bp_diastolic:'mmHg', pulse:'bpm', spo2:'%',
                    temp:'°C', weight:'kg', height:'cm', bmi:'kg/m²' };
    const vitalStr = Object.entries(VMAP)
      .filter(([k]) => vitals[k])
      .map(([k, l]) => `${l}: ${vitals[k]}${VUNIT[k] || ''}`)
      .join('  |  ');
    if (vitalStr) { section('Vitals'); doc.text(vitalStr, 40, doc.y, { width: W }); doc.y += 10; }

    // Symptoms
    const symptoms = safeArr(enc.symptoms);
    if (symptoms.length) {
      section('Symptoms');
      doc.text(symptoms.map(s => {
        const name = typeof s === 'string' ? s : s.name;
        const parts = [s.since && `Since: ${s.since}`, s.severity && `Severity: ${s.severity}`].filter(Boolean);
        return name + (parts.length ? ` (${parts.join(', ')})` : '');
      }).join('\n'), 40, doc.y, { width: W });
      doc.y += 10;
    }

    // Diagnosis
    const diagnosis = safeArr(enc.diagnosis);
    if (diagnosis.length) {
      section('Diagnosis');
      doc.text(diagnosis.map(d => d.display || d).join('\n'), 40, doc.y, { width: W });
      doc.y += 10;
    }

    // Medications table
    const meds = safeArr(enc.medications);
    if (meds.length) {
      section('Prescription');
      const cols = { no: 24, name: 180, dose: 60, freq: 70, dur: 70, rem: W - 24 - 180 - 60 - 70 - 70 };
      const row0 = doc.y;
      doc.rect(40, row0, W, 16).fill('#eff6ff');
      doc.fillColor(PRIMARY).fontSize(8).font('Helvetica-Bold');
      let cx = 40;
      doc.text('#', cx + 2, row0 + 4, { width: cols.no }); cx += cols.no;
      doc.text('Medicine', cx + 2, row0 + 4, { width: cols.name }); cx += cols.name;
      doc.text('Dose', cx + 2, row0 + 4, { width: cols.dose }); cx += cols.dose;
      doc.text('Frequency', cx + 2, row0 + 4, { width: cols.freq }); cx += cols.freq;
      doc.text('Duration', cx + 2, row0 + 4, { width: cols.dur }); cx += cols.dur;
      doc.text('Remarks', cx + 2, row0 + 4, { width: cols.rem });
      doc.y = row0 + 16;

      meds.forEach((m, i) => {
        if (doc.y > doc.page.height - 80) doc.addPage();
        const ry = doc.y;
        if (i % 2 === 1) doc.rect(40, ry, W, 18).fill('#f8fafc');
        doc.fillColor('#1e293b').fontSize(8.5).font('Helvetica');
        let bx = 40;
        doc.text(String(i + 1), bx + 2, ry + 4, { width: cols.no }); bx += cols.no;
        const medName = m.name || '';
        const timing  = m.timing ? `(${m.timing})` : '';
        doc.font('Helvetica-Bold').text(medName, bx + 2, ry + 4, { width: cols.name - 4 }); bx += cols.name;
        doc.font('Helvetica').text(m.dose || m.dosage || '', bx + 2, ry + 4, { width: cols.dose - 4 }); bx += cols.dose;
        doc.text(m.frequency || '', bx + 2, ry + 4, { width: cols.freq - 4 }); bx += cols.freq;
        doc.text(m.duration || '', bx + 2, ry + 4, { width: cols.dur - 4 }); bx += cols.dur;
        const rem = [m.instructions, timing].filter(Boolean).join(' ');
        doc.text(rem, bx + 2, ry + 4, { width: cols.rem - 4 });
        doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor('#e2e8f0').lineWidth(0.3).stroke();
        doc.y += 2;
      });
      doc.y += 8;
    }

    // Lab investigations
    const labs = safeArr(enc.lab_investigations);
    if (labs.length) {
      section('Lab Investigations');
      doc.text(labs.map(l => (typeof l === 'string' ? l : l.test) + (l.remarks ? ` — ${l.remarks}` : '')).join('\n'), 40, doc.y, { width: W });
      doc.y += 10;
    }

    // Examination findings
    if (enc.examination_findings) { section('Examination Findings'); doc.text(enc.examination_findings, 40, doc.y, { width: W }); doc.y += 10; }

    // Procedures
    const procs = safeArr(enc.procedures);
    if (procs.length) { section('Procedures'); doc.text(procs.join(', '), 40, doc.y, { width: W }); doc.y += 10; }

    // Advices / Instructions
    if (enc.advices)      { section('Advice'); doc.text(enc.advices, 40, doc.y, { width: W }); doc.y += 10; }
    if (enc.instructions) { section('Instructions'); doc.text(enc.instructions, 40, doc.y, { width: W }); doc.y += 10; }
    if (enc.refer_to)     { section('Refer To'); doc.text(enc.refer_to, 40, doc.y, { width: W }); doc.y += 10; }

    // Follow-up
    if (enc.next_visit_date) {
      section('Follow-Up');
      doc.text(`Visit on: ${fmtDate(enc.next_visit_date?.toString?.().slice(0,10))}${enc.next_visit_notes ? '  —  ' + enc.next_visit_notes : ''}`, 40, doc.y, { width: W });
      doc.y += 10;
    }

    // ── Footer on every page ──────────────────────────────────────────────────
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      const footY = doc.page.height - 40;
      doc.moveTo(40, footY - 6).lineTo(doc.page.width - 40, footY - 6).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      doc.fillColor(GRAY).fontSize(8).font('Helvetica')
        .text(clinicName || 'Clinic', 40, footY, { width: W / 2 })
        .text(`Page ${i + 1} of ${totalPages}`, 40, footY, { width: W, align: 'right' });
    }

    doc.end();
  });
}

module.exports = { generatePrescriptionPDF };
