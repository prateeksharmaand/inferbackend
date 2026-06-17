import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Link2, FileText, AlertCircle, CheckCircle, Clock, RefreshCw, Plus, Unlink } from 'lucide-react';
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

// ── Care Contexts Tab ─────────────────────────────────────────────────────────
function CareContextsTab({ careContexts }) {
  if (!careContexts?.length) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
        <FileText size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
        <p style={{ fontWeight: 600, margin: 0 }}>No care contexts yet</p>
        <p style={{ fontSize: 13, margin: '6px 0 0' }}>
          Care contexts are auto-created when a doctor saves an OPD encounter.
        </p>
      </div>
    );
  }

  return (
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
          <div style={{ flexShrink: 0 }}>
            <Badge color="purple">{c.hi_type || 'OPConsultation'}</Badge>
            {c.fhir_content && <Badge color="green" style={{ marginLeft: 4 }}>FHIR ✓</Badge>}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
            {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Consent Tab ───────────────────────────────────────────────────────────────
function ConsentTab({ patientId, patient }) {
  const [consents, setConsents] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get('/consents').then(rows => {
      const abha = patient?.abha_address || patient?.abha_number;
      setConsents(rows.filter(r => !abha || r.patient_abha === abha || r.source === 'emr'));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [patient]);

  const createConsent = async () => {
    const abha = patient?.abha_address || patient?.abha_number;
    if (!abha) return toast.error('Link ABHA first to request consent');
    setCreating(true);
    try {
      await api.post('/consents', {
        patientAbha: abha,
        hipId: import.meta.env.VITE_ABDM_HIP_ID || 'infer-hip',
        purpose: 'CAREMGT',
        requesterName: 'Infer Care EMR',
      });
      toast.success('Consent request sent to patient');
      api.get('/consents').then(setConsents).catch(() => {});
    } catch (err) { toast.error(err.message); }
    finally { setCreating(false); }
  };

  const STATUS_STYLE = {
    REQUESTED: { color: 'amber', label: 'Pending' },
    GRANTED:   { color: 'green', label: 'Granted' },
    DENIED:    { color: 'red',   label: 'Denied'  },
    REVOKED:   { color: 'red',   label: 'Revoked' },
    EXPIRED:   { color: 'gray',  label: 'Expired' },
  };

  if (loading) return <p style={{ color: '#94a3b8' }}>Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          onClick={createConsent}
          disabled={creating}
          style={{ padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: creating ? 0.6 : 1 }}
        >
          <Plus size={14} /> {creating ? 'Sending…' : 'Request Consent'}
        </button>
      </div>

      {!consents.length ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
          <Shield size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ margin: 0, fontWeight: 600 }}>No consent requests yet</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {consents.map((c, i) => {
            const s = STATUS_STYLE[c.status] || STATUS_STYLE.REQUESTED;
            return (
              <div key={c.request_id || i} style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>Purpose: {c.purpose || 'CAREMGT'}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>ID: {c.request_id?.slice(0, 16)}…</div>
                </div>
                <Badge color={s.color}>{s.label}</Badge>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main PatientDetail page ───────────────────────────────────────────────────
export default function PatientDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [tab,     setTab]     = useState('Overview');
  const [loading, setLoading] = useState(true);

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
        <CareContextsTab careContexts={careCtxs} />
      )}

      {tab === 'Consent' && (
        <ConsentTab patientId={id} patient={patient} />
      )}
    </div>
  );
}
