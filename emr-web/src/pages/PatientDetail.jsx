import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Link2, FileText, AlertCircle, CheckCircle, Clock, RefreshCw, Plus, Unlink, Send } from 'lucide-react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

// ── helpers ───────────────────────────────────────────────────────────────────
const TABS = ['Overview', 'ABHA & Linking', 'Care Contexts', 'Consent'];

function Badge({ color, children }) {
  const colors = {
    green:  { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
    purple: { bg: '#faf5ff', border: '#d8b4fe', text: '#6b21a8' },
    blue:   { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' },
    gray:   { bg: '#f8fafc', border: '#cbd5e1', text: '#475569' },
    red:    { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
    amber:  { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
  };
  const c = colors[color] || colors.gray;
  return (
    <span style={{
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>{children}</span>
  );
}

// ── ABHA Tab ─────────────────────────────────────────────────────────────────
function AbhaTab({ patient, patientId, onRefresh }) {
  const [step, setStep]       = useState('idle'); // idle | method | aadhaar_otp | aadhaar_verify | abha_otp | abha_verify | done
  const [txnId, setTxnId]     = useState('');
  const [otp, setOtp]         = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [abhaId, setAbhaId]   = useState('');
  const [loading, setLoading] = useState(false);

  const hasAbha = !!(patient?.abha_number || patient?.abha_address);

  // ── Method A: link by ABHA number OTP ────────────────────────────────────
  const requestAbhaOtp = async () => {
    if (!abhaId.trim()) return toast.error('Enter ABHA number or address');
    setLoading(true);
    try {
      const res = await api.post(`/patients/${patientId}/abha/verify-otp`, { abhaId: abhaId.trim() });
      setTxnId(res.txnId || res.transactionId || '');
      setStep('abha_verify');
      toast.success('OTP sent to patient\'s registered mobile');
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const confirmAbhaOtp = async () => {
    if (!otp.trim()) return toast.error('Enter OTP');
    setLoading(true);
    try {
      await api.post(`/patients/${patientId}/abha/verify-confirm`, { otp, txnId });
      toast.success('ABHA linked successfully!');
      setStep('done');
      onRefresh();
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  // ── Method B: create new ABHA via Aadhaar ────────────────────────────────
  const requestAadhaarOtp = async () => {
    const clean = aadhaar.replace(/\D/g, '');
    if (clean.length !== 12) return toast.error('Enter valid 12-digit Aadhaar number');
    setLoading(true);
    try {
      const res = await api.post(`/patients/${patientId}/abha/create-otp`, { aadhaar: clean });
      setTxnId(res.txnId || res.transactionId || '');
      setStep('aadhaar_verify');
      toast.success('OTP sent to Aadhaar-linked mobile');
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const confirmAadhaarOtp = async () => {
    if (!otp.trim()) return toast.error('Enter OTP');
    setLoading(true);
    try {
      await api.post(`/patients/${patientId}/abha/create-verify`, { otp, txnId });
      toast.success('ABHA created & linked successfully!');
      setStep('done');
      onRefresh();
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const reset = () => { setStep('idle'); setOtp(''); setAadhaar(''); setAbhaId(''); setTxnId(''); };

  const inp = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none',
    boxSizing: 'border-box',
  };
  const btn = (color = '#7c3aed') => ({
    padding: '10px 20px', borderRadius: 8, border: 'none', background: color,
    color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', width: '100%',
    opacity: loading ? 0.6 : 1,
  });

  return (
    <div style={{ maxWidth: 520 }}>
      {/* Current ABHA status card */}
      <div style={{ background: hasAbha ? '#f0fdf4' : '#faf5ff', border: `1.5px solid ${hasAbha ? '#86efac' : '#d8b4fe'}`, borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: hasAbha ? 12 : 0 }}>
          {hasAbha ? <CheckCircle size={20} color="#16a34a" /> : <Shield size={20} color="#7c3aed" />}
          <span style={{ fontWeight: 700, fontSize: 15, color: hasAbha ? '#166534' : '#6b21a8' }}>
            {hasAbha ? 'ABHA Linked' : 'ABHA Not Linked'}
          </span>
        </div>
        {hasAbha && (
          <div style={{ fontSize: 13, color: '#374151', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {patient.abha_number  && <span><strong>ABHA Number:</strong> {patient.abha_number}</span>}
            {patient.abha_address && <span><strong>ABHA Address:</strong> {patient.abha_address}</span>}
          </div>
        )}
      </div>

      {/* Link / Create ABHA flows */}
      {step === 'idle' && !hasAbha && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 4px' }}>Link this patient's ABHA to enable ABDM health data sharing:</p>
          <button style={btn()} onClick={() => setStep('method')}>
            <Link2 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Link / Create ABHA
          </button>
        </div>
      )}

      {step === 'idle' && hasAbha && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{ ...btn('#475569'), width: 'auto', padding: '8px 16px' }} onClick={() => setStep('method')}>
            Update ABHA
          </button>
        </div>
      )}

      {step === 'method' && (
        <div>
          <h4 style={{ margin: '0 0 14px', color: '#1e293b' }}>Choose method</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button style={btn()} onClick={() => setStep('abha_otp')}>
              🔗 Link Existing ABHA (by ABHA number / address)
            </button>
            <button style={{ ...btn(), background: '#0284c7' }} onClick={() => setStep('aadhaar_otp')}>
              ✨ Create New ABHA (via Aadhaar OTP)
            </button>
            <button style={{ ...btn(), background: '#94a3b8' }} onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {step === 'abha_otp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h4 style={{ margin: '0 0 4px', color: '#1e293b' }}>Enter ABHA Number or Address</h4>
          <input style={inp} placeholder="e.g. 91-2345-6789-0123 or rahul@abdm" value={abhaId} onChange={e => setAbhaId(e.target.value)} />
          <button style={btn()} onClick={requestAbhaOtp} disabled={loading}>{loading ? 'Sending OTP…' : 'Send OTP'}</button>
          <button style={{ ...btn(), background: '#94a3b8' }} onClick={reset}>Cancel</button>
        </div>
      )}

      {step === 'abha_verify' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1d4ed8' }}>
            OTP sent to patient's ABDM-registered mobile
          </div>
          <input style={inp} placeholder="Enter 6-digit OTP" value={otp} onChange={e => setOtp(e.target.value)} maxLength={6} />
          <button style={btn()} onClick={confirmAbhaOtp} disabled={loading}>{loading ? 'Verifying…' : 'Verify & Link'}</button>
          <button style={{ ...btn(), background: '#94a3b8' }} onClick={reset}>Cancel</button>
        </div>
      )}

      {step === 'aadhaar_otp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h4 style={{ margin: '0 0 4px', color: '#1e293b' }}>Patient's Aadhaar Number</h4>
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>This will be used only to authenticate ABHA creation with NHA. Not stored.</p>
          <input style={inp} placeholder="12-digit Aadhaar number" value={aadhaar} onChange={e => setAadhaar(e.target.value)} maxLength={12} />
          <button style={{ ...btn(), background: '#0284c7' }} onClick={requestAadhaarOtp} disabled={loading}>{loading ? 'Sending OTP…' : 'Send OTP to Aadhaar Mobile'}</button>
          <button style={{ ...btn(), background: '#94a3b8' }} onClick={reset}>Cancel</button>
        </div>
      )}

      {step === 'aadhaar_verify' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1d4ed8' }}>
            OTP sent to Aadhaar-linked mobile number
          </div>
          <input style={inp} placeholder="Enter 6-digit OTP" value={otp} onChange={e => setOtp(e.target.value)} maxLength={6} />
          <button style={{ ...btn(), background: '#0284c7' }} onClick={confirmAadhaarOtp} disabled={loading}>{loading ? 'Creating ABHA…' : 'Verify & Create ABHA'}</button>
          <button style={{ ...btn(), background: '#94a3b8' }} onClick={reset}>Cancel</button>
        </div>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <CheckCircle size={40} color="#16a34a" style={{ marginBottom: 12 }} />
          <p style={{ fontWeight: 700, color: '#166534' }}>ABHA linked successfully!</p>
          <button style={{ ...btn('#7c3aed'), width: 'auto', padding: '8px 20px' }} onClick={reset}>Done</button>
        </div>
      )}
    </div>
  );
}

// ── Consent Request Modal ─────────────────────────────────────────────────────
const HI_TYPES = ['OPConsultation','Prescription','DiagnosticReport','DischargeSummary','ImmunizationRecord'];
const PURPOSE_OPTIONS = [
  { value: 'CAREMGT',  label: 'Care Management' },
  { value: 'BTG',      label: 'Break the Glass' },
  { value: 'PUBHLTH',  label: 'Public Health' },
  { value: 'HPAYMT',   label: 'Healthcare Payment' },
  { value: 'DSRCH',    label: 'Disease Specific Healthcare Research' },
];

function ConsentModal({ patient, onClose, onSent }) {
  const abha = patient?.abha_address || patient?.abha_number || '';
  const hipId = import.meta.env.VITE_ABDM_HIP_ID || 'noushealthhip';
  const [purpose,   setPurpose]   = useState('CAREMGT');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [hiTypes,   setHiTypes]   = useState(['OPConsultation']);
  const [sending,   setSending]   = useState(false);

  const toggleType = (t) => setHiTypes(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

  const send = async () => {
    if (!abha) return toast.error('Patient has no ABHA address');
    if (!hiTypes.length) return toast.error('Select at least one document type');
    setSending(true);
    try {
      await api.post('/consents', {
        patientAbha: abha, hipId, purpose,
        hiTypes,
        dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        dateTo:   dateTo   ? new Date(dateTo).toISOString()   : undefined,
      });
      toast.success('Consent request sent to patient');
      onSent?.();
      onClose();
    } catch (err) { toast.error(err.message); }
    finally { setSending(false); }
  };

  const inp = { width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff' };
  const lbl = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', padding: 28, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700, color: '#1e293b' }}>Request Patient Consent</h2>

        {/* Purpose + dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Purpose</label>
            <select style={inp} value={purpose} onChange={e => setPurpose(e.target.value)}>
              {PURPOSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>From Date</label>
            <input type="date" style={inp} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>To Date</label>
            <input type="date" style={inp} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>

        {/* HI Types */}
        <div style={{ marginBottom: 22 }}>
          <label style={lbl}>HI Types</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {HI_TYPES.map(t => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                <input type="checkbox" checked={hiTypes.includes(t)} onChange={() => toggleType(t)}
                  style={{ accentColor: '#7c3aed', width: 15, height: 15, cursor: 'pointer' }} />
                {t}
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={send} disabled={sending}
            style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: sending ? '#c4b5fd' : '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 13, cursor: sending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Send size={14} /> {sending ? 'Sending…' : 'Send Consent Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Care Contexts Tab ─────────────────────────────────────────────────────────
function CareContextsTab({ careContexts, patient, onConsentSent }) {
  const [showConsentModal, setShowConsentModal] = useState(false);
  const hasAbha = !!(patient?.abha_address || patient?.abha_number);

  return (
    <div style={{ position: 'relative' }}>
      {!careContexts?.length ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
          <FileText size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ fontWeight: 600, margin: 0 }}>No care contexts yet</p>
          <p style={{ fontSize: 13, margin: '6px 0 0' }}>End an appointment and the system will auto-create one.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {careContexts.map((c, i) => (
            <div key={c.id || i} style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, background: '#faf5ff', border: '1.5px solid #d8b4fe', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={16} color="#7c3aed" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.display}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Ref: {c.reference_number}</div>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Badge color="purple">{c.hi_type || 'OPConsultation'}</Badge>
                {c.link_status === 'linked' && <Badge color="green">ABDM ✓</Badge>}
                {c.fhir_content && <Badge color="blue">FHIR</Badge>}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
                {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasAbha && (
        <button
          onClick={() => setShowConsentModal(true)}
          title="Request Patient Consent"
          style={{
            position: 'fixed', bottom: 32, right: 32,
            background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 50,
            width: 56, height: 56, cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(124,58,237,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <Send size={22} />
        </button>
      )}

      {showConsentModal && (
        <ConsentModal patient={patient} onClose={() => setShowConsentModal(false)} onSent={onConsentSent} />
      )}
    </div>
  );
}

// ── Consent Tab ───────────────────────────────────────────────────────────────
function ConsentTab({ patient, refreshKey }) {
  const [consents, setConsents] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showModal, setShowModal] = useState(false);

  const loadConsents = () => {
    setLoading(true);
    api.get('/consents').then(rows => {
      const abha = patient?.abha_address || patient?.abha_number;
      setConsents(rows.filter(r => abha && r.patient_abha === abha));
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadConsents(); }, [patient, refreshKey]);

  const STATUS_STYLE = {
    REQUESTED: { color: 'amber', label: 'Requested' },
    GRANTED:   { color: 'green', label: 'Granted'   },
    DENIED:    { color: 'red',   label: 'Denied'     },
    REVOKED:   { color: 'red',   label: 'Revoked'    },
    EXPIRED:   { color: 'gray',  label: 'Expired'    },
  };

  const PURPOSE_LABEL = { CAREMGT: 'Care Management', BTG: 'Break the Glass', PUBHLTH: 'Public Health', HPAYMT: 'Healthcare Payment', DSRCH: 'Disease Research' };

  if (loading) return <p style={{ color: '#94a3b8' }}>Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          onClick={() => setShowModal(true)}
          style={{ padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={14} /> Request Consent
        </button>
      </div>

      {!consents.length ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
          <Shield size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ margin: 0, fontWeight: 600 }}>No consent requests yet</p>
          <p style={{ fontSize: 13, margin: '6px 0 0' }}>Click "Request Consent" to send a consent request to this patient.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {consents.map((c, i) => {
            const s = STATUS_STYLE[c.status] || STATUS_STYLE.REQUESTED;
            const hiTypes = Array.isArray(c.hi_types) ? c.hi_types : (c.hi_types ? JSON.parse(c.hi_types) : []);
            return (
              <div key={c.request_id || i} style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', marginBottom: 4 }}>
                      {PURPOSE_LABEL[c.purpose] || c.purpose || 'Care Management'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginBottom: 6 }}>
                      ID: {c.request_id?.slice(0, 32)}…
                    </div>
                    {hiTypes.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {hiTypes.map(t => (
                          <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#f1f5f9', color: '#475569', fontWeight: 500 }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <Badge color={s.color}>{s.label}</Badge>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : ''}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <ConsentModal patient={patient} onClose={() => setShowModal(false)} onSent={loadConsents} />
      )}
    </div>
  );
}

// ── Main PatientDetail page ───────────────────────────────────────────────────
export default function PatientDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const [patient,    setPatient]    = useState(null);
  const [tab,        setTab]        = useState('Overview');
  const [loading,    setLoading]    = useState(true);
  const [consentKey, setConsentKey] = useState(0);

  const load = () => {
    setLoading(true);
    api.get(`/patients/${id}`)
      .then(setPatient)
      .catch(() => toast.error('Patient not found'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <div style={{ padding: 40, color: '#94a3b8' }}>Loading patient…</div>;
  if (!patient) return <div style={{ padding: 40, color: '#ef4444' }}>Patient not found.</div>;

  const hasAbha    = !!(patient.abha_number || patient.abha_address);
  const careCtxs   = patient.care_contexts || [];

  return (
    <div style={{ padding: '24px 32px', maxWidth: 840, margin: '0 auto' }}>
      {/* Back */}
      <button
        onClick={() => navigate('/patients')}
        style={{ background: 'none', border: 'none', color: '#7c3aed', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, padding: 0 }}
      >
        <ArrowLeft size={16} /> Back to Patients
      </button>

      {/* Patient header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28 }}>
        <div style={{ width: 56, height: 56, background: '#7c3aed', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22, fontWeight: 700, flexShrink: 0 }}>
          {(patient.name || '?')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>{patient.name}</h2>
            {hasAbha && <Badge color="green"><Shield size={10} /> ABHA Linked</Badge>}
            {careCtxs.length > 0 && <Badge color="purple"><FileText size={10} /> {careCtxs.length} Visit{careCtxs.length > 1 ? 's' : ''}</Badge>}
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 6, fontSize: 13, color: '#64748b', flexWrap: 'wrap' }}>
            {patient.mobile  && <span>📱 {patient.mobile}</span>}
            {patient.gender  && <span>{patient.gender === 'M' ? '♂ Male' : patient.gender === 'F' ? '♀ Female' : patient.gender}</span>}
            {patient.dob     && <span>🎂 {new Date(patient.dob).toLocaleDateString('en-IN')}</span>}
          </div>
          {(patient.abha_number || patient.abha_address) && (
            <div style={{ fontSize: 12, color: '#7c3aed', marginTop: 4, fontWeight: 600, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {patient.abha_number  && <span>ABHA No: {patient.abha_number}</span>}
              {patient.abha_address && <span>ABHA ID: {patient.abha_address}</span>}
            </div>
          )}
        </div>
        <button
          onClick={load}
          title="Refresh"
          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#64748b' }}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 24, gap: 0 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 18px', background: 'none', border: 'none',
              fontWeight: tab === t ? 700 : 500,
              color: tab === t ? '#7c3aed' : '#64748b',
              borderBottom: tab === t ? '2px solid #7c3aed' : '2px solid transparent',
              cursor: 'pointer', fontSize: 14, marginBottom: -2,
            }}
          >
            {t}
            {t === 'Care Contexts' && careCtxs.length > 0 && (
              <span style={{ marginLeft: 6, background: '#7c3aed', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>
                {careCtxs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { label: 'Full Name',     value: patient.name },
            { label: 'Mobile',        value: patient.mobile || '—' },
            { label: 'Gender',        value: patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : patient.gender || '—' },
            { label: 'Date of Birth', value: patient.dob ? new Date(patient.dob).toLocaleDateString('en-IN') : '—' },
            { label: 'ABHA Number',   value: patient.abha_number  || '—' },
            { label: 'ABHA Address',  value: patient.abha_address || '—' },
            { label: 'Care Contexts', value: careCtxs.length },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{String(value)}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'ABHA & Linking' && (
        <AbhaTab patient={patient} patientId={id} onRefresh={load} />
      )}

      {tab === 'Care Contexts' && (
        <CareContextsTab
          careContexts={careCtxs}
          patient={patient}
          onConsentSent={() => { setConsentKey(k => k + 1); setTab('Consent'); }}
        />
      )}

      {tab === 'Consent' && (
        <ConsentTab patient={patient} refreshKey={consentKey} />
      )}
    </div>
  );
}
