/**
 * Admin Dashboard - Laboratory Management
 * Create labs, manage users, configure settings
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('labs');
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Create Lab Form
  const [newLab, setNewLab] = useState({
    facility_name: '',
    lab_type: 'DIAGNOSTIC',
    email: '',
    phone: '',
    address_line1: '',
    city: '',
    is_nabl_accredited: false,
    iso_15189_compliant: false,
    hl7_enabled: true,
    fhir_enabled: true
  });

  const token = localStorage.getItem('auth_token');

  useEffect(() => {
    fetchLabs();
  }, []);

  const fetchLabs = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/v1/admin/laboratories', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLabs(response.data.laboratories || []);
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLab = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post('/api/v1/admin/laboratories', newLab, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setMessage('✅ Laboratory created successfully!');
      setMessage(`API Key: ${response.data.api_key}\nAPI Secret: ${response.data.api_secret}\n⚠️ Save these credentials!`);

      setNewLab({
        facility_name: '',
        lab_type: 'DIAGNOSTIC',
        email: '',
        phone: '',
        address_line1: '',
        city: '',
        is_nabl_accredited: false,
        iso_15189_compliant: false,
        hl7_enabled: true,
        fhir_enabled: true
      });

      fetchLabs();
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setMessage('✅ Copied to clipboard!');
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>🔧 Admin Dashboard</h1>
        <p>Manage laboratories, users, and system configuration</p>
      </div>

      {message && (
        <div className={`alert ${message.includes('Error') ? 'alert-error' : 'alert-success'}`}>
          {message.split('\n').map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'labs' ? 'active' : ''}`}
          onClick={() => setActiveTab('labs')}
        >
          📊 Laboratories
        </button>
        <button
          className={`tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          👥 Users
        </button>
        <button
          className={`tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          ⚙️ Configuration
        </button>
      </div>

      {/* Laboratories Tab */}
      {activeTab === 'labs' && (
        <div className="tab-content">
          <div className="section">
            <h2>Create New Laboratory</h2>
            <form onSubmit={handleCreateLab} className="create-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Facility Name *</label>
                  <input
                    type="text"
                    value={newLab.facility_name}
                    onChange={(e) =>
                      setNewLab({ ...newLab, facility_name: e.target.value })
                    }
                    placeholder="e.g., Apollo Diagnostics"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Lab Type *</label>
                  <select
                    value={newLab.lab_type}
                    onChange={(e) =>
                      setNewLab({ ...newLab, lab_type: e.target.value })
                    }
                  >
                    <option>CLINICAL</option>
                    <option>DIAGNOSTIC</option>
                    <option>REFERENCE</option>
                    <option>NABL</option>
                    <option>POCT</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={newLab.email}
                    onChange={(e) =>
                      setNewLab({ ...newLab, email: e.target.value })
                    }
                    placeholder="contact@lab.com"
                  />
                </div>

                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={newLab.phone}
                    onChange={(e) =>
                      setNewLab({ ...newLab, phone: e.target.value })
                    }
                    placeholder="+91 9999999999"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Address</label>
                  <input
                    type="text"
                    value={newLab.address_line1}
                    onChange={(e) =>
                      setNewLab({ ...newLab, address_line1: e.target.value })
                    }
                    placeholder="Street address"
                  />
                </div>

                <div className="form-group">
                  <label>City</label>
                  <input
                    type="text"
                    value={newLab.city}
                    onChange={(e) =>
                      setNewLab({ ...newLab, city: e.target.value })
                    }
                    placeholder="Bangalore"
                  />
                </div>
              </div>

              <div className="form-row">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={newLab.is_nabl_accredited}
                    onChange={(e) =>
                      setNewLab({
                        ...newLab,
                        is_nabl_accredited: e.target.checked
                      })
                    }
                  />
                  NABL Accredited
                </label>

                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={newLab.iso_15189_compliant}
                    onChange={(e) =>
                      setNewLab({
                        ...newLab,
                        iso_15189_compliant: e.target.checked
                      })
                    }
                  />
                  ISO 15189 Compliant
                </label>

                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={newLab.hl7_enabled}
                    onChange={(e) =>
                      setNewLab({ ...newLab, hl7_enabled: e.target.checked })
                    }
                  />
                  HL7 Enabled
                </label>

                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={newLab.fhir_enabled}
                    onChange={(e) =>
                      setNewLab({ ...newLab, fhir_enabled: e.target.checked })
                    }
                  />
                  FHIR Enabled
                </label>
              </div>

              <button type="submit" className="btn btn-primary">
                ➕ Create Laboratory
              </button>
            </form>
          </div>

          <div className="section">
            <h2>Existing Laboratories</h2>
            {loading ? (
              <p>Loading labs...</p>
            ) : labs.length === 0 ? (
              <p>No laboratories yet. Create one above!</p>
            ) : (
              <div className="labs-grid">
                {labs.map((lab) => (
                  <div key={lab.id} className="lab-card">
                    <h3>{lab.facility_name}</h3>
                    <div className="lab-badge">{lab.lab_type}</div>
                    {lab.is_nabl_accredited && (
                      <span className="badge nabl">NABL</span>
                    )}
                    {lab.iso_15189_compliant && (
                      <span className="badge iso">ISO 15189</span>
                    )}
                    <p className="lab-email">{lab.email}</p>
                    <p className="lab-city">{lab.city}</p>
                    <div className="lab-status">
                      Status: <strong>{lab.status}</strong>
                    </div>
                    <button
                      className="btn-small"
                      onClick={() => copyToClipboard(lab.id)}
                    >
                      📋 Copy ID
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="tab-content">
          <div className="section">
            <h2>Create Lab User</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              Create accounts for lab technicians, admins, and directors
            </p>
            <UserManagementForm />
          </div>
        </div>
      )}

      {/* Configuration Tab */}
      {activeTab === 'config' && (
        <div className="tab-content">
          <div className="section">
            <h2>System Configuration</h2>
            <LabConfiguration />
          </div>
        </div>
      )}

      <style jsx>{`
        .admin-dashboard {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
        }

        .admin-header {
          border-bottom: 2px solid #007bff;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }

        .admin-header h1 {
          margin: 0;
          color: #333;
          font-size: 28px;
        }

        .admin-header p {
          margin: 5px 0 0 0;
          color: #666;
        }

        .alert {
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 20px;
          white-space: pre-wrap;
        }

        .alert-success {
          background-color: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .alert-error {
          background-color: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
          border-bottom: 2px solid #eee;
        }

        .tab {
          padding: 12px 20px;
          background: none;
          border: none;
          font-size: 16px;
          cursor: pointer;
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

        .tab-content {
          background: white;
          padding: 20px;
          border-radius: 8px;
        }

        .section {
          margin-bottom: 40px;
        }

        .section h2 {
          color: #333;
          margin-top: 0;
          padding-bottom: 10px;
          border-bottom: 1px solid #eee;
        }

        .create-form {
          margin-top: 20px;
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-bottom: 15px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
        }

        .form-group label {
          margin-bottom: 5px;
          font-weight: bold;
          color: #333;
        }

        .form-group input,
        .form-group select {
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25);
        }

        .checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
          font-weight: normal;
          cursor: pointer;
        }

        .checkbox input {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.3s;
          width: 100%;
        }

        .btn-primary {
          background-color: #007bff;
          color: white;
        }

        .btn-primary:hover {
          background-color: #0056b3;
        }

        .btn-small {
          padding: 6px 12px;
          font-size: 12px;
          background-color: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 10px;
        }

        .btn-small:hover {
          background-color: #0056b3;
        }

        .labs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
          margin-top: 20px;
        }

        .lab-card {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          background: #f9f9f9;
        }

        .lab-card h3 {
          margin-top: 0;
          color: #333;
        }

        .lab-badge {
          display: inline-block;
          background-color: #007bff;
          color: white;
          padding: 4px 8px;
          border-radius: 3px;
          font-size: 12px;
          font-weight: bold;
          margin-right: 8px;
        }

        .badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
          margin-right: 8px;
        }

        .badge.nabl {
          background-color: #ffc107;
          color: #333;
        }

        .badge.iso {
          background-color: #28a745;
          color: white;
        }

        .lab-email {
          margin: 8px 0;
          color: #666;
          font-size: 14px;
        }

        .lab-city {
          margin: 5px 0;
          color: #999;
          font-size: 13px;
        }

        .lab-status {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid #ddd;
          font-size: 14px;
          color: #666;
        }

        @media (max-width: 768px) {
          .form-row {
            grid-template-columns: 1fr;
          }

          .labs-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * User Management Component
 */
function UserManagementForm() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    lab_id: '',
    lab_role: 'LAB_TECHNICIAN'
  });

  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const token = localStorage.getItem('auth_token');

  useEffect(() => {
    fetchLabs();
  }, []);

  const fetchLabs = async () => {
    try {
      const response = await axios.get('/api/v1/admin/laboratories', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLabs(response.data.laboratories || []);
    } catch (error) {
      console.error('Error fetching labs:', error);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();

    if (!formData.email || !formData.password || !formData.lab_id) {
      setMessage('Please fill all required fields');
      return;
    }

    try {
      setLoading(true);

      // Note: This endpoint needs to be created in the backend
      const response = await axios.post('/api/v1/admin/users', formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setMessage('✅ User created successfully!');
      setFormData({
        email: '',
        password: '',
        name: '',
        lab_id: '',
        lab_role: 'LAB_TECHNICIAN'
      });
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {message && (
        <div
          className="alert"
          style={{
            background: message.includes('Error') ? '#f8d7da' : '#d4edda',
            color: message.includes('Error') ? '#721c24' : '#155724',
            padding: '10px',
            borderRadius: '4px',
            marginBottom: '15px'
          }}
        >
          {message}
        </div>
      )}

      <form onSubmit={handleCreateUser} style={{ maxWidth: '500px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Email *
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="user@lab.com"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
            required
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Password *
          </label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            placeholder="••••••••"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
            required
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Lab Technician Name"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Laboratory *
          </label>
          <select
            value={formData.lab_id}
            onChange={(e) => setFormData({ ...formData, lab_id: e.target.value })}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
            required
          >
            <option value="">Select laboratory</option>
            {labs.map((lab) => (
              <option key={lab.id} value={lab.id}>
                {lab.facility_name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Role</label>
          <select
            value={formData.lab_role}
            onChange={(e) =>
              setFormData({ ...formData, lab_role: e.target.value })
            }
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          >
            <option>LAB_TECHNICIAN</option>
            <option>LAB_ADMIN</option>
            <option>LAB_DIRECTOR</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          {loading ? '⏳ Creating...' : '➕ Create User'}
        </button>
      </form>
    </div>
  );
}

/**
 * Lab Configuration Component
 */
function LabConfiguration() {
  const [labs, setLabs] = useState([]);
  const [selectedLabId, setSelectedLabId] = useState('');
  const [thresholds, setThresholds] = useState({});
  const [message, setMessage] = useState('');
  const token = localStorage.getItem('auth_token');

  useEffect(() => {
    fetchLabs();
  }, []);

  const fetchLabs = async () => {
    try {
      const response = await axios.get('/api/v1/admin/laboratories', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLabs(response.data.laboratories || []);
    } catch (error) {
      console.error('Error fetching labs:', error);
    }
  };

  const handleSaveThresholds = async () => {
    if (!selectedLabId) {
      setMessage('Please select a laboratory');
      return;
    }

    try {
      await axios.post(
        `/api/v1/admin/laboratories/${selectedLabId}/critical-values`,
        { thresholds },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setMessage('✅ Critical value thresholds saved successfully!');
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
    }
  };

  return (
    <div>
      {message && (
        <div
          style={{
            background: message.includes('Error') ? '#f8d7da' : '#d4edda',
            color: message.includes('Error') ? '#721c24' : '#155724',
            padding: '10px',
            borderRadius: '4px',
            marginBottom: '15px'
          }}
        >
          {message}
        </div>
      )}

      <div style={{ marginBottom: '20px', maxWidth: '500px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Select Laboratory
        </label>
        <select
          value={selectedLabId}
          onChange={(e) => setSelectedLabId(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            marginBottom: '20px'
          }}
        >
          <option value="">Choose a laboratory</option>
          {labs.map((lab) => (
            <option key={lab.id} value={lab.id}>
              {lab.facility_name}
            </option>
          ))}
        </select>

        <h3>Critical Value Thresholds</h3>
        <p style={{ color: '#666', fontSize: '14px' }}>
          Configure critical value thresholds for common lab tests (LOINC codes)
        </p>

        <div style={{ marginTop: '20px' }}>
          <div style={{ marginBottom: '15px', maxWidth: '400px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>
              Glucose (15074-8)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <input
                type="number"
                placeholder="Low threshold"
                value={thresholds['15074-8']?.low || ''}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    '15074-8': {
                      ...(thresholds['15074-8'] || {}),
                      low: parseFloat(e.target.value)
                    }
                  })
                }
                style={{
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
              <input
                type="number"
                placeholder="High threshold"
                value={thresholds['15074-8']?.high || ''}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    '15074-8': {
                      ...(thresholds['15074-8'] || {}),
                      high: parseFloat(e.target.value)
                    }
                  })
                }
                style={{
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '15px', maxWidth: '400px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>
              Creatinine (2345-7)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <input
                type="number"
                placeholder="Low threshold"
                value={thresholds['2345-7']?.low || ''}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    '2345-7': {
                      ...(thresholds['2345-7'] || {}),
                      low: parseFloat(e.target.value)
                    }
                  })
                }
                style={{
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
              <input
                type="number"
                placeholder="High threshold"
                value={thresholds['2345-7']?.high || ''}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    '2345-7': {
                      ...(thresholds['2345-7'] || {}),
                      high: parseFloat(e.target.value)
                    }
                  })
                }
                style={{
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>

          <button
            onClick={handleSaveThresholds}
            style={{
              padding: '10px 20px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            💾 Save Thresholds
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
