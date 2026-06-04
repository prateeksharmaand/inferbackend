/**
 * AddSampleTab - OpenELIS-inspired Add Sample form with full clinical context
 */

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Plus, X, RefreshCw, ChevronDown, ChevronRight, Printer } from 'lucide-react';
import { PatientAutocomplete } from './PatientAutocomplete';
import { SampleTypeAutocomplete } from './SampleTypeAutocomplete';
import { DoctorAutocomplete } from './DoctorAutocomplete';
import { TestsAutocomplete } from './TestsAutocomplete';

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

const todayDate = () => new Date().toISOString().split('T')[0];
const nowTime   = () => new Date().toTimeString().slice(0, 5);

const LAB_SECTIONS = [
  'Serology Department',
  'Histopathology Department',
  'Microbiology Department',
  'Pathology Department',
  'Biochemistry Department',
  'Haematology Lab Department',
];

const SOURCES     = ['OPD-1', 'OPD-2', 'Emergency', 'IPD', 'External', 'Bedside', 'ICU', 'OT'];
const PRIORITIES  = [
  { value: 'ROUTINE', label: 'Routine',  color: '#64748b' },
  { value: 'URGENT',  label: 'Urgent',   color: '#b45309' },
  { value: 'STAT',    label: 'STAT',     color: '#991b1b' },
];
const SPECIMEN_CONDITIONS = ['Normal', 'Hemolyzed', 'Lipemic', 'Icteric', 'Clotted', 'Insufficient Volume', 'Improper Container', 'Unlabeled'];
const CONTAINER_TYPES     = ['Red Top (SST)', 'EDTA (Purple)', 'Sodium Citrate (Blue)', 'Heparin (Green)', 'Fluoride Oxalate (Grey)', 'Sterile Container', 'Urine Cup', 'Swab', 'Other'];
const FASTING_OPTIONS     = ['Unknown', 'Fasting (8h+)', 'Non-Fasting', 'Fasting (12h+)', 'Post-Prandial'];

const sh = { background: '#f8fafc', padding: '8px 16px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' };

function Section({ title, badge, open, onToggle, children, zIndex }) {
  return (
    <div className='card' style={{ marginBottom: 14, border: '1px solid var(--color-border)', borderRadius: 8, overflow: open ? 'visible' : 'hidden', position: 'relative', zIndex: zIndex || 'auto' }}>
      <div style={sh} onClick={onToggle}>
        <span>{title}{badge ? <span style={{ marginLeft: 8, fontSize: 11, background: '#dbeafe', color: '#1e40af', padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>{badge}</span> : null}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>
      {open && <div style={{ padding: '14px 16px' }}>{children}</div>}
    </div>
  );
}

export function AddSampleTab({ labId, styles: s, prefillPatient, onPrefillUsed }) {
  // ── Patient ──────────────────────────────────────────────────────────────────
  const [foundPatient, setFoundPatient] = useState(null);

  // ── Sample chips ─────────────────────────────────────────────────────────────
  const [sampleType,    setSampleType]    = useState('');
  const [containerType, setContainerType] = useState('');
  const [volumeMl,      setVolumeMl]      = useState('');
  const [sampleTypes,   setSampleTypes]   = useState([]);
  const [samples,       setSamples]       = useState([]);

  // ── Collection ───────────────────────────────────────────────────────────────
  const [collectionDate,      setCollectionDate]      = useState(todayDate);
  const [collectionTime,      setCollectionTime]      = useState(nowTime);
  const [collectedBy,         setCollectedBy]         = useState('');
  const [collectionSite,      setCollectionSite]      = useState('OPD-1');
  const [specimenCondition,   setSpecimenCondition]   = useState('Normal');
  const [fastingStatus,       setFastingStatus]       = useState('Unknown');

  // ── Order ────────────────────────────────────────────────────────────────────
  const [accession,     setAccession]     = useState('');
  const [receivedDate,  setReceivedDate]  = useState(todayDate);
  const [receivedTime,  setReceivedTime]  = useState(nowTime);
  const [priority,      setPriority]      = useState('ROUTINE');
  const [requester,     setRequester]     = useState('');
  const [referredFrom,  setReferredFrom]  = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [patientConsent,setPatientConsent]= useState(true);
  const [doctors,       setDoctors]       = useState([]);

  // ── Tests ────────────────────────────────────────────────────────────────────
  const [catalog,          setCatalog]          = useState({});
  const [allTests,         setAllTests]         = useState([]);
  const [allPanels,        setAllPanels]        = useState([]);
  const [selectedTests,    setSelectedTests]    = useState([]);
  const [selectedPanels,   setSelectedPanels]   = useState([]);

  // ── UI ───────────────────────────────────────────────────────────────────────
  const [openSections, setOpenSections] = useState({ patient: true, sample: true, collection: true, order: true, tests: true, extra: false });
  const toggleSection = (k) => setOpenSections(p => ({ ...p, [k]: !p[k] }));
  const [saving,     setSaving]     = useState(false);
  const [savedOrder, setSavedOrder] = useState(null);

  // ── Data loading ─────────────────────────────────────────────────────────────
  const loadCatalog = useCallback(async () => {
    if (!labId) return;
    try {
      const [catData, panData] = await Promise.all([
        apiFetch(`/api/v1/catalog?lab_id=${labId}`),
        apiFetch(`/api/v1/panels?lab_id=${labId}`),
      ]);
      const tests = catData.tests || catData || [];
      setAllTests(tests);
      setAllPanels(panData.panels || panData || []);
      // Also build by-section map for legacy use
      const bySection = {};
      for (const t of tests) {
        const sec = t.category || 'Other';
        if (!bySection[sec]) bySection[sec] = [];
        bySection[sec].push(t);
      }
      setCatalog(bySection);
    } catch { /* silently fail */ }
  }, [labId]);

  const loadSampleTypes = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/v1/sample-types`);
      const types = data.sample_types || [];
      setSampleTypes(types);
      if (types.length > 0 && !sampleType) setSampleType(types[0].name);
    } catch { setSampleTypes([]); }
  }, [sampleType]);

  const loadDoctors = useCallback(async () => {
    try {
      const docData = await apiFetch(`/api/v1/doctors`);
      setDoctors(docData.doctors || []);
    } catch { setDoctors([]); }
  }, []);

  useEffect(() => { loadCatalog(); loadSampleTypes(); loadDoctors(); }, [loadCatalog, loadSampleTypes, loadDoctors]);

  // Pre-fill patient when navigating from Patients tab
  useEffect(() => {
    if (prefillPatient) {
      setFoundPatient(prefillPatient);
      setOpenSections(p => ({ ...p, patient: true }));
      if (onPrefillUsed) onPrefillUsed();
    }
  }, [prefillPatient]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleAddSample = () => {
    if (!sampleType) return;
    setSamples(prev => [...prev, { id: Date.now(), type: sampleType, container: containerType, volume: volumeMl }]);
  };

  const toggleTest = (testId) =>
    setSelectedTests(prev => prev.includes(testId) ? prev.filter(t => t !== testId) : [...prev, testId]);

  const resetForm = () => {
    setFoundPatient(null); setSamples([]); setAccession(''); setSelectedTests([]);
    setClinicalNotes(''); setReferredFrom(''); setCollectedBy(''); setVoluMl('');
    setSavedOrder(null);
  };

  const handleSave = async () => {
    if (!labId)          { toast.error('Lab ID is required'); return; }
    if (!foundPatient || (!foundPatient.uhid && !foundPatient.id)) { toast.error('Please select a patient'); return; }
    if (samples.length === 0) { toast.error('Please add at least one sample'); return; }

    const collectedAt = collectionDate && collectionTime
      ? `${collectionDate}T${collectionTime}:00`
      : null;
    const receivedAt = receivedDate && receivedTime
      ? `${receivedDate}T${receivedTime}:00`
      : null;

    const noteParts = [
      specimenCondition !== 'Normal' ? `Condition: ${specimenCondition}` : null,
      fastingStatus !== 'Unknown'    ? `Fasting: ${fastingStatus}`       : null,
      referredFrom                   ? `Referred from: ${referredFrom}`   : null,
      patientConsent                 ? 'Consent: Obtained'               : 'Consent: Not documented',
    ].filter(Boolean).join(' | ');

    try {
      setSaving(true);
      const order = await apiFetch('/api/v1/orders', {
        method: 'POST',
        body: JSON.stringify({
          lab_id:        labId,
          patient_uhid:  foundPatient.uhid  || null,
          patient_id:    foundPatient.id    || null,
          patient_name:  foundPatient.name  || null,
          tests:         selectedTests,
          panels:        selectedPanels,
          priority,
          clinical_notes: [clinicalNotes, requester ? `Requested by: ${requester}` : null].filter(Boolean).join(' | ') || null,
        }),
      });

      const orderId = order.order?.id || order.id;
      for (const sample of samples) {
        await apiFetch('/api/v1/samples', {
          method: 'POST',
          body: JSON.stringify({
            order_id:        orderId,
            lab_id:          labId,
            patient_uhid:    foundPatient.uhid || null,
            patient_id:      foundPatient.id   || null,
            specimen_type:   sample.type,
            container_type:  sample.container  || null,
            volume_ml:       sample.volume ? parseFloat(sample.volume) : null,
            collection_site: collectionSite,
            collected_by:    collectedBy || null,
            collected_at:    collectedAt,
            notes:           [noteParts, `Received: ${receivedAt || receivedDate}`].filter(Boolean).join(' | '),
          }),
        });
      }

      const orderNum = order.order?.order_number || order.order_number || orderId;
      setSavedOrder(orderNum);
      toast.success(`Order ${orderNum} created`);
      setSamples([]); setAccession(''); setSelectedTests([]);
      setFoundPatient(null); setClinicalNotes(''); setReferredFrom(''); setCollectedBy('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const priorityColor = PRIORITIES.find(p => p.value === priority)?.color || '#64748b';

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Add Sample</div>
          <div className={s.pageSubtitle}>Register a new lab order with sample collection</div>
        </div>
      </div>

      {/* ── 1. Patient ── */}
      <Section title="1. Patient *" open={openSections.patient} onToggle={() => toggleSection('patient')} zIndex={50}>
        <PatientAutocomplete value={foundPatient} onChange={p => { setFoundPatient(p); }} placeholder="Type patient name or UHID…" styles={s} />
        {foundPatient && (
          <div className={`${s.alert} ${s.alertSuccess}`} style={{ marginTop: 8, fontSize: 12 }}>
            <strong>{foundPatient.name}</strong>
            {foundPatient.uhid   && <span style={{ marginLeft: 8, background: '#ede9fe', color: '#6d28d9', padding: '2px 6px', borderRadius: 6, fontWeight: 600, fontSize: 11 }}>UHID: {foundPatient.uhid}</span>}
            {foundPatient.mobile && <span style={{ marginLeft: 6, color: 'var(--color-text-2)', fontSize: 11 }}>{foundPatient.mobile}</span>}
            {foundPatient.dob    && <span style={{ marginLeft: 6, color: 'var(--color-text-2)', fontSize: 11 }}>{foundPatient.dob?.slice(0,10)}</span>}
            {foundPatient.gender && <span style={{ marginLeft: 6, color: 'var(--color-text-2)', fontSize: 11 }}>{foundPatient.gender}</span>}
          </div>
        )}
      </Section>

      {/* ── 2. Sample ── */}
      <Section title="2. Sample *" badge={samples.length || null} open={openSections.sample} onToggle={() => toggleSection('sample')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
          <div className={s.field}>
            <label className={s.label}>Sample Type *</label>
            <SampleTypeAutocomplete value={sampleType} onChange={setSampleType} sampleTypes={sampleTypes} placeholder="Search…" styles={s} />
          </div>
          <div className={s.field}>
            <label className={s.label}>Container / Tube</label>
            <select className={s.select} value={containerType} onChange={e => setContainerType(e.target.value)}>
              <option value="">— Select —</option>
              {CONTAINER_TYPES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label className={s.label}>Volume (mL)</label>
            <input className={s.input} type="number" min="0" step="0.1" value={volumeMl} onChange={e => setVolumeMl(e.target.value)} placeholder="e.g. 3.5" />
          </div>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleAddSample} style={{ marginBottom: 1 }}>
            <Plus size={14} /> Add
          </button>
        </div>
        {samples.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {samples.map(sample => (
              <span key={sample.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#dbeafe', color: '#1e40af', borderRadius: 16, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}>
                {sample.type}
                {sample.container && <span style={{ fontSize: 10, opacity: 0.8 }}>· {sample.container.split('(')[0].trim()}</span>}
                {sample.volume    && <span style={{ fontSize: 10, opacity: 0.8 }}>· {sample.volume}mL</span>}
                <button onClick={() => setSamples(prev => prev.filter(x => x.id !== sample.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e40af', display: 'flex', padding: 0 }}><X size={12} /></button>
              </span>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--color-text-2)' }}>No samples added yet.</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <div className={s.field}>
            <label className={s.label}>Specimen Condition at Receipt</label>
            <select className={s.select} value={specimenCondition} onChange={e => setSpecimenCondition(e.target.value)}
              style={{ borderColor: specimenCondition !== 'Normal' ? '#f59e0b' : undefined }}>
              {SPECIMEN_CONDITIONS.map(c => <option key={c}>{c}</option>)}
            </select>
            {specimenCondition !== 'Normal' && <span style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>⚠ Non-conformity will be flagged</span>}
          </div>
          <div className={s.field}>
            <label className={s.label}>Fasting Status</label>
            <select className={s.select} value={fastingStatus} onChange={e => setFastingStatus(e.target.value)}>
              {FASTING_OPTIONS.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>
        </div>
      </Section>

      {/* ── 3. Collection Details ── */}
      <Section title="3. Collection Details" open={openSections.collection} onToggle={() => toggleSection('collection')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          <div className={s.field}>
            <label className={s.label}>Collection Date *</label>
            <input className={s.input} type="date" value={collectionDate} onChange={e => setCollectionDate(e.target.value)} />
          </div>
          <div className={s.field}>
            <label className={s.label}>Collection Time *</label>
            <input className={s.input} type="time" value={collectionTime} onChange={e => setCollectionTime(e.target.value)} />
          </div>
          <div className={s.field}>
            <label className={s.label}>Collection Site / Location</label>
            <select className={s.select} value={collectionSite} onChange={e => setCollectionSite(e.target.value)}>
              {SOURCES.map(src => <option key={src}>{src}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label className={s.label}>Collected By (Phlebotomist)</label>
            <input className={s.input} value={collectedBy} onChange={e => setCollectedBy(e.target.value)} placeholder="Name or ID" />
          </div>
        </div>
      </Section>

      {/* ── 4. Order Details ── */}
      <Section title="4. Order Details" open={openSections.order} onToggle={() => toggleSection('order')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div className={s.field}>
            <label className={s.label}>Accession Number</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className={s.input} value={accession} onChange={e => setAccession(e.target.value)} placeholder="DDMMYYYY-NNN" />
              <button className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`} onClick={() => setAccession(generateAccession())} title="Generate"><RefreshCw size={12} /></button>
            </div>
          </div>
          <div className={s.field}>
            <label className={s.label}>Priority *</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {PRIORITIES.map(p => (
                <button key={p.value}
                  onClick={() => setPriority(p.value)}
                  className={`${s.btn} ${s.btnSm}`}
                  style={{ flex: 1, fontWeight: 700, fontSize: 12,
                    background: priority === p.value ? p.color : 'var(--color-surface)',
                    color: priority === p.value ? 'white' : p.color,
                    border: `1.5px solid ${p.color}` }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className={s.field}>
            <label className={s.label}>Received Date &amp; Time</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className={s.input} type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} style={{ flex: 1 }} />
              <input className={s.input} type="time" value={receivedTime} onChange={e => setReceivedTime(e.target.value)} style={{ flex: 1 }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div className={s.field}>
            <label className={s.label}>Requesting Doctor</label>
            <DoctorAutocomplete value={requester} onChange={setRequester} doctors={doctors} placeholder="Search doctor or enter name…" styles={s} />
          </div>
          <div className={s.field}>
            <label className={s.label}>Referred From (External)</label>
            <input className={s.input} value={referredFrom} onChange={e => setReferredFrom(e.target.value)} placeholder="External hospital / lab name" />
          </div>
        </div>
        <div className={s.field}>
          <label className={s.label}>Clinical Notes / Diagnosis</label>
          <textarea className={s.input} rows={2} value={clinicalNotes} onChange={e => setClinicalNotes(e.target.value)} placeholder="Relevant clinical context for the lab technician…" style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <input type="checkbox" id="consent" checked={patientConsent} onChange={e => setPatientConsent(e.target.checked)} />
          <label htmlFor="consent" style={{ fontSize: 13, cursor: 'pointer' }}>Patient consent obtained</label>
        </div>
      </Section>

      {/* ── 5. Tests Ordered ── */}
      <Section title="5. Tests Ordered" badge={(selectedTests.length + selectedPanels.length) || null} open={openSections.tests} onToggle={() => toggleSection('tests')}>
        <TestsAutocomplete
          allTests={allTests}
          allPanels={allPanels}
          selectedTestIds={selectedTests}
          selectedPanelIds={selectedPanels}
          onChangeTests={setSelectedTests}
          onChangePanels={setSelectedPanels}
          styles={s}
        />
      </Section>

      {/* Saved order confirmation */}
      {savedOrder && (
        <div className={`${s.alert} ${s.alertSuccess}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>✓ Order <strong>{savedOrder}</strong> created successfully</span>
          <button className={`${s.btn} ${s.btnSm} ${s.btnSecondary}`} onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Printer size={13} /> Print Label
          </button>
        </div>
      )}

      {/* Footer */}
      <div className={s.formActions}>
        <button className={`${s.btn} ${s.btnSecondary}`} onClick={resetForm}>Cancel</button>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleSave} disabled={saving}
          style={{ background: priority === 'STAT' ? '#991b1b' : priority === 'URGENT' ? '#b45309' : undefined }}>
          {saving ? 'Saving…' : priority === 'STAT' ? '🚨 Save STAT Order' : 'Save Order'}
        </button>
      </div>
    </div>
  );
}

export default AddSampleTab;
