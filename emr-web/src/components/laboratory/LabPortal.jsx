/**
 * Lab Portal - Redesigned with EMR Design System
 */

import React, { useState, useEffect } from 'react';
import {
  Upload, ClipboardList, FlaskConical, FileText, GitBranch, BarChart2,
  BookOpen, Bell, ShieldCheck, CheckSquare, ScrollText, TrendingUp,
  LogOut, Upload as UploadIcon, Check, Copy,
} from 'lucide-react';

import styles from './LabPortal.module.css';
import { OrdersTab } from './OrdersTab';
import { SamplesTab } from './SamplesTab';
import { ReportsTab } from './ReportsTab';
import { AnalyticsTab } from './AnalyticsTab';
import { CatalogTab } from './CatalogTab';
import { WorkflowTab } from './WorkflowTab';
import { NotificationsTab } from './NotificationsTab';
import { QualityControlTab } from './QualityControlTab';
import { ApprovalsTab } from './ApprovalsTab';
import { AuditTrailTab } from './AuditTrailTab';
import { TrendsTab } from './TrendsTab';

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

function UploadTab({ labId, styles: s }) {
  const [uploadFormat, setUploadFormat] = useState('JSON');
  const [uploadData, setUploadData] = useState('');
  const [patientId, setPatientId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const [pdfFile, setPdfFile] = useState(null);
  const [pdfPatientId, setPdfPatientId] = useState('');
  const [pdfTestDate, setPdfTestDate] = useState('');
  const [copied, setCopied] = useState(false);

  const showMsg = (msg, type = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  };

  const handleUploadJSON = async (e) => {
    e.preventDefault();
    if (!uploadData || !patientId) { showMsg('Please fill in all required fields', 'error'); return; }
    try {
      setIsUploading(true);
      let jsonData;
      try { jsonData = JSON.parse(uploadData); } catch { showMsg('Invalid JSON format', 'error'); return; }
      const result = await apiFetch('/api/v1/labs/upload-result', {
        method: 'POST',
        body: JSON.stringify({ format: uploadFormat, data: jsonData, patient_id: patientId }),
      });
      setUploadResult(result);
      showMsg(result.message || 'Upload successful');
      setUploadData('');
      setPatientId('');
    } catch (error) {
      showMsg(`Upload failed: ${error.message}`, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadPDF = async (e) => {
    e.preventDefault();
    if (!pdfFile || !pdfPatientId) { showMsg('Please select file and enter patient ID', 'error'); return; }
    try {
      setIsUploading(true);
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
      setUploadResult(result);
      showMsg(result.message || 'PDF processed successfully');
      setPdfFile(null);
      setPdfPatientId('');
      setPdfTestDate('');
    } catch (error) {
      showMsg(`PDF upload failed: ${error.message}`, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Upload Results</div>
          <div className={s.pageSubtitle}>Upload lab results as JSON/HL7/FHIR or PDF</div>
        </div>
      </div>

      {message && (
        <div className={`${s.alert} ${messageType === 'error' ? s.alertError : s.alertSuccess}`}>
          {message}
        </div>
      )}

      <div className={s.uploadGrid}>
        {/* JSON/HL7/FHIR Upload */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div className={s.cardTitle}>Upload JSON / HL7 / FHIR Result</div>
          </div>
          <div className={s.cardBody}>
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
            <form onSubmit={handleUploadPDF}>
              <div className={s.field} style={{ marginBottom: 12 }}>
                <label className={s.label}>PDF File *</label>
                <input
                  className={s.input}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0])}
                  disabled={isUploading}
                />
              </div>
              <div className={s.field} style={{ marginBottom: 12 }}>
                <label className={s.label}>Patient ID *</label>
                <input className={s.input} type="text" value={pdfPatientId} onChange={(e) => setPdfPatientId(e.target.value)} placeholder="e.g., patient-123" disabled={isUploading} />
              </div>
              <div className={s.field} style={{ marginBottom: 20 }}>
                <label className={s.label}>Test Date</label>
                <input className={s.input} type="date" value={pdfTestDate} onChange={(e) => setPdfTestDate(e.target.value)} disabled={isUploading} />
              </div>
              <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={isUploading} style={{ width: '100%', justifyContent: 'center' }}>
                <FileText size={15} />
                {isUploading ? 'Processing...' : 'Upload PDF'}
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

export function LabPortal() {
  const labId = localStorage.getItem('lab_id');
  const userEmail = localStorage.getItem('user_email') || 'Lab Staff';
  const labRole = localStorage.getItem('lab_role') || 'LAB_STAFF';
  const userInitial = (userEmail[0] || 'L').toUpperCase();

  const [activeTab, setActiveTab] = useState('upload');
  const [facilityName, setFacilityName] = useState('Loading...');

  useEffect(() => {
    apiFetch('/api/v1/labs/status')
      .then((d) => setFacilityName(d.laboratory?.facility_name || 'Infer Lab'))
      .catch(() => setFacilityName('Infer Lab'));
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/lab/login';
  };

  const navItems = [
    { id: 'upload',        label: 'Upload Results',   icon: <Upload size={16} /> },
    { id: 'orders',        label: 'Orders',           icon: <ClipboardList size={16} /> },
    { id: 'samples',       label: 'Samples',          icon: <FlaskConical size={16} /> },
    { id: 'reports',       label: 'Reports',          icon: <FileText size={16} /> },
    { id: 'workflow',      label: 'Workflow',         icon: <GitBranch size={16} /> },
    { id: 'analytics',     label: 'Analytics',        icon: <BarChart2 size={16} /> },
    { id: 'catalog',       label: 'Test Catalog',     icon: <BookOpen size={16} /> },
    { id: 'notifications', label: 'Notifications',    icon: <Bell size={16} /> },
    { id: 'qc',            label: 'Quality Control',  icon: <ShieldCheck size={16} /> },
    { id: 'approvals',     label: 'Approvals',        icon: <CheckSquare size={16} /> },
    { id: 'audit',         label: 'Audit Trail',      icon: <ScrollText size={16} /> },
    { id: 'trends',        label: 'Trend Analysis',   icon: <TrendingUp size={16} /> },
  ];

  const currentNavItem = navItems.find((n) => n.id === activeTab) || navItems[0];

  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <div className={styles.sidebarLogoIcon}><FlaskConical size={20} /></div>
          <div>
            <div className={styles.sidebarLogoName}>Infer Lab</div>
            <div className={styles.sidebarLogoSub}>{facilityName}</div>
          </div>
        </div>
        <nav className={styles.sidebarNav}>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`${styles.navItem} ${activeTab === item.id ? styles.active : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            <LogOut size={15} /> Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className={styles.main}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <div>
            <div className={styles.topbarTitle}>{currentNavItem.label}</div>
            <div className={styles.topbarFacility}>{facilityName}</div>
          </div>
          <div className={styles.topbarRight}>
            <div className={styles.userChip}>
              <div className={styles.userAvatar}>{userInitial}</div>
              <span>{userEmail}</span>
              <span className={styles.roleBadge}>{labRole}</span>
            </div>
          </div>
        </header>

        {/* Tab content */}
        <main className={styles.content}>
          {activeTab === 'upload'        && <UploadTab labId={labId} styles={styles} />}
          {activeTab === 'orders'        && <OrdersTab labId={labId} styles={styles} />}
          {activeTab === 'samples'       && <SamplesTab labId={labId} styles={styles} />}
          {activeTab === 'reports'       && <ReportsTab labId={labId} styles={styles} />}
          {activeTab === 'workflow'      && <WorkflowTab labId={labId} styles={styles} />}
          {activeTab === 'analytics'     && <AnalyticsTab labId={labId} styles={styles} />}
          {activeTab === 'catalog'       && <CatalogTab labId={labId} styles={styles} />}
          {activeTab === 'notifications' && <NotificationsTab labId={labId} styles={styles} />}
          {activeTab === 'qc'            && <QualityControlTab labId={labId} styles={styles} />}
          {activeTab === 'approvals'     && <ApprovalsTab labId={labId} styles={styles} />}
          {activeTab === 'audit'         && <AuditTrailTab labId={labId} styles={styles} />}
          {activeTab === 'trends'        && <TrendsTab labId={labId} styles={styles} />}
        </main>
      </div>
    </div>
  );
}

export default LabPortal;
