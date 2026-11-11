const PDFDocument = require('pdfkit');

// node-pg returns DATE columns as JS Date objects (UTC midnight); callers may also pass strings.
function isoDay(d) {
  if (!d) return '';
  if (d instanceof Date) return isNaN(d) ? '' : d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function plainText(t) {
  return t
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
    .replace(/[\u00A0\u2007\u2009\u200A\u202F]/g, ' ')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
}

function fmtDate(d) {
  const day = isoDay(d);
  if (!day) return '';
  const dt = new Date(day + 'T00:00:00');
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function ageYears(dob) {
  const day = isoDay(dob);
  if (!day) return null;
  const b = new Date(day + 'T00:00:00'), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a >= 0 ? a : null;
}

const MED_LABELS = {
  diabetes: 'Diabetes', hypertension: 'Hypertension', hypothyroidism: 'Hypothyroidism',
  alcohol: 'Alcohol', tobacco: 'Tobacco', smoking: 'Smoking',
};

function safeArr(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// Generate prescription PDF buffer from appt + encounter data
// Parse base64 data URL → Buffer (for pdfkit image embedding)
function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const base64 = dataUrl.split(',')[1];
  if (!base64) return null;
  return Buffer.from(base64, 'base64');
}

// Read actual pixel dimensions from a PNG or JPEG buffer without any extra package
function getImageDimensions(buf) {
  try {
    if (!buf || buf.length < 24) return null;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      // PNG: IHDR always starts at byte 8; width at 16, height at 20
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      // JPEG: scan for SOF0–SOF3 markers
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xFF) break;
        const marker = buf[i + 1];
        if (marker >= 0xC0 && marker <= 0xC3) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        const segLen = buf.readUInt16BE(i + 2);
        i += 2 + segLen;
      }
    }
  } catch {}
  return null;
}

function generatePrescriptionPDF({ appt, encounter, clinicName, clinicAddress, doctorName, doctorSpecialization = '', doctorQualification = '', headerImg, footerImg, signatureImg, calcNames = {}, dietCharts = [] }) {
  return new Promise((resolve, reject) => {
    const doc  = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    // pdfkit's built-in Helvetica has no glyphs for the Unicode hyphens/spaces that AI-written
    // text (e.g. diet plans) often contains, so they print as gaps or stray marks.
    const _text = doc.text.bind(doc);
    doc.text = (t, ...rest) => _text(typeof t === 'string' ? plainText(t) : t, ...rest);
    const bufs = [];
    doc.on('data', d => bufs.push(d));
    doc.on('end',  () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    const W       = doc.page.width - 80;
    const PW      = doc.page.width;
    const PRIMARY = '#2563eb';
    const GRAY    = '#64748b';

    const headerBuf = dataUrlToBuffer(headerImg);
    const footerBuf = dataUrlToBuffer(footerImg);
    const sigBuf    = dataUrlToBuffer(signatureImg);

    // Pre-calculate footer rendered height so content knows where to stop
    const footerDims = footerBuf ? getImageDimensions(footerBuf) : null;
    const footerRenderedH = (footerDims && footerDims.width > 0)
      ? Math.round((PW / footerDims.width) * footerDims.height)
      : 70;

    // ── Header ────────────────────────────────────────────────────────────────
    let headerHeight = 0;
    if (headerBuf) {
      try {
        doc.image(headerBuf, 0, 0, { width: PW });
        // Calculate actual rendered height from pixel dimensions to avoid overlap
        const dims = getImageDimensions(headerBuf);
        if (dims && dims.width > 0) {
          headerHeight = Math.round((PW / dims.width) * dims.height);
        } else {
          headerHeight = doc.y > 10 ? doc.y : 100;
        }
        doc.y = headerHeight + 8;
      } catch {}
    } else {
      doc.rect(40, 40, W, 60).fill(PRIMARY);
      doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text(clinicName || 'Clinic', 56, 52);
      if (clinicAddress) doc.fontSize(9).font('Helvetica').fillColor('#bfdbfe').text(clinicAddress, 56, 72);
      doc.y = 110;
    }
    headerHeight = doc.y;

    // ── Patient info bar ──────────────────────────────────────────────────────
    const barY = doc.y;
    doc.rect(40, barY, doc.page.width - 80, 36).fill('#f1f5f9');
    doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold');
    doc.text(`${appt.patient_name || ''}`, 56, barY + 6);
    doc.font('Helvetica').fillColor(GRAY).fontSize(9);
    const meta = [
      appt.patient_gender === 'M' ? 'Male' : appt.patient_gender === 'F' ? 'Female' : '',
      appt.patient_dob ? `DOB: ${fmtDate(appt.patient_dob)}${ageYears(appt.patient_dob) !== null ? ` (${ageYears(appt.patient_dob)} y)` : ''}` : '',
      appt.uhid ? `UHID: ${appt.uhid}` : '',
      appt.patient_mobile ? `Mob: ${appt.patient_mobile}` : '',
    ].filter(Boolean).join('  ·  ');
    doc.text(meta, 56, barY + 20);

    // Date / doctor on right
    const dateStr = fmtDate(appt.appointment_date);
    doc.fillColor(GRAY).fontSize(9);
    doc.text(`Date: ${dateStr}`, doc.page.width - 200, barY + 6, { width: 160, align: 'right' });
    if (doctorName) doc.text(`Dr. ${doctorName}`, doc.page.width - 200, barY + 20, { width: 160, align: 'right' });

    doc.y = barY + 46;
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
    doc.y += 10;

    // ── Helper: section heading ───────────────────────────────────────────────
    const contentBottom = doc.page.height - footerRenderedH - 20;
    function section(title) {
      if (doc.y > contentBottom - 40) doc.addPage();
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
                   temp:'Temp', respiratory_rate:'Resp. Rate', weight:'Weight', height:'Height', bmi:'BMI' };
    const VUNIT = { bp_systolic:'mmHg', bp_diastolic:'mmHg', pulse:'bpm', spo2:'%',
                    temp:'°C', respiratory_rate:'/min', weight:'kg', height:'cm', bmi:'kg/m²' };
    const vitalStr = Object.entries(VMAP)
      .filter(([k]) => vitals[k])
      .map(([k, l]) => `${l}: ${vitals[k]}${VUNIT[k] || ''}`)
      .join('  |  ');
    if (vitalStr) { section('Vitals'); doc.text(vitalStr, 40, doc.y, { width: W }); doc.y += 10; }

    // Medical history (stored on the appointment)
    const history = safeArr(appt.medical_history);
    if (history.length) {
      section('Medical History');
      doc.text(history.map(h => {
        if (typeof h === 'string') return h;
        const label = MED_LABELS[h.key] || h.label || h.condition || h.key || '';
        const meta  = [h.since && `Since: ${h.since}`, h.frequency].filter(Boolean).join(', ');
        return label + (meta ? ` (${meta})` : '');
      }).filter(Boolean).join('\n'), 40, doc.y, { width: W });
      doc.y += 10;
    }

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
      doc.text(diagnosis.map(d => (typeof d === 'string' ? d : (d.display || d.name || '')) + (d && d.code ? ` [${d.code}]` : '')).filter(Boolean).join('\n'), 40, doc.y, { width: W });
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
        if (doc.y > contentBottom - 40) doc.addPage();
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
        if (rem) doc.text(rem, bx + 2, ry + 4, { width: cols.rem - 4 });
        // Row height = tallest cell (long names wrap; an empty last cell must not collapse the row).
        doc.font('Helvetica-Bold');
        const nameH = doc.heightOfString(medName || ' ', { width: cols.name - 4 });
        doc.font('Helvetica');
        const remH  = rem ? doc.heightOfString(rem, { width: cols.rem - 4 }) : 0;
        doc.y = Math.max(ry + 18, ry + 6 + Math.max(nameH, remH));
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

    // Lab results (investigative readings)
    const labResults = safeArr(enc.lab_results);
    if (labResults.length) {
      section('Investigative Readings');
      doc.text(labResults.map(r => {
        const name = r.test || r.test_name || r.name || '';
        const val  = r.result ?? r.value ?? '';
        return `${name}: ${val}${r.unit ? ' ' + r.unit : ''}${r.range ? `  (ref ${r.range})` : ''}`;
      }).join('\n'), 40, doc.y, { width: W });
      doc.y += 10;
    }

    // Examination findings
    if (enc.examination_findings) { section('Examination Findings'); doc.text(enc.examination_findings, 40, doc.y, { width: W }); doc.y += 10; }

    // Procedures
    const procs = safeArr(enc.procedures);
    if (procs.length) { section('Procedures'); doc.text(procs.join(', '), 40, doc.y, { width: W }); doc.y += 10; }

    // Injections
    const injs = safeArr(enc.injections).filter(x => x && (x.name || typeof x === 'string'));
    if (injs.length) {
      section('Injections');
      doc.text(injs.map(x => typeof x === 'string' ? x : [x.name, x.dose, x.route, x.frequency].filter(Boolean).join(' · ')).join('\n'), 40, doc.y, { width: W });
      doc.y += 10;
    }

    // Advices / Instructions
    if (enc.advices)      { section('Advice'); doc.text(enc.advices, 40, doc.y, { width: W }); doc.y += 10; }
    if (enc.instructions) { section('Instructions'); doc.text(enc.instructions, 40, doc.y, { width: W }); doc.y += 10; }
    if (enc.refer_to)     { section('Refer To'); doc.text(enc.refer_to, 40, doc.y, { width: W }); doc.y += 10; }
    if (enc.notes)        { section('Notes'); doc.text(enc.notes, 40, doc.y, { width: W }); doc.y += 10; }

    // InferPad template / custom sections
    for (const cs of safeArr(enc.custom_sections)) {
      if (!cs || !cs.content) continue;
      section(cs.title || 'Notes');
      doc.text(String(cs.content), 40, doc.y, { width: W });
      doc.y += 10;
    }

    // Clinical template fields (Clinical Template Builder), grouped by section
    for (const sec of safeArr(enc.template_print)) {
      if (!sec || !Array.isArray(sec.fields) || !sec.fields.length) continue;
      section(sec.section_label || 'Additional details');
      doc.text(sec.fields.map(f => `${f.label}: ${f.value}`).join('\n'), 40, doc.y, { width: W });
      doc.y += 10;
    }

    // Clinical calculators
    const calc = enc.calc_results && typeof enc.calc_results === 'object' ? enc.calc_results : {};
    const calcLines = Object.entries(calc).filter(([, r]) => r && r.value)
      .map(([id, r]) => `${calcNames[id] || id.replace(/_/g, ' ').toUpperCase()}: ${r.value}${r.unit ? ' ' + r.unit : ''}${r.label ? ` (${r.label})` : ''}`);
    if (calcLines.length) { section('Clinical Calculations'); doc.text(calcLines.join('\n'), 40, doc.y, { width: W }); doc.y += 10; }

    // Vaccinations
    const vacc = enc.vaccinations && typeof enc.vaccinations === 'object' ? enc.vaccinations : {};
    const vg = { given: [], due: [], missed: [], refused: [] };
    Object.entries(vacc).filter(([, v]) => v && v.status).forEach(([k, v]) => {
      (vg[v.status] || vg.given).push(`${k.replace(/^(iap_|other_)/, '').replace(/_/g, ' ')}${v.date ? ` (${v.date})` : ''}`);
    });
    const vLines = [
      vg.given.length && `Given: ${vg.given.join(', ')}`, vg.due.length && `Due: ${vg.due.join(', ')}`,
      vg.missed.length && `Missed: ${vg.missed.join(', ')}`, vg.refused.length && `Patient refused: ${vg.refused.join(', ')}`,
    ].filter(Boolean);
    if (vLines.length) { section('Vaccinations'); doc.text(vLines.join('\n'), 40, doc.y, { width: W }); doc.y += 10; }

    // Diet plan — same content as the OPD print modal: latest charts, first day's meals
    const charts = Array.isArray(dietCharts) ? dietCharts.slice(0, 2) : [];
    if (charts.length) {
      section('Diet Plan');
      for (const chart of charts) {
        const kcal = chart.nutrition_targets?.energy ? `  —  ${chart.nutrition_targets.energy} kcal/day` : '';
        const dur  = chart.duration ? `  ·  ${chart.duration}` : '';
        doc.font('Helvetica-Bold').fillColor('#1e293b').text(`${chart.title || 'Diet chart'}${kcal}${dur}`, 40, doc.y, { width: W });
        doc.y += 2;
        for (const meal of safeArr(chart.day_plans)[0]?.meals || []) {
          if (doc.y > contentBottom - 20) doc.addPage();
          const items = (meal.food_items || [])
            .map(f => `${f.name}${f.serving_size ? ` (${f.serving_size})` : ''}`).join(', ') || '—';
          doc.font('Helvetica-Bold').fillColor(GRAY).text(`${meal.name}${meal.time ? ` (${meal.time})` : ''}: `, 40, doc.y, { continued: true, width: W });
          doc.font('Helvetica').fillColor('#1e293b').text(items, { width: W });
          doc.y += 2;
        }
        doc.y += 6;
      }
      doc.font('Helvetica');
    }

    // Clinical drawing (InferPad canvas), scaled to the content width
    const canvasBuf = dataUrlToBuffer(enc.canvas_image);
    if (canvasBuf) {
      const dims = getImageDimensions(canvasBuf);
      const h = dims && dims.width > 0 ? Math.min(Math.round((W / dims.width) * dims.height), 320) : 200;
      if (doc.y + h > contentBottom) doc.addPage();
      section('Clinical Drawing');
      try { doc.image(canvasBuf, 40, doc.y, { fit: [W, h] }); doc.y += h + 10; } catch {}
    }

    // Follow-up
    if (enc.next_visit_date) {
      section('Follow-Up');
      doc.text(`Visit on: ${fmtDate(enc.next_visit_date)}${enc.next_visit_notes ? '  —  ' + enc.next_visit_notes : ''}`, 40, doc.y, { width: W });
      doc.y += 10;
    }

    // ── Signature (last page only) ────────────────────────────────────────────
    if (sigBuf) {
      if (doc.y > contentBottom - 100) doc.addPage();
      doc.moveDown(1);
      try {
        doc.image(sigBuf, 40, doc.y, { height: 50 });
        doc.y += 56;
      } catch {}
      doc.fillColor(GRAY).fontSize(8).font('Helvetica')
        .text(doctorName ? `Dr. ${doctorName}` : 'Doctor Signature', 40, doc.y);
      doc.moveTo(40, doc.y - 2).lineTo(140, doc.y - 2).strokeColor(GRAY).lineWidth(0.5).stroke();
      const sub = [doctorSpecialization, doctorQualification].filter(Boolean).join(' · ');
      if (sub) doc.fontSize(7.5).text(sub, 40, doc.y);
      doc.y += 10;
    }

    // ── Footer on every page ──────────────────────────────────────────────────
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      // Footer sits inside the bottom margin; without this pdfkit treats it as overflow and
      // appends a blank page for every footer line written.
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      if (footerBuf) {
        const footY = doc.page.height - footerRenderedH;
        try { doc.image(footerBuf, 0, footY, { width: PW }); } catch {}
      } else {
        const footY = doc.page.height - 40;
        doc.moveTo(40, footY - 6).lineTo(PW - 40, footY - 6).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.fillColor(GRAY).fontSize(8).font('Helvetica')
          .text(clinicName || 'Clinic', 40, footY, { width: W / 2, lineBreak: false })
          .text(`Page ${i + 1} of ${totalPages}`, 40, footY, { width: W, align: 'right', lineBreak: false });
      }
      doc.page.margins.bottom = savedBottom;
    }

    doc.end();
  });
}

module.exports = { generatePrescriptionPDF };
