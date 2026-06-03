/**
 * Report Service
 * Manages lab report creation, approval, release, and PDF generation
 */

const path = require('path');
const fs = require('fs');
const { query } = require('../../config/database');
const auditService = require('./auditService');

// TODO: Run `npm install pdfkit` to enable PDF generation
let PDFDocument;
try {
  PDFDocument = require('pdfkit');
} catch (e) {
  PDFDocument = null;
}

function generateReportNumber() {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `RPT-${dateStr}-${rand}`;
}

class ReportService {
  async createReport({
    order_id,
    patient_id,
    lab_id,
    doctor_id,
    report_type = 'FINAL',
    clinical_notes,
    observations,
    recommendations,
    performed_by,
  }) {
    const report_number = generateReportNumber();

    const res = await query(
      `INSERT INTO lab_reports
         (report_number, order_id, patient_id, lab_id, doctor_id, report_type,
          clinical_notes, observations, recommendations)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        report_number,
        order_id || null,
        patient_id,
        lab_id,
        doctor_id || null,
        report_type,
        clinical_notes || null,
        observations || null,
        recommendations || null,
      ]
    );

    const report = res.rows[0];

    await auditService.logAction({
      actor_user_id: performed_by || doctor_id,
      action: 'CREATE_REPORT',
      resource_type: 'LAB_REPORT',
      resource_id: report.id,
      changes_made: { report_number, report_type },
    });

    return report;
  }

  async getReport(report_id) {
    const res = await query(
      `SELECT r.*,
              COALESCE(r.patient_name, p.first_name || ' ' || p.last_name) AS patient_name,
              p.date_of_birth AS patient_dob,
              d.first_name || ' ' || d.last_name AS doctor_name,
              l.facility_name AS lab_name,
              l.address_line1 AS lab_address,
              l.phone AS lab_phone,
              ab.first_name || ' ' || ab.last_name AS approved_by_name
       FROM lab_reports r
       LEFT JOIN users p ON p.id = r.patient_id
       LEFT JOIN users d ON d.id = r.doctor_id
       LEFT JOIN laboratories l ON l.id = r.lab_id
       LEFT JOIN users ab ON ab.id = r.approved_by
       WHERE r.id = $1`,
      [report_id]
    );
    if (res.rows.length === 0) return null;
    const report = res.rows[0];

    // Fetch results from the order
    if (report.order_id) {
      const resultsRes = await query(
        `SELECT oi.test_name, oi.test_code, ltr.result_value, ltr.result_unit,
                ltr.is_abnormal, ltr.is_critical_value,
                tc.reference_range_low, tc.reference_range_high, tc.reference_range_text,
                tc.unit
         FROM lab_order_items oi
         LEFT JOIN lab_test_results ltr ON ltr.id = oi.result_id
         LEFT JOIN lab_test_catalog tc ON tc.id = oi.test_id
         WHERE oi.order_id = $1`,
        [report.order_id]
      );
      report.results = resultsRes.rows;
    } else {
      report.results = [];
    }

    return report;
  }

  async getReportsByPatient(patient_id, filters = {}) {
    const params = [patient_id];
    let where = 'r.patient_id = $1';
    let idx = 2;

    if (filters.status) {
      where += ` AND r.status = $${idx++}`;
      params.push(filters.status);
    }
    if (filters.start_date) {
      where += ` AND r.created_at >= $${idx++}`;
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      where += ` AND r.created_at <= $${idx++}`;
      params.push(filters.end_date);
    }

    const res = await query(
      `SELECT r.*, l.facility_name AS lab_name, d.first_name || ' ' || d.last_name AS doctor_name
       FROM lab_reports r
       LEFT JOIN laboratories l ON l.id = r.lab_id
       LEFT JOIN users d ON d.id = r.doctor_id
       WHERE ${where}
       ORDER BY r.created_at DESC`,
      params
    );
    return res.rows;
  }

  async approveReport(report_id, approved_by) {
    const res = await query(
      `UPDATE lab_reports
       SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND status IN ('DRAFT','PENDING_APPROVAL')
       RETURNING *`,
      [approved_by, report_id]
    );
    if (res.rows.length === 0) throw new Error('Report not found or cannot be approved in current state');

    await auditService.logAction({
      actor_user_id: approved_by,
      action: 'APPROVE_REPORT',
      resource_type: 'LAB_REPORT',
      resource_id: report_id,
      changes_made: { approved_by },
    });

    return res.rows[0];
  }

  async releaseReport(report_id, released_by) {
    const res = await query(
      `UPDATE lab_reports
       SET status = 'RELEASED', released_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'APPROVED'
       RETURNING *`,
      [report_id]
    );
    if (res.rows.length === 0) throw new Error('Report not found or not approved yet');

    await auditService.logAction({
      actor_user_id: released_by,
      action: 'RELEASE_REPORT',
      resource_type: 'LAB_REPORT',
      resource_id: report_id,
      changes_made: {},
    });

    return res.rows[0];
  }

  async generatePDF(report_id) {
    const report = await this.getReport(report_id);
    if (!report) throw new Error('Report not found');

    const uploadsDir = path.join(__dirname, '..', '..', '..', 'uploads', 'reports');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const fileName = `report_${report_id}.pdf`;
    const filePath = path.join(uploadsDir, fileName);
    const publicPath = `/uploads/reports/${fileName}`;

    if (PDFDocument) {
      await this._generateWithPDFKit(report, filePath);
    } else {
      await this._generateHTMLFallback(report, filePath);
    }

    // Save path to DB
    await query(`UPDATE lab_reports SET pdf_path = $1, updated_at = NOW() WHERE id = $2`, [publicPath, report_id]);

    return { pdf_path: publicPath, file_path: filePath };
  }

  async _generateWithPDFKit(report, filePath) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text(report.lab_name || 'Laboratory', { align: 'center' });
      if (report.lab_address) doc.fontSize(10).font('Helvetica').text(report.lab_address, { align: 'center' });
      if (report.lab_phone) doc.fontSize(10).text(`Tel: ${report.lab_phone}`, { align: 'center' });
      doc.moveDown();
      doc.fontSize(16).font('Helvetica-Bold').text('LAB REPORT', { align: 'center' });
      doc.moveDown(0.5);

      // Report metadata
      doc.fontSize(10).font('Helvetica');
      doc.text(`Report Number: ${report.report_number}    Date: ${new Date(report.created_at).toLocaleDateString()}`);
      doc.text(`Report Type: ${report.report_type}    Status: ${report.status}`);
      doc.moveDown();

      // Patient section
      doc.fontSize(12).font('Helvetica-Bold').text('PATIENT INFORMATION');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Name: ${report.patient_name || 'N/A'}    DOB: ${report.patient_dob ? new Date(report.patient_dob).toLocaleDateString() : 'N/A'}`);
      doc.text(`Patient ID: ${report.patient_id}`);
      if (report.doctor_name) doc.text(`Referring Doctor: ${report.doctor_name}`);
      doc.moveDown();

      // Results table
      doc.fontSize(12).font('Helvetica-Bold').text('TEST RESULTS');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.3);

      const colX = { test: 50, result: 220, unit: 310, range: 380, flag: 520 };
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('TEST NAME', colX.test, doc.y);
      doc.text('RESULT', colX.result, doc.y - doc.currentLineHeight());
      doc.text('UNIT', colX.unit, doc.y - doc.currentLineHeight());
      doc.text('REFERENCE RANGE', colX.range, doc.y - doc.currentLineHeight());
      doc.text('FLAG', colX.flag, doc.y - doc.currentLineHeight());
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.2);

      doc.fontSize(9).font('Helvetica');
      for (const r of (report.results || [])) {
        const flag = r.is_critical_value ? 'CRITICAL' : r.is_abnormal ? (r.result_value > r.reference_range_high ? 'H' : 'L') : '';
        const rangeText = r.reference_range_text ||
          (r.reference_range_low != null && r.reference_range_high != null
            ? `${r.reference_range_low} - ${r.reference_range_high}`
            : '');
        const y = doc.y;
        doc.text(r.test_name || '', colX.test, y, { width: 160 });
        doc.text(r.result_value != null ? String(r.result_value) : 'Pending', colX.result, y);
        doc.text(r.result_unit || r.unit || '', colX.unit, y);
        doc.text(rangeText, colX.range, y, { width: 130 });
        if (flag) {
          doc.fillColor(flag === 'CRITICAL' ? 'red' : 'orange').text(flag, colX.flag, y).fillColor('black');
        }
        doc.moveDown(0.5);
      }
      doc.moveDown();

      // Notes sections
      if (report.clinical_notes) {
        doc.fontSize(11).font('Helvetica-Bold').text('CLINICAL NOTES');
        doc.fontSize(10).font('Helvetica').text(report.clinical_notes);
        doc.moveDown();
      }
      if (report.observations) {
        doc.fontSize(11).font('Helvetica-Bold').text('OBSERVATIONS');
        doc.fontSize(10).font('Helvetica').text(report.observations);
        doc.moveDown();
      }
      if (report.recommendations) {
        doc.fontSize(11).font('Helvetica-Bold').text('RECOMMENDATIONS');
        doc.fontSize(10).font('Helvetica').text(report.recommendations);
        doc.moveDown();
      }

      // Footer
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.3);
      doc.fontSize(9).font('Helvetica');
      if (report.approved_by_name) {
        doc.text(`Approved by: ${report.approved_by_name}    Date: ${report.approved_at ? new Date(report.approved_at).toLocaleString() : ''}`);
      }
      doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  async _generateHTMLFallback(report, filePath) {
    // HTML-based fallback when pdfkit is not installed
    const resultsRows = (report.results || []).map(r => {
      const flag = r.is_critical_value ? '<span style="color:red;font-weight:bold">CRITICAL</span>'
        : r.is_abnormal ? '<span style="color:orange;font-weight:bold">ABNORMAL</span>' : '';
      const rangeText = r.reference_range_text ||
        (r.reference_range_low != null ? `${r.reference_range_low} - ${r.reference_range_high}` : '');
      return `<tr>
        <td>${r.test_name || ''}</td>
        <td>${r.result_value != null ? r.result_value : 'Pending'}</td>
        <td>${r.result_unit || r.unit || ''}</td>
        <td>${rangeText}</td>
        <td>${flag}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><title>Lab Report ${report.report_number}</title>
    <style>body{font-family:Arial,sans-serif;margin:40px}h1{text-align:center}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ccc;padding:6px 8px;font-size:13px}th{background:#f0f0f0}.section{margin:20px 0}
    .header{text-align:center;margin-bottom:20px}.footer{margin-top:30px;border-top:1px solid #ccc;padding-top:10px;font-size:12px}</style>
    </head><body>
    <div class="header"><h1>${report.lab_name || 'Laboratory'}</h1>
    <p>${report.lab_address || ''}</p><p>${report.lab_phone ? 'Tel: ' + report.lab_phone : ''}</p>
    <h2>LAB REPORT</h2></div>
    <div class="section"><b>Report Number:</b> ${report.report_number} &nbsp; <b>Date:</b> ${new Date(report.created_at).toLocaleDateString()}<br>
    <b>Type:</b> ${report.report_type} &nbsp; <b>Status:</b> ${report.status}</div>
    <div class="section"><h3>Patient Information</h3>
    <b>Name:</b> ${report.patient_name || 'N/A'} &nbsp; <b>DOB:</b> ${report.patient_dob ? new Date(report.patient_dob).toLocaleDateString() : 'N/A'}<br>
    <b>Patient ID:</b> ${report.patient_id}<br>
    ${report.doctor_name ? '<b>Referring Doctor:</b> ' + report.doctor_name : ''}</div>
    <div class="section"><h3>Test Results</h3>
    <table><thead><tr><th>Test Name</th><th>Result</th><th>Unit</th><th>Reference Range</th><th>Flag</th></tr></thead>
    <tbody>${resultsRows}</tbody></table></div>
    ${report.clinical_notes ? '<div class="section"><h3>Clinical Notes</h3><p>' + report.clinical_notes + '</p></div>' : ''}
    ${report.observations ? '<div class="section"><h3>Observations</h3><p>' + report.observations + '</p></div>' : ''}
    ${report.recommendations ? '<div class="section"><h3>Recommendations</h3><p>' + report.recommendations + '</p></div>' : ''}
    <div class="footer">
    ${report.approved_by_name ? '<b>Approved by:</b> ' + report.approved_by_name + ' &nbsp; <b>Date:</b> ' + (report.approved_at ? new Date(report.approved_at).toLocaleString() : '') + '<br>' : ''}
    <b>Generated:</b> ${new Date().toLocaleString()}</div>
    </body></html>`;

    fs.writeFileSync(filePath.replace(/\.pdf$/, '.html'), html, 'utf8');
    // Write a minimal text PDF placeholder
    fs.writeFileSync(filePath, `%PDF-1.4\n% HTML report saved as ${filePath.replace(/\.pdf$/, '.html')}\n`, 'utf8');
  }

  async getTrendData(patient_id, test_code, months = 6) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const res = await query(
      `SELECT ltr.result_value, ltr.result_unit, ltr.collected_at, ltr.is_abnormal, ltr.is_critical_value,
              lo.lab_id, l.facility_name AS lab_name
       FROM lab_test_results ltr
       JOIN lab_order_items loi ON loi.result_id = ltr.id
       JOIN lab_orders lo ON lo.id = loi.order_id
       JOIN laboratories l ON l.id = lo.lab_id
       WHERE ltr.patient_id = $1
         AND ltr.test_code = $2
         AND ltr.collected_at >= $3
       ORDER BY ltr.collected_at ASC`,
      [patient_id, test_code, startDate.toISOString()]
    );

    return {
      patient_id,
      test_code,
      months,
      data_points: res.rows,
    };
  }
}

module.exports = new ReportService();
