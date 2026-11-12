/**
 * Printable lab report (A4 PDF): letterhead, patient & sample details, results grouped by
 * department and section with H/L flags and test descriptions, clinical notes, possible
 * causes of abnormal values, signatories and a footer on every page.
 * The same PDF is used for Print in the app and for the emailed report.
 */
const PDFDocument = require('pdfkit');
const { SECTION_NAME, SECTION_NOTE, CAUSES, sectionKey } = require('./content');

const NAVY = '#0f3d6e', INK = '#111827', GREY = '#4b5563', LIGHT = '#6b7280', RED = '#b91c1c', BAND = '#eef2f7';
const PAGE_W = 595.28, PAGE_H = 841.89, M = 32, R = PAGE_W - M, W = R - M;
const FOOT_H = 58;                       // reserved for the footer on every page
const BOTTOM = PAGE_H - FOOT_H - 8;

// Helvetica (WinAnsi) has no ≥ ≤ ₹ etc.
const t = v => String(v ?? '').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/₹/g, 'Rs.').replace(/[‐‑]/g, '-')
  .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—‘’“”•…]/g, '');
const num = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const fmtNum = v => { const n = num(v); return n === null ? t(v) : String(parseFloat(n.toFixed(4))); };
const fmtWhen = d => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase() : '—');
const ageOf = dob => { if (!dob) return null; const a = Math.floor((Date.now() - new Date(dob)) / 31557600000); return a >= 0 && a < 130 ? a : null; };

function refRange(x) {
  const lo = num(x.reference_range_low), hi = num(x.reference_range_high);
  if (lo !== null && hi !== null) return `${fmtNum(lo)} - ${fmtNum(hi)}`;
  if (x.reference_range_text) return t(x.reference_range_text);
  if (hi !== null) return `< ${fmtNum(hi)}`;
  if (lo !== null) return `> ${fmtNum(lo)}`;
  return '';
}
function flagOf(x) {
  const n = num(x.result_value), lo = num(x.reference_range_low), hi = num(x.reference_range_high);
  if (n === null) return '';
  if (hi !== null && n > hi) return 'H';
  if (lo !== null && n < lo) return 'L';
  return '';
}

// department → sections → tests, in the order they first appear
function groupResults(results) {
  const depts = [];
  for (const x of results) {
    const dept = (x.category || 'Laboratory Tests').toUpperCase();
    const key = x.panel_name ? `panel:${x.panel_name}` : sectionKey(x.sub_category) || 'other';
    const title = x.panel_name || SECTION_NAME[key] || x.sub_category || '';
    let d = depts.find(g => g.name === dept);
    if (!d) depts.push(d = { name: dept, sections: [] });
    let s = d.sections.find(g => g.key === key);
    if (!s) d.sections.push(s = { key, title, noteKey: sectionKey(x.sub_category), description: x.panel_description, tests: [] });
    s.tests.push(x);
  }
  return depts;
}

/**
 * @param {object} p
 * @param {object} p.report   one entry from loadPatientLabReports()
 * @param {object} p.patient  { name, age, gender, mobile, uhid, dob, referred_by }
 * @param {string} p.clinicName
 * @returns {Promise<Buffer>}
 */
function buildLabReportPdf({ report, patient, clinicName }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: `Lab Report - ${t(patient.name)}` } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const lab = report.lab || { facility_name: report.lab_name || 'Laboratory', staff: [] };
    const results = (report.results || []).filter(x => x && x.test_name);
    const age = patient.age ?? ageOf(patient.dob);
    const sex = { M: 'M', F: 'F', male: 'M', female: 'F' }[String(patient.gender || '').toLowerCase()] || patient.gender || '';

    // ── Letterhead ─────────────────────────────────────────────────────────
    const letterhead = () => {
      doc.save().rect(0, 0, PAGE_W, 92).fill(NAVY).restore();
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(21).text(t(lab.facility_name), M, 24, { width: 330 });
      const sub = [lab.is_nabl_accredited ? 'NABL Accredited Laboratory' : 'Diagnostic Laboratory',
        lab.accreditation_number ? `Reg. No.: ${t(lab.accreditation_number)}` : null].filter(Boolean).join('  |  ');
      doc.font('Helvetica').fontSize(9).fillColor('#c7d6ea').text(sub, M, doc.y + 4, { width: 330 });
      const addr = [lab.address_line1, lab.city, lab.state, lab.postal_code].filter(Boolean).map(t).join(', ');
      const lines = [lab.phone && `Phone: ${t(lab.phone)}`, lab.email && `Email: ${t(lab.email)}`, addr].filter(Boolean);
      doc.fontSize(9).fillColor('#fff');
      let y = 26;
      for (const l of lines) { doc.text(l, 370, y, { width: R - 370, align: 'right' }); y = doc.y + 3; }
    };
    // compact header on continuation pages
    const contHeader = () => {
      doc.save().rect(0, 0, PAGE_W, 34).fill(NAVY).restore();
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11).text(t(lab.facility_name), M, 12, { width: 260 });
      doc.font('Helvetica').fontSize(8.5).text(
        `${t(patient.name)}  |  ${[age != null ? `${age} Y` : null, sex].filter(Boolean).join(' / ')}${patient.uhid ? `  |  UHID ${t(patient.uhid)}` : ''}${report.order_number ? `  |  ${t(report.order_number)}` : ''}`,
        300, 13, { width: R - 300, align: 'right' });
      doc.y = 48;
    };

    letterhead();

    // ── Patient & sample details ───────────────────────────────────────────
    const top = 106;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(t(patient.name || 'Patient'), M, top, { width: 230 });
    const kv = (x, y, k, v, kw = 64, vw = 140, bold = false) => {
      doc.font('Helvetica').fontSize(8.8).fillColor(GREY).text(k, x, y, { width: kw });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(INK).text(`: ${t(v || '—')}`, x + kw, y, { width: vw });
    };
    let y = doc.y + 4;
    kv(M, y, 'Age / Sex', [age != null ? `${age} YRS` : null, sex].filter(Boolean).join(' / ') || '—'); y += 13;
    kv(M, y, 'Referred by', patient.referred_by || 'Self'); y += 13;
    kv(M, y, 'UHID', patient.uhid, 64, 140, true); y += 13;
    if (patient.mobile) { kv(M, y, 'Mobile', patient.mobile); y += 13; }
    const leftEnd = y;

    const c2 = 262;
    doc.moveTo(c2 - 10, top).lineTo(c2 - 10, Math.max(leftEnd, top + 70)).lineWidth(0.6).strokeColor('#9ca3af').stroke();
    let y2 = top + 2;
    if (report.order_number || report.report_number) {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(t(report.report_number || report.order_number), c2, y2); y2 += 15;
    }
    for (const [k, v] of [['Registered on', report.registered_at || report.created_at], ['Collected on', report.collected_at],
      ['Received on', report.received_at_lab], ['Reported on', report.reported_at || report.released_at || report.approved_at]]) {
      kv(c2, y2, k, fmtWhen(v), 72, 130); y2 += 13;
    }
    const c3 = 478;
    doc.moveTo(c3 - 10, top).lineTo(c3 - 10, Math.max(leftEnd, y2, top + 70)).stroke();
    const status = { REPORTED: 'Final', RESULTED: 'Final', PROCESSING: 'Provisional', COLLECTED: 'Provisional' }[report.order_status] || (results.every(x => x.result_value != null) ? 'Final' : 'Provisional');
    doc.font('Helvetica').fontSize(8).fillColor(LIGHT).text('Report status', c3, top + 2, { width: R - c3 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(status === 'Final' ? '#047857' : '#b45309').text(status, c3, top + 13, { width: R - c3 });
    const specimens = [...new Set(results.map(x => x.specimen_type).filter(Boolean))];
    if (specimens.length) {
      doc.font('Helvetica').fontSize(8).fillColor(LIGHT).text('Specimen', c3, top + 34, { width: R - c3 });
      doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(t(specimens.join(', ')), c3, top + 45, { width: R - c3 });
    }
    y = Math.max(leftEnd, y2, doc.y, top + 72) + 6;
    doc.moveTo(M, y).lineTo(R, y).lineWidth(1).strokeColor(INK).stroke();
    doc.y = y + 10;

    // ── Helpers for flowing content ────────────────────────────────────────
    const ensure = (h, onNewPage) => {
      if (doc.y + h <= BOTTOM) return false;
      doc.addPage(); contHeader(); if (onNewPage) onNewPage();
      return true;
    };
    const COL = { test: M + 6, flag: M + 238, value: M + 254, unit: M + 330, ref: M + 410 };
    const WIDTH = { test: 228, value: 72, unit: 76, ref: R - (M + 410) - 4 };
    const tableHead = () => {
      const yy = doc.y;
      doc.save().rect(M, yy, W, 16).fill(BAND).restore();
      doc.rect(M, yy, W, 16).lineWidth(0.6).strokeColor('#6b7280').stroke();
      doc.font('Helvetica-Bold').fontSize(8.8).fillColor(INK);
      doc.text('TEST', COL.test, yy + 4); doc.text('VALUE', COL.value, yy + 4);
      doc.text('UNIT', COL.unit, yy + 4); doc.text('REFERENCE', COL.ref, yy + 4);
      doc.y = yy + 20;
    };

    if (!results.length) {
      doc.font('Helvetica').fontSize(10).fillColor(GREY).text('Results are awaited from the laboratory.', M, doc.y, { width: W, align: 'center' });
    }

    for (const dept of groupResults(results)) {
      ensure(80);
      doc.font('Helvetica-Bold').fontSize(12.5).fillColor(INK).text(dept.name, M, doc.y, { width: W, align: 'center' });
      doc.moveDown(0.2);
      for (const sec of dept.sections) {
        ensure(70);
        if (sec.title) {
          doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(t(sec.title).toUpperCase(), M, doc.y, { width: W, align: 'center' });
          doc.moveDown(0.25);
        }
        tableHead();
        const tableTop = doc.y - 20;
        let boxTop = tableTop;
        for (const x of sec.tests) {
          const flag = flagOf(x);
          const abnormal = !!flag || x.is_critical;
          const name = t(x.test_name);
          const desc = x.description ? t(x.description) : '';
          doc.font(abnormal ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.2);
          const hName = doc.heightOfString(name, { width: WIDTH.test });
          doc.font('Helvetica').fontSize(7.4);
          const hDesc = desc ? doc.heightOfString(desc, { width: WIDTH.test }) + 1 : 0;
          const hRef = doc.font('Helvetica').fontSize(8.8).heightOfString(refRange(x) || '-', { width: WIDTH.ref });
          const h = Math.max(hName + hDesc, hRef) + 9;
          if (ensure(h + 2, () => { tableHead(); boxTop = doc.y - 20; })) { /* continued on new page */ }
          const yy = doc.y + 3;   // top padding inside the row
          doc.font(abnormal ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.2).fillColor(INK).text(name, COL.test, yy, { width: WIDTH.test });
          if (desc) doc.font('Helvetica').fontSize(7.4).fillColor(LIGHT).text(desc, COL.test, yy + hName, { width: WIDTH.test });
          if (flag) doc.font('Helvetica-Bold').fontSize(9.2).fillColor(x.is_critical ? RED : INK).text(flag, COL.flag, yy);
          const val = x.result_value != null && x.result_value !== '' ? fmtNum(x.result_value) : 'Pending';
          doc.font(abnormal ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.2)
            .fillColor(x.result_value == null ? LIGHT : x.is_critical ? RED : INK).text(val + (x.is_critical ? ' *' : ''), COL.value, yy, { width: WIDTH.value });
          doc.font(abnormal ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.8).fillColor(INK).text(t(x.result_unit || ''), COL.unit, yy, { width: WIDTH.unit });
          doc.text(refRange(x) || '-', COL.ref, yy, { width: WIDTH.ref });
          doc.y = yy - 3 + h;
          doc.moveTo(M, doc.y - 2).lineTo(R, doc.y - 2).lineWidth(0.3).strokeColor('#e5e7eb').stroke();
          // outer border for this page's part of the table
          doc.rect(M, boxTop, W, doc.y - boxTop).lineWidth(0.6).strokeColor('#6b7280').stroke();
        }
        if (sec.tests.some(x => x.is_critical)) {
          doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(RED).text('* Critical value — the referring doctor should be informed immediately.', M, doc.y + 2, { width: W });
        }
        doc.moveDown(0.6);

        // ── Clinical notes + possible causes ─────────────────────────────
        const note = t(sec.description && sec.key.startsWith('panel:') && !SECTION_NOTE[sec.noteKey] ? sec.description : SECTION_NOTE[sec.noteKey] || '');
        const abnormalTests = sec.tests.filter(x => flagOf(x) && CAUSES[x.test_code]);
        const causeTests = (abnormalTests.length ? abnormalTests : sec.tests.filter(x => CAUSES[x.test_code])).slice(0, 10);
        if (!note && !causeTests.length) continue;
        const pad = 8, iw = W - pad * 2;
        doc.font('Helvetica').fontSize(8.6);
        const hNote = note ? doc.heightOfString(note, { width: iw }) + 14 : 0;
        const cw = [110, (iw - 110) / 2, (iw - 110) / 2];
        const rowH = x => {   // measured in the font each cell is drawn in (bold = the abnormal side)
          const [hi, lo] = CAUSES[x.test_code];
          const f = flagOf(x);
          const h = (txt, w, bold) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).heightOfString(t(txt), { width: w });
          return Math.max(h(x.test_name, cw[0] - 6, true), h(hi, cw[1] - 6, f === 'H'), h(lo, cw[2] - 6, f === 'L'), 10) + 6;
        };
        const hCauses = causeTests.length ? 30 + causeTests.reduce((s, x) => s + rowH(x), 0) : 0;
        ensure(Math.min(hNote + hCauses + pad * 2, 380));
        const by = doc.y;
        const boxH = hNote + hCauses + pad * 2 - (causeTests.length ? 0 : 4);
        doc.save().rect(M, by, W, boxH).fill('#f3f6fa').restore();
        let yy = by + pad;
        if (note) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text('Clinical Notes:', M + pad, yy);
          doc.font('Helvetica').fontSize(8.6).fillColor(INK).text(note, M + pad, yy + 12, { width: iw });
          yy = doc.y + 6;
        }
        if (causeTests.length) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
            .text(abnormalTests.length ? 'Possible causes of abnormal parameters:' : 'Possible causes if values are abnormal:', M + pad, yy);
          yy = doc.y + 3;
          const x0 = M + pad, xs = [x0, x0 + cw[0], x0 + cw[0] + cw[1]];
          const dashed = (x1, y1, x2, y2) => doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(0.5).dash(1.5, { space: 1.5 }).strokeColor('#6b7280').stroke().undash();
          doc.font('Helvetica-Bold').fontSize(8.4).fillColor(INK);
          doc.text('', xs[0] + 3, yy + 2); doc.text('High', xs[1] + 3, yy + 2); doc.text('Low', xs[2] + 3, yy + 2);
          const headTop = yy; yy += 13;
          dashed(x0, headTop, x0 + iw, headTop); dashed(x0, yy, x0 + iw, yy);
          for (const x of causeTests) {
            const h = rowH(x);
            const [hi, lo] = CAUSES[x.test_code];
            const f = flagOf(x);
            doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text(t(x.test_name), xs[0] + 3, yy + 2, { width: cw[0] - 6 });
            doc.font(f === 'H' ? 'Helvetica-Bold' : 'Helvetica').fillColor(f === 'H' ? RED : INK).text(t(hi), xs[1] + 3, yy + 2, { width: cw[1] - 6 });
            doc.font(f === 'L' ? 'Helvetica-Bold' : 'Helvetica').fillColor(f === 'L' ? RED : INK).text(t(lo), xs[2] + 3, yy + 2, { width: cw[2] - 6 });
            yy += h;
            dashed(x0, yy, x0 + iw, yy);
          }
          for (const xv of [...xs, x0 + iw]) dashed(xv, headTop, xv, yy);
        }
        doc.y = by + boxH + 12;
      }
    }

    // ── Observations / notes from the lab ──────────────────────────────────
    for (const [label, val] of [['Observations', report.observations], ['Notes', report.clinical_notes]]) {
      if (!val) continue;
      ensure(40);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(`${label}: `, M, doc.y, { continued: true })
        .font('Helvetica').text(t(val), { width: W });
      doc.moveDown(0.5);
    }

    // ── Signatories ────────────────────────────────────────────────────────
    const freshPage = ensure(62);   // end line + signatures
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(GREY).text('*** End of Report ***', M, doc.y + 4, { width: W, align: 'center' });
    const staff = lab.staff || [];
    const director = staff.find(s => /DIRECTOR|PATHOLOG|DOCTOR/i.test(s.role || ''));
    const tech = staff.find(s => s !== director && /TECH|STAFF|INCHARGE|SUPERVISOR|MANAGER/i.test(s.role || '')) || staff.find(s => s !== director);
    const roleName = r => ({ LAB_DIRECTOR: 'Lab Director / Pathologist', LAB_TECHNICIAN: 'Lab Technician', LAB_STAFF: 'Lab Incharge', LAB_MANAGER: 'Lab Manager' }[r] || t(String(r || 'Authorised Signatory').replace(/_/g, ' ')));
    // at the foot of the last page, or just below the end line if they had to start a new page
    const sy = freshPage ? doc.y + 36 : Math.min(Math.max(doc.y + 30, BOTTOM - 46), BOTTOM - 26);
    const sign = (s, x, align) => {
      doc.moveTo(align === 'left' ? x : x - 150, sy).lineTo(align === 'left' ? x + 150 : x, sy).lineWidth(0.6).strokeColor('#9ca3af').stroke();
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(t(s?.name || 'Authorised Signatory'), align === 'left' ? x : x - 200, sy + 5, { width: 200, align });
      doc.font('Helvetica').fontSize(8.5).fillColor(GREY).text(s ? roleName(s.role) : 'Laboratory', align === 'left' ? x : x - 200, sy + 18, { width: 200, align });
    };
    sign(tech, M, 'left');
    sign(director, R, 'right');

    // ── Footer on every page ───────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;   // footer sits below the content margin; don't let it start a new page
      const fy = PAGE_H - FOOT_H;
      doc.moveTo(M, fy).lineTo(R, fy).lineWidth(0.8).strokeColor(NAVY).stroke();
      doc.font('Helvetica').fontSize(7.6).fillColor(GREY).text(
        'Please correlate clinically. Results relate only to the sample tested. If a result does not match the clinical picture, contact the laboratory for a free re-check.',
        M, fy + 6, { width: W, align: 'center', lineBreak: true });
      doc.font('Helvetica').fontSize(7.6).fillColor(LIGHT)
        .text(`${clinicName ? `Shared by ${t(clinicName)}  |  ` : ''}Printed ${fmtWhen(new Date())}`, M, fy + 30, { width: W / 2, lineBreak: false })
        .text(`Page ${i - range.start + 1} of ${range.count}`, M + W / 2, fy + 30, { width: W / 2, align: 'right', lineBreak: false });
      doc.save().rect(0, PAGE_H - 8, PAGE_W, 8).fill(NAVY).restore();
    }
    doc.end();
  });
}

module.exports = { buildLabReportPdf };
