/**
 * UploadTab - OpenELIS-inspired Upload screen (extracted from LabPortal.jsx)
 */

import React, { useState } from 'react';
import { Upload as UploadIcon, FileText, RefreshCw, Check } from 'lucide-react';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
});

async function apiFetch(url, options = {}) {
  const res = await fetch(url, { headers: authHeaders(), ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function UploadTab({ labId, styles: s }) {
  // File upload (OpenELIS-style top section)
  const [fileUploadMode, setFileUploadMode] = useState('sample'); // 'patient' | 'sample'
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileUploading, setFileUploading] = useState(false);
  const [fileMsg, setFileMsg] = useState('');
  const [fileMsgType, setFileMsgType] = useState('');

  // JSON/HL7/FHIR upload (existing)
  const [uploadFormat, setUploadFormat] = useState('JSON');
  const [uploadData, setUploadData] = useState('');
  const [patientId, setPatientId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [jsonMsg, setJsonMsg] = useState('');
  const [jsonMsgType, setJsonMsgType] = useState('');

  // PDF upload
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfPatientId, setPdfPatientId] = useState('');
  const [pdfTestDate, setPdfTestDate] = useState('');
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfMsg, setPdfMsg] = useState('');
  const [pdfMsgType, setPdfMsgType] = useState('');

  const [copied, setCopied] = useState(false);

  const showFileMsg = (m, t = 'success') => { setFileMsg(m); setFileMsgType(t); setTimeout(() => setFileMsg(''), 5000); };
  const showJsonMsg = (m, t = 'success') => { setJsonMsg(m); setJsonMsgType(t); setTimeout(() => setJsonMsg(''), 5000); };
  const showPdfMsg = (m, t = 'success') => { setPdfMsg(m); setPdfMsgType(t); setTimeout(() => setPdfMsg(''), 5000); };

  const handleFileUpload = async () => {
    if (!selectedFile) { showFileMsg('Please choose a file first', 'error'); return; }
    try {
      setFileUploading(true);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('upload_type', fileUploadMode);
      formData.append('lab_id', labId || '');
      const res = await fetch('/api/v1/labs/upload-pdf', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body: formData,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Upload failed');
      showFileMsg(result.message || 'File uploaded successfully');
      setSelectedFile(null);
    } catch (err) {
      showFileMsg(`Upload failed: ${err.message}`, 'error');
    } finally {
      setFileUploading(false);
    }
  };

  const handleUploadJSON = async (e) => {
    e.preventDefault();
    if (!uploadData || !patientId) { showJsonMsg('Please fill in all required fields', 'error'); return; }
    try {
      setIsUploading(true);
      let jsonData;
      try { jsonData = JSON.parse(uploadData); } catch { showJsonMsg('Invalid JSON format', 'error'); return; }
      const result = await apiFetch('/api/v1/labs/upload-result', {
        method: 'POST',
        body: JSON.stringify({ format: uploadFormat, data: jsonData, patient_id: patientId }),
      });
      setUploadResult(result);
      showJsonMsg(result.message || 'Upload successful');
      setUploadData('');
      setPatientId('');
    } catch (error) {
      showJsonMsg(`Upload failed: ${error.message}`, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadPDF = async (e) => {
    e.preventDefault();
    if (!pdfFile || !pdfPatientId) { showPdfMsg('Please select file and enter patient ID', 'error'); return; }
    try {
      setPdfUploading(true);
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('patient_id', pdfPatientId);
      if (pdfTestDate) formData.append('test_date', pdfTestDate);
      const res = await fetch('/api/v1/labs/upload-pdf', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body: formData,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Upload failed');
      showPdfMsg(result.message || 'PDF processed successfully');
      setPdfFile(null);
      setPdfPatientId('');
      setPdfTestDate('');
    } catch (error) {
      showPdfMsg(`PDF upload failed: ${error.message}`, 'error');
    } finally {
      setPdfUploading(false);
    }
  };

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Upload</div>
          <div className={s.pageSubtitle}>Upload files and lab results</div>
        </div>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => { setSelectedFile(null); setUploadResult(null); }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* OpenELIS-style File Upload */}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div className={s.cardHeader}>
          <div className={s.cardTitle}>File Upload</div>
        </div>
        <div className={s.cardBody}>
          {fileMsg && <div className={`${s.alert} ${fileMsgType === 'error' ? s.alertError : s.alertSuccess}`}>{fileMsg}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <label className={`${s.btn} ${s.btnSecondary}`} style={{ cursor: 'pointer' }}>
              <UploadIcon size={14} /> Choose File
              <input
                type="file"
                style={{ display: 'none' }}
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </label>
            {selectedFile && (
              <span style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 500 }}>
                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="fileMode"
                  value="patient"
                  checked={fileUploadMode === 'patient'}
                  onChange={() => setFileUploadMode('patient')}
                /> Patient
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="fileMode"
                  value="sample"
                  checked={fileUploadMode === 'sample'}
                  onChange={() => setFileUploadMode('sample')}
                /> Sample
              </label>
            </div>
            <button
              className={`${s.btn} ${s.btnPrimary}`}
              onClick={handleFileUpload}
              disabled={fileUploading || !selectedFile}
            >
              <UploadIcon size={14} /> {fileUploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      </div>

      {/* JSON/HL7/FHIR and PDF Upload */}
      <div className={s.uploadGrid}>
        {/* JSON/HL7/FHIR Upload */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div className={s.cardTitle}>Upload JSON / HL7 / FHIR Result</div>
          </div>
          <div className={s.cardBody}>
            {jsonMsg && <div className={`${s.alert} ${jsonMsgType === 'error' ? s.alertError : s.alertSuccess}`}>{jsonMsg}</div>}
            <form onSubmit={handleUploadJSON}>
              <div className={s.formGrid} style={{ marginBottom: 12 }}>
                <div className={s.field}>
                  <label className={s.label}>Format</label>
                  <select className={s.select} value={uploadFormat} onChange={(e) => setUploadFormat(e.target.value)} disabled={isUploading}>
                    <option>JSON</option>
                    <option>HL7</option>
                    <option>FHIR</option>
                  </select>
                </div>
                <div className={s.field}>
                  <label className={s.label}>Patient ID *</label>
                  <input className={s.input} type="text" value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="e.g., patient-123" disabled={isUploading} />
                </div>
              </div>
              <div className={s.field} style={{ marginBottom: 14 }}>
                <label className={s.label}>Test Data ({uploadFormat}) *</label>
                <textarea
                  className={`${s.textarea} ${s.codeInput}`}
                  value={uploadData}
                  onChange={(e) => setUploadData(e.target.value)}
                  placeholder={uploadFormat === 'JSON' ? '{\n  "resourceType": "DiagnosticReport",\n  ...\n}' : 'Paste HL7/FHIR message here'}
                  rows={10}
                  disabled={isUploading}
                  style={{ minHeight: 200 }}
                />
              </div>
              <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={isUploading} style={{ width: '100%', justifyContent: 'center' }}>
                <UploadIcon size={15} />
                {isUploading ? 'Uploading...' : 'Upload Result'}
              </button>
            </form>

            {uploadResult && (
              <div className={s.uploadResult}>
                <div className={s.uploadResultTitle}>Upload Successful — {uploadResult.results_uploaded} result(s)</div>
                {uploadResult.critical_count > 0 && (
                  <div className={`${s.badge} ${s.badgeRed}`} style={{ marginBottom: 8 }}>
                    {uploadResult.critical_count} critical value(s)
                  </div>
                )}
                <ul className={s.uploadResultList}>
                  {(uploadResult.results || []).map((r) => (
                    <li key={r.id}>
                      <Check size={12} color="#166534" />
                      {r.test_name}
                      {r.is_critical_value && <span className={`${s.badge} ${s.badgeRed}`} style={{ marginLeft: 6 }}>CRITICAL</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* PDF Upload */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div className={s.cardTitle}>Upload PDF Lab Report</div>
          </div>
          <div className={s.cardBody}>
            {pdfMsg && <div className={`${s.alert} ${pdfMsgType === 'error' ? s.alertError : s.alertSuccess}`}>{pdfMsg}</div>}
            <form onSubmit={handleUploadPDF}>
              <div className={s.field} style={{ marginBottom: 12 }}>
                <label className={s.label}>PDF File *</label>
                <input
                  className={s.input}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0])}
                  disabled={pdfUploading}
                />
              </div>
              <div className={s.field} style={{ marginBottom: 12 }}>
                <label className={s.label}>Patient ID *</label>
                <input className={s.input} type="text" value={pdfPatientId} onChange={(e) => setPdfPatientId(e.target.value)} placeholder="e.g., patient-123" disabled={pdfUploading} />
              </div>
              <div className={s.field} style={{ marginBottom: 20 }}>
                <label className={s.label}>Test Date</label>
                <input className={s.input} type="date" value={pdfTestDate} onChange={(e) => setPdfTestDate(e.target.value)} disabled={pdfUploading} />
              </div>
              <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={pdfUploading} style={{ width: '100%', justifyContent: 'center' }}>
                <FileText size={15} />
                {pdfUploading ? 'Processing...' : 'Upload PDF'}
              </button>
            </form>

            <div className={s.card} style={{ marginTop: 20, background: '#f8fafc' }}>
              <div className={s.cardBody}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-2)', marginBottom: 8 }}>SUPPORTED FORMATS</div>
                <ul style={{ fontSize: 12, color: 'var(--color-text-2)', paddingLeft: 16, margin: 0, lineHeight: 1.8 }}>
                  <li>FHIR DiagnosticReport (JSON)</li>
                  <li>HL7 v2 ORU messages</li>
                  <li>Custom JSON with test_name, result_value, unit</li>
                  <li>PDF lab reports (AI-parsed)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UploadTab;
