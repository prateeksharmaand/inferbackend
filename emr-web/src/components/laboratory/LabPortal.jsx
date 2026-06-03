/**
 * Lab Portal - Upload & Management UI
 */

import React, { useState, useEffect } from 'react';

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

export function LabPortal() {
  const [activeTab, setActiveTab] = useState('upload');
  const [lab, setLab] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Upload state
  const [uploadFormat, setUploadFormat] = useState('JSON');
  const [uploadData, setUploadData] = useState('');
  const [patientId, setPatientId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  // PDF upload state
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfPatientId, setPdfPatientId] = useState('');
  const [pdfTestDate, setPdfTestDate] = useState('');

  // Stats state
  const [stats, setStats] = useState(null);

  const apiKey = localStorage.getItem('lab_api_key');

  // Load lab info on mount
  useEffect(() => {
    fetchLabInfo();
    fetchStats();
  }, []);

  const fetchLabInfo = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/v1/labs/status');
      setLab(data.laboratory);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const labId = localStorage.getItem('lab_id');
      const data = await apiFetch(`/api/v1/admin/laboratories/${labId}/dashboard`);
      setStats(data.statistics);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleUploadJSON = async (e) => {
    e.preventDefault();

    if (!uploadData || !patientId) {
      setMessage('Please fill in all required fields');
      return;
    }

    try {
      setIsUploading(true);

      let jsonData;
      try {
        jsonData = JSON.parse(uploadData);
      } catch {
        setMessage('Invalid JSON format');
        return;
      }

      const result = await apiFetch('/api/v1/labs/upload-result', {
        method: 'POST',
        body: JSON.stringify({ format: uploadFormat, data: jsonData, patient_id: patientId }),
      });

      setUploadResult(result);
      setMessage(`✅ ${result.message}`);
      setUploadData('');
      setPatientId('');
    } catch (error) {
      setMessage(`❌ Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadPDF = async (e) => {
    e.preventDefault();

    if (!pdfFile || !pdfPatientId) {
      setMessage('Please select file and patient ID');
      return;
    }

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
      setMessage(`✅ PDF processed: ${result.message}`);
      setPdfFile(null);
      setPdfPatientId('');
      setPdfTestDate('');
    } catch (error) {
      setMessage(`❌ PDF upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="lab-portal">
      <div className="lab-header">
        <h1>🏥 Lab Portal</h1>
        {lab && (
          <div className="lab-info">
            <p>
              <strong>{lab.facility_name}</strong> ({lab.status})
            </p>
            <p className="lab-type">{lab.lab_type} Laboratory</p>
          </div>
        )}
      </div>

      {message && (
        <div className={`alert ${message.includes('✅') ? 'alert-success' : 'alert-danger'}`}>
          {message}
        </div>
      )}

      <div className="tabs">
        <button
          className={activeTab === 'upload' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('upload')}
        >
          Upload Results
        </button>
        <button
          className={activeTab === 'stats' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('stats')}
        >
          Statistics
        </button>
      </div>

      {activeTab === 'upload' && (
        <div className="upload-section">
          <div className="upload-card">
            <h2>Upload JSON/HL7/FHIR Result</h2>
            <form onSubmit={handleUploadJSON}>
              <div className="form-group">
                <label>Format</label>
                <select
                  value={uploadFormat}
                  onChange={(e) => setUploadFormat(e.target.value)}
                  disabled={isUploading}
                >
                  <option>JSON</option>
                  <option>HL7</option>
                  <option>FHIR</option>
                </select>
              </div>

              <div className="form-group">
                <label>Patient ID *</label>
                <input
                  type="text"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  placeholder="e.g., patient-123"
                  disabled={isUploading}
                />
              </div>

              <div className="form-group">
                <label>
                  Test Data ({uploadFormat}) *
                </label>
                <textarea
                  value={uploadData}
                  onChange={(e) => setUploadData(e.target.value)}
                  placeholder={
                    uploadFormat === 'JSON'
                      ? '{\n  "resourceType": "DiagnosticReport",\n  ...\n}'
                      : 'Paste HL7/FHIR message here'
                  }
                  rows={10}
                  disabled={isUploading}
                  className="code-input"
                />
              </div>

              <button type="submit" disabled={isUploading} className="btn btn-primary">
                {isUploading ? '⏳ Uploading...' : '📤 Upload Result'}
              </button>
            </form>

            {uploadResult && (
              <div className="upload-result">
                <h3>Upload Success ✅</h3>
                <p>Results Uploaded: {uploadResult.results_uploaded}</p>
                <p>Critical Values: {uploadResult.critical_count}</p>
                <ul>
                  {uploadResult.results.map((r) => (
                    <li key={r.id}>
                      {r.test_name} {r.is_critical_value ? '🚨' : '✓'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="upload-card">
            <h2>Upload PDF Lab Report</h2>
            <form onSubmit={handleUploadPDF}>
              <div className="form-group">
                <label>PDF File *</label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0])}
                  disabled={isUploading}
                />
              </div>

              <div className="form-group">
                <label>Patient ID *</label>
                <input
                  type="text"
                  value={pdfPatientId}
                  onChange={(e) => setPdfPatientId(e.target.value)}
                  placeholder="e.g., patient-123"
                  disabled={isUploading}
                />
              </div>

              <div className="form-group">
                <label>Test Date</label>
                <input
                  type="date"
                  value={pdfTestDate}
                  onChange={(e) => setPdfTestDate(e.target.value)}
                  disabled={isUploading}
                />
              </div>

              <button type="submit" disabled={isUploading} className="btn btn-primary">
                {isUploading ? '⏳ Processing...' : '📄 Upload PDF'}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'stats' && stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Results</h3>
            <p className="stat-value">{stats.total_results}</p>
          </div>
          <div className="stat-card">
            <h3>Finalized</h3>
            <p className="stat-value">{stats.finalized}</p>
          </div>
          <div className="stat-card">
            <h3>Pending</h3>
            <p className="stat-value">{stats.pending}</p>
          </div>
          <div className="stat-card critical">
            <h3>Critical Values</h3>
            <p className="stat-value">{stats.critical_values}</p>
          </div>
          <div className="stat-card">
            <h3>Unique Patients</h3>
            <p className="stat-value">{stats.unique_patients}</p>
          </div>
          <div className="stat-card">
            <h3>Avg Turnaround</h3>
            <p className="stat-value">{Math.round(stats.avg_turnaround_seconds)}s</p>
          </div>
        </div>
      )}

      <style jsx>{`
        .lab-portal {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        .lab-header {
          border-bottom: 2px solid #007bff;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }

        .lab-header h1 {
          margin: 0;
          color: #333;
        }

        .lab-info {
          margin-top: 10px;
          font-size: 14px;
          color: #666;
        }

        .lab-type {
          color: #007bff;
          font-weight: bold;
        }

        .tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
          border-bottom: 1px solid #ddd;
        }

        .tab {
          padding: 10px 20px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          color: #666;
          border-bottom: 3px solid transparent;
          transition: all 0.3s;
        }

        .tab.active {
          color: #007bff;
          border-bottom-color: #007bff;
        }

        .tab:hover {
          color: #0056b3;
        }

        .alert {
          padding: 15px;
          border-radius: 4px;
          margin-bottom: 20px;
        }

        .alert-success {
          background-color: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .alert-danger {
          background-color: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .upload-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .upload-card {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          background: #f9f9f9;
        }

        .upload-card h2 {
          margin-top: 0;
          color: #333;
          font-size: 18px;
        }

        .form-group {
          margin-bottom: 15px;
        }

        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
          color: #333;
        }

        .form-group input,
        .form-group textarea,
        .form-group select {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          font-size: 14px;
        }

        .form-group textarea {
          resize: vertical;
        }

        .code-input {
          font-size: 12px;
          background: #f5f5f5;
        }

        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          transition: all 0.3s;
          width: 100%;
        }

        .btn-primary {
          background-color: #007bff;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background-color: #0056b3;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .upload-result {
          margin-top: 20px;
          padding: 15px;
          background: #e8f5e9;
          border: 1px solid #4caf50;
          border-radius: 4px;
        }

        .upload-result h3 {
          margin-top: 0;
          color: #2e7d32;
        }

        .upload-result ul {
          margin: 10px 0;
          padding-left: 20px;
        }

        .upload-result li {
          margin: 5px 0;
          color: #333;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
        }

        .stat-card {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .stat-card.critical {
          background: #fff3cd;
          border-color: #ffc107;
        }

        .stat-card h3 {
          margin: 0 0 10px 0;
          color: #666;
          font-size: 14px;
        }

        .stat-value {
          margin: 0;
          font-size: 32px;
          font-weight: bold;
          color: #007bff;
        }

        .stat-card.critical .stat-value {
          color: #ff6b6b;
        }

        @media (max-width: 768px) {
          .upload-section {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default LabPortal;
