/**
 * PatientsTab - OpenELIS-inspired Add/Modify Patient
 */

import React, { useState } from 'react';
import { Search, Plus, User } from 'lucide-react';

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

const sectionHeader = { background: '#f8fafc', padding: '8px 16px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: 13 };

export function PatientsTab({ labId, styles: s }) {
  const [search, setSearch] = useState({ firstName: '', middleName: '', lastName: '', patientId: '' });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState('new'); // 'new' | 'edit'
  const [form, setForm] = useState({ first_name: '', last_name: '', date_of_birth: '', gender: '', patient_id: '', phone: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');

  const showMsg = (m, t = 'success') => { setMsg(m); setMsgType(t); setTimeout(() => setMsg(''), 5000); };

  const handleRunSearch = async () => {
    const q = search.patientId || `${search.firstName} ${search.lastName}`.trim();
    if (!q) { setSearchError('Enter search criteria'); return; }
    try {
      setSearchLoading(true);
      setSearchError('');
      setSearched(true);
      const data = await apiFetch(`/api/v1/patients/search?q=${encodeURIComponent(q)}`);
      const results = data.patients || (data.patient ? [data.patient] : (Array.isArray(data) ? data : []));
      setSearchResults(results);
      if (results.length === 0) setSearchError('No patients found');
    } catch (err) {
      setSearchError(err.message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleNewPatient = () => {
    setForm({ first_name: '', last_name: '', date_of_birth: '', gender: '', patient_id: '', phone: '', address: '' });
    setFormMode('new');
    setShowForm(true);
  };

  const handleEditPatient = (patient) => {
    setForm({
      first_name: patient.first_name || patient.name?.split(' ')[0] || '',
      last_name: patient.last_name || patient.name?.split(' ').slice(1).join(' ') || '',
      date_of_birth: patient.date_of_birth || patient.dob || '',
      gender: patient.gender || '',
      patient_id: patient.patient_id || patient.id || '',
      phone: patient.phone || patient.phone_number || '',
      address: patient.address || '',
    });
    setFormMode('edit');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name) { showMsg('First Name and Last Name are required', 'error'); return; }
    try {
      setSaving(true);
      if (formMode === 'new') {
        // Cannot directly register patients from lab portal; show appropriate message
        showMsg('To add new patients, please contact the system admin or use the main registration portal.', 'error');
      } else {
        // Update patient info
        await apiFetch(`/api/v1/patients/${form.patient_id}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
        showMsg('Patient updated successfully');
        setShowForm(false);
        handleRunSearch();
      }
    } catch (err) {
      showMsg(`Failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Patient</div>
          <div className={s.pageSubtitle}>Search and manage patient records</div>
        </div>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleNewPatient}>
          <Plus size={14} /> New Patient
        </button>
      </div>

      {msg && <div className={`${s.alert} ${msgType === 'error' ? s.alertError : s.alertSuccess}`}>{msg}</div>}

      {/* Search section */}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div style={sectionHeader}>Search</div>
        <div className={s.cardBody}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
            <div className={s.field}>
              <label className={s.label}>First Name</label>
              <input className={s.input} value={search.firstName} onChange={(e) => setSearch((p) => ({ ...p, firstName: e.target.value }))} placeholder="First name" />
            </div>
            <div className={s.field}>
              <label className={s.label}>Middle Name</label>
              <input className={s.input} value={search.middleName} onChange={(e) => setSearch((p) => ({ ...p, middleName: e.target.value }))} placeholder="Middle name" />
            </div>
            <div className={s.field}>
              <label className={s.label}>Last Name</label>
              <input className={s.input} value={search.lastName} onChange={(e) => setSearch((p) => ({ ...p, lastName: e.target.value }))} placeholder="Last name" />
            </div>
            <div className={s.field}>
              <label className={s.label}>Patient ID</label>
              <input
                className={s.input}
                value={search.patientId}
                onChange={(e) => setSearch((p) => ({ ...p, patientId: e.target.value }))}
                placeholder="patient-123"
                onKeyDown={(e) => e.key === 'Enter' && handleRunSearch()}
              />
            </div>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleRunSearch} disabled={searchLoading}>
              <Search size={14} /> {searchLoading ? 'Searching...' : 'Run Search'}
            </button>
          </div>
          {searchError && <div className={`${s.alert} ${s.alertError}`} style={{ marginTop: 12 }}>{searchError}</div>}
        </div>
      </div>

      {/* Results table */}
      {searched && !searchError && (
        <div className={s.card} style={{ marginBottom: 16 }}>
          <div className={s.cardHeader}>
            <div className={s.cardTitle}>Search Results</div>
            <span className={`${s.badge} ${s.badgeBlue}`}>{searchResults.length} found</span>
          </div>
          {searchResults.length === 0 ? (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}><User size={48} /></div>
              <div className={s.emptyText}>No patients found</div>
            </div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>{['Patient ID', 'Name', 'Date of Birth', 'Gender', 'Phone', 'Address', 'Action'].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {searchResults.map((patient) => (
                    <tr key={patient.id || patient.patient_id}>
                      <td style={{ fontWeight: 600 }}>{patient.patient_id || patient.id}</td>
                      <td>{patient.name || `${patient.first_name || ''} ${patient.last_name || ''}`.trim()}</td>
                      <td>{patient.date_of_birth || patient.dob || '—'}</td>
                      <td>{patient.gender || '—'}</td>
                      <td>{patient.phone || patient.phone_number || '—'}</td>
                      <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{patient.address || '—'}</td>
                      <td>
                        <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => handleEditPatient(patient)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Patient form */}
      {showForm && (
        <div className={s.card}>
          <div style={sectionHeader}>{formMode === 'new' ? 'New Patient' : 'Edit Patient'}</div>
          <div className={s.cardBody}>
            {formMode === 'new' && (
              <div className={`${s.alert} ${s.alertInfo}`} style={{ marginBottom: 12 }}>
                To register new patients, contact admin or use the main EMR registration portal. You can search existing patients above.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className={s.field}>
                <label className={s.label}>First Name *</label>
                <input className={s.input} value={form.first_name} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} placeholder="First name" />
              </div>
              <div className={s.field}>
                <label className={s.label}>Last Name *</label>
                <input className={s.input} value={form.last_name} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} placeholder="Last name" />
              </div>
              <div className={s.field}>
                <label className={s.label}>Date of Birth (DD/MM/YYYY)</label>
                <input className={s.input} type="date" value={form.date_of_birth} onChange={(e) => setForm((p) => ({ ...p, date_of_birth: e.target.value }))} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Gender</label>
                <select className={s.select} value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}>
                  <option value="">— Select —</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>Patient ID</label>
                <input className={s.input} value={form.patient_id} onChange={(e) => setForm((p) => ({ ...p, patient_id: e.target.value }))} placeholder="patient-123" readOnly={formMode === 'edit'} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Phone</label>
                <input className={s.input} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+91 ..." />
              </div>
              <div className={s.field} style={{ gridColumn: 'span 2' }}>
                <label className={s.label}>Address</label>
                <input className={s.input} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Address" />
              </div>
            </div>
            <div className={s.formActions}>
              <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => setShowForm(false)}>Cancel</button>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleSave} disabled={saving || formMode === 'new'}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!searched && !showForm && (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}><User size={48} /></div>
          <div className={s.emptyText}>Use the search form above to find patients, or click New Patient</div>
        </div>
      )}
    </div>
  );
}

export default PatientsTab;
