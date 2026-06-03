/**
 * AddSampleTab - OpenELIS-inspired Add Sample form
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, X, RefreshCw } from 'lucide-react';
import { PatientAutocomplete } from './PatientAutocomplete';
import { SampleTypeAutocomplete } from './SampleTypeAutocomplete';

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

function generateAccession() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  const yr = d.getFullYear();
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `${day}${mon}${yr}-${seq}`;
}

const LAB_SECTIONS = [
  'Serology Department',
  'Histopathology Department',
  'Microbiology Department',
  'Pathology Department',
  'Biochemistry Department',
  'Haematology Lab Department',
];

const SOURCES = ['OPD-1', 'OPD-2', 'Emergency', 'IPD', 'External'];

const sectionHeader = { background: '#f8fafc', padding: '8px 16px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: 13 };

export function AddSampleTab({ labId, styles: s }) {
  // Section 1 — Search
  const [foundPatient, setFoundPatient] = useState(null);
  const [searchError, setSearchError] = useState('');

  // Section 2 — Sample
  const [sampleType, setSampleType] = useState('');
  const [sampleTypes, setSampleTypes] = useState([]);
  const [samples, setSamples] = useState([]);

  // Section 3 — Order
  const [accession, setAccession] = useState('');
  const [sampleSource, setSampleSource] = useState('OPD-1');
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [requester, setRequester] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [catalog, setCatalog] = useState({});
  const [selectedTests, setSelectedTests] = useState([]);
  const [expandedSections, setExpandedSections] = useState({});

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');

  const showMsg = (m, t = 'success') => { setMsg(m); setMsgType(t); setTimeout(() => setMsg(''), 5000); };

  // Load catalog and sample types
  const loadCatalog = useCallback(async () => {
    if (!labId) return;
    try {
      const catalogBySection = {};
      for (const section of LAB_SECTIONS) {
        try {
          const data = await apiFetch(`/api/v1/catalog?lab_id=${labId}&category=${encodeURIComponent(section)}`);
          catalogBySection[section] = data.tests || data || [];
        } catch {
          catalogBySection[section] = [];
        }
      }
      setCatalog(catalogBySection);
      // Also try to get doctor list
      const docData = await apiFetch(`/api/v1/catalog?lab_id=${labId}`);
      setDoctors(docData.doctors || []);
    } catch {
      // silently fail
    }
  }, [labId]);

  // Load sample types from API
  const loadSampleTypes = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/v1/sample-types`);
      const types = data.sample_types || [];
      setSampleTypes(types);
      if (types.length > 0 && !sampleType) {
        setSampleType(types[0].name);
      }
    } catch {
      setSampleTypes([]);
    }
  }, [sampleType]);

  useEffect(() => {
    loadCatalog();
    loadSampleTypes();
  }, [loadCatalog, loadSampleTypes]);

  const handlePatientSelect = (patient) => {
    setFoundPatient(patient);
    setSearchError('');
  };

  const handleAddSample = () => {
    if (!sampleType) return;
    setSamples((prev) => [...prev, { id: Date.now(), type: sampleType }]);
  };

  const handleRemoveSample = (id) => setSamples((prev) => prev.filter((s) => s.id !== id));

  const toggleTest = (testId) => {
    setSelectedTests((prev) =>
      prev.includes(testId) ? prev.filter((t) => t !== testId) : [...prev, testId]
    );
  };

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSave = async () => {
    if (!foundPatient) { showMsg('Please search and select a patient first', 'error'); return; }
    if (samples.length === 0) { showMsg('Please add at least one sample', 'error'); return; }
    if (!accession) { showMsg('Please enter or generate an accession number', 'error'); return; }

    try {
      setSaving(true);
      const order = await apiFetch('/api/v1/orders', {
        method: 'POST',
        body: JSON.stringify({
          lab_id: labId,
          patient_id: foundPatient.id || foundPatient.patient_id,
          accession_number: accession,
          sample_source: sampleSource,
          received_date: receivedDate,
          requester_name: requester,
          test_ids: selectedTests,
          status: 'PENDING',
        }),
      });

      const orderId = order.order?.id || order.id;
      for (const sample of samples) {
        await apiFetch('/api/v1/samples', {
          method: 'POST',
          body: JSON.stringify({
            order_id: orderId,
            lab_id: labId,
            patient_id: foundPatient.id || foundPatient.patient_id,
            sample_type: sample.type,
            status: 'RECEIVED',
          }),
        });
      }

      showMsg(`Order created successfully. Accession: ${accession}`);
      // Reset form
      setFoundPatient(null);
      setSamples([]);
      setAccession('');
      setSelectedTests([]);
      setFoundPatient(null);
    } catch (err) {
      showMsg(`Failed to save: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Add Sample</div>
          <div className={s.pageSubtitle}>Register a new lab order with sample collection</div>
        </div>
      </div>

      {msg && <div className={`${s.alert} ${msgType === 'error' ? s.alertError : s.alertSuccess}`}>{msg}</div>}

      {/* Section 1 & 2 — Search & Sample (2-column layout) */}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div style={sectionHeader}>Search * | Sample *</div>
        <div className={s.cardBody}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
            {/* Left Column — Patient */}
            <div>
              <div className={s.field}>
                <label className={s.label}>Patient — type name or UHID</label>
                <PatientAutocomplete
                  value={foundPatient}
                  onChange={handlePatientSelect}
                  placeholder="Search patient by name or UHID…"
                  styles={s}
                />
              </div>
              {searchError && <div className={`${s.alert} ${s.alertError}`} style={{ marginTop: 8, fontSize: 12 }}>{searchError}</div>}
              {foundPatient && (
                <div className={`${s.alert} ${s.alertSuccess}`} style={{ marginTop: 8, fontSize: 12 }}>
                  <strong>{foundPatient.name}</strong>
                  {foundPatient.uhid && <span style={{ marginLeft: 8, background: '#ede9fe', color: '#6d28d9', padding: '2px 6px', borderRadius: 6, fontWeight: 600, fontSize: 11 }}>UHID: {foundPatient.uhid}</span>}
                  {foundPatient.mobile && <span style={{ marginLeft: 6, color: 'var(--color-text-2)', fontSize: 11 }}>{foundPatient.mobile}</span>}
                </div>
              )}
            </div>

            {/* Right Column — Sample Type */}
            <div>
              <div className={s.field}>
                <label className={s.label}>Sample Type</label>
                <SampleTypeAutocomplete
                  value={sampleType}
                  onChange={setSampleType}
                  sampleTypes={sampleTypes}
                  placeholder="Search sample type..."
                  styles={s}
                />
              </div>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleAddSample} style={{ marginTop: 28, width: '100%' }}>
                <Plus size={14} /> Add Sample
              </button>
            </div>
          </div>
          {samples.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {samples.map((sample) => (
                <span
                  key={sample.id}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#dbeafe', color: '#1e40af', borderRadius: 16, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}
                >
                  {sample.type}
                  <button
                    onClick={() => handleRemoveSample(sample.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e40af', display: 'flex', alignItems: 'center', padding: 0 }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {samples.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--color-text-2)' }}>No samples added yet. Select a sample type and click Add Sample.</div>
          )}
        </div>
      </div>

      {/* Section 3 — Order */}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div style={sectionHeader}>Order *</div>
        <div className={s.cardBody}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className={s.field}>
              <label className={s.label}>Accession Number *</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className={s.input} value={accession} onChange={(e) => setAccession(e.target.value)} placeholder="DDMMYYYY-NNN" />
                <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => setAccession(generateAccession())} title="Generate Accession Number">
                  <RefreshCw size={12} />
                </button>
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-text-2)' }}>Scan OR Enter Manually OR <button style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: 11, padding: 0 }} onClick={() => setAccession(generateAccession())}>Generate</button></span>
            </div>
            <div className={s.field}>
              <label className={s.label}>Sample Source</label>
              <select className={s.select} value={sampleSource} onChange={(e) => setSampleSource(e.target.value)}>
                {SOURCES.map((src) => <option key={src}>{src}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>Received Date</label>
              <input className={s.input} type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
            <div className={s.field}>
              <label className={s.label}>Requester's Name</label>
              {doctors.length > 0 ? (
                <select className={s.select} value={requester} onChange={(e) => setRequester(e.target.value)}>
                  <option value="">— Select Doctor —</option>
                  {doctors.map((d) => <option key={d.id} value={d.name || d.id}>{d.name || d.id}</option>)}
                </select>
              ) : (
                <input className={s.input} value={requester} onChange={(e) => setRequester(e.target.value)} placeholder="Doctor / Requester name" />
              )}
            </div>
          </div>

          {/* Test Selection */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 8 }}>SELECT TESTS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {LAB_SECTIONS.map((section) => {
                const tests = catalog[section] || [];
                const expanded = expandedSections[section];
                return (
                  <div key={section} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
                    <div
                      style={{ background: '#f8fafc', padding: '8px 12px', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onClick={() => toggleSection(section)}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={tests.every((t) => selectedTests.includes(t.id))}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedTests((prev) => [...new Set([...prev, ...tests.map((t) => t.id)])]);
                            else setSelectedTests((prev) => prev.filter((id) => !tests.map((t) => t.id).includes(id)));
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {section}
                      </label>
                      <span style={{ fontSize: 11, color: 'var(--color-text-2)' }}>{expanded ? '▲' : '▼'}</span>
                    </div>
                    {expanded && (
                      <div style={{ padding: '8px 12px', maxHeight: 160, overflowY: 'auto' }}>
                        {tests.length === 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--color-text-2)' }}>No tests configured</div>
                        ) : (
                          tests.map((test) => (
                            <label key={test.id} className={s.checkLabel}>
                              <input type="checkbox" checked={selectedTests.includes(test.id)} onChange={() => toggleTest(test.id)} />
                              {test.test_name || test.name}
                            </label>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={s.formActions}>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={() => { setFoundPatient(null); setSamples([]); setAccession(''); setSelectedTests([]); }}>
          Cancel
        </button>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default AddSampleTab;
