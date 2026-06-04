/**
 * PatientsTab - Patient search, view, edit with lab workflow shortcuts
 */

import React, { useState } from 'react';
import { Search, Plus, User, Eye, Edit2, FlaskConical, X, Check } from 'lucide-react';
import { PatientAutocomplete } from './PatientAutocomplete';

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

function computeAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth)) return null;
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years--;
  if (years < 1) {
    const months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth();
    return months < 1 ? '< 1 mo' : `${months} mo`;
  }
  return `${years} yr`;
}

function fmtDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return dob;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const EMPTY_FORM = {
  first_name: '', last_name: '', date_of_birth: '', gender: '',
  phone: '', address: '', blood_group: '', allergies: '', special_notes: '',
};

export function PatientsTab({ labId, styles: s, onAddSample }) {
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchResults, setSearchResults]     = useState([]);
  const [searched, setSearched]               = useState(false);

  const [mode, setMode]     = useState(null); // null | 'view' | 'edit' | 'new'
  const [current, setCurrent] = useState(null);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');
  const [msgType, setMsgType] = useState('');

  const showMsg = (m, t = 'success') => { setMsg(m); setMsgType(t); setTimeout(() => setMsg(''), 5000); };
  const field = (k) => ({ value: form[k], onChange: (e) => setForm(p => ({ ...p, [k]: e.target.value })) });

  const openView = (p) => { setCurrent(p); setMode('view'); };

  const openEdit = (p) => {
    setCurrent(p);
    setForm({
      first_name:    p.first_name || p.name?.split(' ')[0] || '',
      last_name:     p.last_name  || p.name?.split(' ').slice(1).join(' ') || '',
      date_of_birth: p.date_of_birth || p.dob || '',
      gender:        p.gender || '',
      phone:         p.phone  || p.mobile || '',
      address:       p.address || '',
      blood_group:   p.blood_group || '',
      allergies:     p.allergies || '',
      special_notes: p.special_notes || '',
    });
    setMode('edit');
  };

  const openNew = () => {
    setCurrent(null);
    setForm(EMPTY_FORM);
    setMode('new');
  };

  const handlePatientSelect = (p) => {
    setSelectedPatient(p);
    if (p) { setSearchResults([p]); setSearched(true); openView(p); }
  };

  const handleSave = async (andAddSample = false) => {
    if (!form.first_name) { showMsg('First name is required', 'error'); return; }
    try {
      setSaving(true);
      let saved = current;
      if (mode === 'edit' && current) {
        const id = current.id || current.emr_patient_id;
        if (id) {
          await apiFetch(`/api/v1/patients/${id}`, { method: 'PATCH', body: JSON.stringify(form) });
          saved = { ...current, ...form, name: `${form.first_name} ${form.last_name}`.trim() };
          showMsg('Patient updated successfully');
        }
      } else if (mode === 'new') {
        // Lab portal can't create patients directly — show guidance
        showMsg('New patients must be registered via the EMR registration portal or reception.', 'error');
        setSaving(false);
        return;
      }
      setMode('view');
      setCurrent(saved);
      if (andAddSample && saved && onAddSample) onAddSample(saved);
    } catch (err) {
      showMsg(`Failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const genderLabel = { M: 'Male', F: 'Female', male: 'Male', female: 'Female', Male: 'Male', Female: 'Female' };

  return (
    <div>
      {/* Header */}
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Patient</div>
          <div className={s.pageSubtitle}>Search, view and manage patient records</div>
        </div>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={openNew}>
          <Plus size={14} /> New Patient
        </button>
      </div>

      {msg && <div className={`${s.alert} ${msgType === 'error' ? s.alertError : s.alertSuccess}`} style={{ marginBottom: 12 }}>{msg}</div>}

      {/* Search */}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div style={{ background: '#f8fafc', padding: '8px 16px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: 13 }}>Search</div>
        <div className={s.cardBody}>
          <div className={s.field}>
            <label className={s.label}>Search by Name or UHID</label>
            <PatientAutocomplete value={selectedPatient} onChange={handlePatientSelect} placeholder="Type patient name or UHID…" styles={s} />
          </div>
        </div>
      </div>

      {/* Results table */}
      {searched && searchResults.length > 0 && (
        <div className={s.card} style={{ marginBottom: 16 }}>
          <div className={s.cardHeader}>
            <div className={s.cardTitle}>Search Results</div>
            <span className={`${s.badge} ${s.badgeBlue}`}>{searchResults.length} found</span>
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  {['UHID (Patient ID)', 'Name', 'Age', 'DOB', 'Gender', 'Phone', 'Actions'].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {searchResults.map(p => {
                  const dob   = p.date_of_birth || p.dob;
                  const age   = computeAge(dob);
                  const pid   = p.uhid || p.id || p.emr_patient_id || '—';
                  const phone = p.phone || p.mobile || p.phone_number;
                  return (
                    <tr key={p.id || p.uhid}>
                      <td>
                        {p.uhid
                          ? <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '2px 7px', borderRadius: 6, fontWeight: 700, fontSize: 12 }}>{p.uhid}</span>
                          : <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 600 }}>No UHID</span>}
                      </td>
                      <td style={{ fontWeight: 600 }}>{p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || '—'}</td>
                      <td>{age ?? <span style={{ color: 'var(--color-text-3)' }}>—</span>}</td>
                      <td>{dob ? fmtDob(dob) : <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 600 }}>Missing</span>}</td>
                      <td>{genderLabel[p.gender] || p.gender || <span style={{ color: 'var(--color-text-3)' }}>—</span>}</td>
                      <td>{phone || <span style={{ color: 'var(--color-text-3)' }}>—</span>}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => openView(p)} title="View">
                            <Eye size={13} />
                          </button>
                          <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => openEdit(p)} title="Edit">
                            <Edit2 size={13} />
                          </button>
                          {onAddSample && (
                            <button className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`} onClick={() => onAddSample(p)} title="Add Sample for this patient"
                              style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <FlaskConical size={13} /> Add Sample
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View panel */}
      {mode === 'view' && current && (
        <div className={s.card} style={{ marginBottom: 16 }}>
          <div style={{ background: '#f8fafc', padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Patient Details</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => openEdit(current)}><Edit2 size={13} /> Edit</button>
              {onAddSample && <button className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`} onClick={() => onAddSample(current)}><FlaskConical size={13} /> Add Sample</button>}
              <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => setMode(null)}><X size={13} /></button>
            </div>
          </div>
          <div className={s.cardBody}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {[
                ['UHID', current.uhid ? <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 13 }}>{current.uhid}</span> : '—'],
                ['Name', current.name || `${current.first_name || ''} ${current.last_name || ''}`.trim() || '—'],
                ['Date of Birth', current.dob || current.date_of_birth ? `${fmtDob(current.dob || current.date_of_birth)} (${computeAge(current.dob || current.date_of_birth)})` : <span style={{ color: '#ef4444', fontWeight: 600 }}>Missing</span>],
                ['Gender', genderLabel[current.gender] || current.gender || '—'],
                ['Phone', current.phone || current.mobile || '—'],
                ['Address', current.address || '—'],
                ['Blood Group', current.blood_group || '—'],
                ['ABHA', current.abha_number || '—'],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text)' }}>{val}</div>
                </div>
              ))}
            </div>
            {(current.allergies || current.special_notes) && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--color-border)', paddingTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {current.allergies && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>⚠ Allergies</div>
                    <div style={{ fontSize: 13, color: '#92400e', background: '#fffbeb', padding: '6px 10px', borderRadius: 6 }}>{current.allergies}</div>
                  </div>
                )}
                {current.special_notes && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>Special Notes</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text)', background: '#f8fafc', padding: '6px 10px', borderRadius: 6 }}>{current.special_notes}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit / New form */}
      {(mode === 'edit' || mode === 'new') && (
        <div className={s.card}>
          <div style={{ background: '#f8fafc', padding: '8px 16px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: 13 }}>
            {mode === 'new' ? 'New Patient' : `Edit Patient${current?.uhid ? ` — ${current.uhid}` : ''}`}
          </div>
          <div className={s.cardBody}>
            <div style={{ fontSize: 11, color: '#6d28d9', background: '#ede9fe', padding: '5px 10px', borderRadius: 6, marginBottom: 12, fontWeight: 600 }}>
              Note: UHID (e.g. INFER1607) is the universal patient identifier used across all lab orders, samples and reports.
            </div>
            {mode === 'new' && (
              <div className={`${s.alert} ${s.alertInfo}`} style={{ marginBottom: 14 }}>
                New patients must be registered at reception / EMR portal. Use this form to update notes for an existing patient found above.
              </div>
            )}

            {/* Basic info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
              <div className={s.field}>
                <label className={s.label}>First Name *</label>
                <input className={s.input} {...field('first_name')} placeholder="First name" />
              </div>
              <div className={s.field}>
                <label className={s.label}>Last Name</label>
                <input className={s.input} {...field('last_name')} placeholder="Last name" />
              </div>
              <div className={s.field}>
                <label className={s.label}>Date of Birth</label>
                <input className={s.input} type="date" {...field('date_of_birth')} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Gender</label>
                <select className={s.select} {...field('gender')}>
                  <option value="">— Select —</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Contact + blood */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className={s.field}>
                <label className={s.label}>Phone</label>
                <input className={s.input} {...field('phone')} placeholder="+91 …" />
              </div>
              <div className={s.field}>
                <label className={s.label}>Blood Group</label>
                <select className={s.select} {...field('blood_group')}>
                  <option value="">— Select —</option>
                  {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg => <option key={bg}>{bg}</option>)}
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>Address</label>
                <input className={s.input} {...field('address')} placeholder="City / Area" />
              </div>
            </div>

            {/* Allergies + Notes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div className={s.field}>
                <label className={s.label} style={{ color: '#b45309' }}>⚠ Allergies</label>
                <textarea className={s.input} rows={2} {...field('allergies')} placeholder="Drug / food / latex allergies…" style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Special Notes</label>
                <textarea className={s.input} rows={2} {...field('special_notes')} placeholder="Clinical context, special handling instructions…" style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }} />
              </div>
            </div>

            {/* Actions */}
            <div className={s.formActions}>
              <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => setMode(null)}>
                <X size={14} /> Cancel
              </button>
              {onAddSample && mode === 'edit' && (
                <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => handleSave(true)} disabled={saving}
                  style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}>
                  <FlaskConical size={14} /> {saving ? 'Saving…' : 'Save & Add Sample'}
                </button>
              )}
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => handleSave(false)} disabled={saving || mode === 'new'}>
                <Check size={14} /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!searched && !mode && (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}><User size={48} /></div>
          <div className={s.emptyText}>Search for a patient above to view or edit their record</div>
        </div>
      )}
    </div>
  );
}

export default PatientsTab;
