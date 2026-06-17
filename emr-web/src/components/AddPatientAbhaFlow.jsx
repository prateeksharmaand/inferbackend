import { useState } from 'react';
import { AlertCircle, Check, ChevronRight, QrCode, Smartphone, CreditCard, Fingerprint } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

// ── Shared styles ──────────────────────────────────────────────────────────────
const inp = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const primaryBtn = (disabled) => ({ width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: disabled ? '#c4b5fd' : '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer' });
const ghostBtn = { width: '100%', padding: '10px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const infoBox = { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1d4ed8', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 14 };

// Step indicator matching screenshot style
function StepBadges({ steps, current }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const idx = i + 2; // badges start at "2"
        const done = idx < current;
        const active = idx === current;
        return (
          <span key={label} style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: done ? '#dcfce7' : active ? '#7c3aed' : '#f1f5f9',
            color: done ? '#166534' : active ? '#fff' : '#94a3b8',
          }}>
            {done ? '✓ ' : `${idx} `}{label}
          </span>
        );
      })}
    </div>
  );
}

// ── YES FLOW: Already has ABHA ──────────────────────────────────────────────
function YesFlow({ onSuccess, onClose }) {
  const [tab, setTab] = useState('abha');
  const [abhaInput, setAbhaInput] = useState('');
  const [mobile, setMobile] = useState('');
  const [step, setStep] = useState(1); // 1=input, 2=otp, 3=done
  const [otp, setOtp] = useState('');
  const [txnId, setTxnId] = useState('');
  const [byMobile, setByMobile] = useState(false);
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(false);
  const hipId = import.meta.env.VITE_ABDM_HIP_ID || 'noushealthhip';

  const requestOtp = async () => {
    const val = abhaInput.trim() || mobile.trim();
    if (!val) return toast.error('Enter ABHA Number or Mobile');
    setLoading(true);
    const isMobile = !!mobile.trim();
    setByMobile(isMobile);
    try {
      const payload = isMobile ? { mobile: mobile.trim() } : { abhaNumber: abhaInput.trim() };
      const res = await api.post('/abha/request-otp', payload);
      setTxnId(res.txnId || res.transactionId || '');
      setStep(2);
      toast.success('OTP sent');
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) return toast.error('Enter OTP');
    setLoading(true);
    try {
      const res = await api.post('/abha/verify-create', { otp, txnId, byMobile });
      setPatient(res);
      setStep(3);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const tabStyle = (active) => ({
    flex: 1, padding: '9px 4px', border: 'none', background: 'none',
    fontSize: 12, fontWeight: active ? 700 : 500,
    color: active ? '#7c3aed' : '#64748b',
    borderBottom: `2px solid ${active ? '#7c3aed' : 'transparent'}`,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  });

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', marginBottom: 20 }}>
        <button style={tabStyle(tab === 'abha')} onClick={() => { setTab('abha'); setStep(1); setOtp(''); }}>
          <CreditCard size={13} /> ABHA
        </button>
        <button style={tabStyle(tab === 'share')} onClick={() => setTab('share')}>
          <Smartphone size={13} /> Share Profile
        </button>
        <button style={tabStyle(tab === 'qr')} onClick={() => setTab('qr')}>
          <QrCode size={13} /> Scan QR Code
        </button>
      </div>

      {/* ABHA tab - Step 1 */}
      {tab === 'abha' && step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>ABHA Number</label>
            <input style={inp} placeholder="e.g. 91-2345-6789-0123"
              value={abhaInput} onChange={e => { setAbhaInput(e.target.value); if (e.target.value) setMobile(''); }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Mobile Number</label>
            <input style={inp} placeholder="10-digit mobile"
              value={mobile} onChange={e => { setMobile(e.target.value); if (e.target.value) setAbhaInput(''); }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button style={ghostBtn} onClick={onClose}>Cancel</button>
            <button style={primaryBtn(loading)} onClick={requestOtp} disabled={loading}>
              {loading ? 'Sending OTP…' : 'Send OTP'}
            </button>
          </div>
        </div>
      )}

      {/* ABHA tab - Step 2: Verify OTP */}
      {tab === 'abha' && step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <StepBadges steps={['Verify OTP']} current={2} />
          <div style={infoBox}><AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> OTP sent to registered mobile number</div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Enter OTP</label>
            <input style={inp} placeholder="6-digit OTP" value={otp}
              onChange={e => setOtp(e.target.value.slice(0, 6))} maxLength={6} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={ghostBtn} onClick={() => setStep(1)}>Back</button>
            <button style={primaryBtn(loading)} onClick={verifyOtp} disabled={loading}>
              {loading ? 'Verifying…' : 'Verify & Fetch'}
            </button>
          </div>
        </div>
      )}

      {/* ABHA tab - Step 3: Success */}
      {tab === 'abha' && step === 3 && patient && (
        <PatientCard patient={patient} onSuccess={onSuccess} />
      )}

      {/* Share Profile tab */}
      {tab === 'share' && (
        <div style={{ textAlign: 'center' }}>
          <div style={infoBox}><AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Ask patient to open ABDM PHR app → tap <strong>Scan & Share</strong> → scan this QR.</span>
          </div>
          <div style={{ margin: '16px auto', display: 'inline-block', padding: 16, border: '2px solid #e2e8f0', borderRadius: 12 }}>
            <QRCodeSVG
              value={`https://phrsbx.abdm.gov.in/share/profile?hip-id=${encodeURIComponent(hipId)}&counter=1`}
              size={170} level="M"
            />
          </div>
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>HIP ID: <strong>{hipId}</strong></p>
        </div>
      )}

      {/* Scan QR tab */}
      {tab === 'qr' && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <QrCode size={48} color="#7c3aed" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: '#475569', fontWeight: 600, margin: '0 0 6px' }}>Scan Patient's ABHA QR</p>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Use a QR scanner to scan the patient's ABHA card QR code.</p>
        </div>
      )}
    </div>
  );
}

// ── Patient detail card shown after fetch/creation ─────────────────────────
function PatientCard({ patient, onSuccess, xToken }) {
  const [cardImg, setCardImg] = useState(null);
  const [loadingCard, setLoadingCard] = useState(false);

  const p = patient.patient || patient;

  const fetchCard = async () => {
    if (!xToken) return;
    setLoadingCard(true);
    try {
      const res = await api.get(`/abha/card?xToken=${encodeURIComponent(xToken)}`);
      if (res.image) setCardImg(`data:${res.mimeType};base64,${res.image}`);
    } catch { /* card is optional */ }
    finally { setLoadingCard(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Success banner */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Check size={16} color="#16a34a" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>
          {patient.created ? 'New patient registered successfully!' : 'Patient fetched successfully!'}
        </span>
      </div>

      {/* Patient info card */}
      <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>
            {p.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{p.name || 'Unknown'}</p>
            {p.abha_number && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7c3aed', fontFamily: 'monospace' }}>ABHA: {p.abha_number}</p>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
          {p.mobile      && <InfoRow label="Mobile"       value={p.mobile} />}
          {p.gender      && <InfoRow label="Gender"       value={p.gender} />}
          {p.dob         && <InfoRow label="DOB"          value={p.dob} />}
          {p.abha_address && <InfoRow label="ABHA Address" value={p.abha_address} />}
        </div>
      </div>

      {/* ABHA Card image */}
      {xToken && !cardImg && (
        <button style={{ ...ghostBtn, fontSize: 12 }} onClick={fetchCard} disabled={loadingCard}>
          {loadingCard ? 'Loading ABHA Card…' : '📋 View ABHA Card'}
        </button>
      )}
      {cardImg && (
        <img src={cardImg} alt="ABHA Card" style={{ width: '100%', borderRadius: 10, border: '1px solid #e2e8f0' }} />
      )}

      {/* Book appointment */}
      <button style={primaryBtn(false)} onClick={() => onSuccess(p)}>
        Book Appointment →
      </button>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#1e293b', fontWeight: 500 }}>{value}</p>
    </div>
  );
}

// ── NO FLOW: Create ABHA via Aadhaar ──────────────────────────────────────────
function NoFlow({ onSuccess, onClose }) {
  const [step, setStep] = useState(1); // 1=consent, 2=aadhaar-otp, 3=mobile-otp, 4=phr
  const [aadhaar, setAadhaar] = useState('');
  const [mobilePh, setMobilePh] = useState('');
  const [consent1, setConsent1] = useState(false);
  const [consent2, setConsent2] = useState(false);
  const [otp, setOtp] = useState('');
  const [mobileOtp, setMobileOtp] = useState('');
  const [phrAddress, setPhrAddress] = useState('');
  const [txnId, setTxnId] = useState('');
  const [xToken, setXToken] = useState('');
  const [linkedMobile, setLinkedMobile] = useState('');
  const [abdmProfile, setAbdmProfile] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [createdPatient, setCreatedPatient] = useState(null);
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    const clean = aadhaar.replace(/\D/g, '');
    if (clean.length !== 12) return toast.error('Enter valid 12-digit Aadhaar');
    if (!mobilePh.trim() || !/^\d{10}$/.test(mobilePh.trim())) return toast.error('Enter valid 10-digit mobile');
    if (!consent1 || !consent2) return toast.error('Please accept both consents to proceed');
    setLoading(true);
    try {
      const res = await api.post('/abha/aadhaar-otp', { aadhaar: clean });
      setTxnId(res.txnId || res.transactionId || '');
      setStep(2);
      toast.success('OTP sent to Aadhaar-linked mobile');
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const verifyAadhaarOtp = async () => {
    if (!otp.trim()) return toast.error('Enter OTP');
    setLoading(true);
    try {
      const res = await api.post('/abha/aadhaar-verify', { otp, txnId });
      setTxnId(res.txnId || res.transactionId || txnId);
      setXToken(res.tokens?.token || res.xToken || '');
      setLinkedMobile(res.mobileNumber || res.mobile || mobilePh);
      setAbdmProfile(res.ABHAProfile || res.profile || res);
      setStep(3);
      toast.success('Aadhaar verified');
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const sendMobileOtp = async () => {
    setLoading(true);
    try {
      const res = await api.post('/abha/aadhaar-mobile-otp', { txnId });
      setTxnId(res.txnId || res.transactionId || txnId);
      toast.success('OTP sent to mobile');
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const verifyMobileOtp = async () => {
    if (!mobileOtp.trim()) return toast.error('Enter mobile OTP');
    setLoading(true);
    try {
      const res = await api.post('/abha/aadhaar-mobile-verify', { otp: mobileOtp, txnId });
      const newXToken = res.tokens?.token || res.xToken || xToken;
      setTxnId(res.txnId || res.transactionId || txnId);
      setXToken(newXToken);
      const sugRes = await api.post('/abha/aadhaar-suggestions', { xToken: newXToken, txnId: res.txnId || txnId });
      setSuggestions(sugRes.abhaAddressList || sugRes.suggestions || []);
      setStep(4);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const createAbha = async () => {
    if (!phrAddress.trim()) return toast.error('Enter PHR address');
    setLoading(true);
    try {
      await api.post('/abha/aadhaar-set-address', { xToken, abhaAddress: phrAddress.trim(), txnId });
      const res = await api.post('/abha/aadhaar-finalize', { abdmProfile, abhaAddress: phrAddress.trim() });
      setCreatedPatient({ ...(res.patient || res), created: true });
      setStep(5);
      toast.success('ABHA created successfully!');
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const STEPS = ['Verify OTP', 'Mobile OTP', 'ABHA Address'];

  // Step 5: success
  if (step === 5 && createdPatient) {
    return <PatientCard patient={createdPatient} onSuccess={onSuccess} xToken={xToken} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {step > 1 && <StepBadges steps={STEPS} current={step} />}

      {/* Step 1: Consent + Aadhaar + Mobile */}
      {step === 1 && (
        <>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Aadhaar Number</label>
            <input style={inp} placeholder="12-digit Aadhaar" value={aadhaar}
              onChange={e => setAadhaar(e.target.value)} maxLength={14} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Mobile Number</label>
            <input style={inp} placeholder="10-digit mobile" value={mobilePh}
              onChange={e => setMobilePh(e.target.value)} maxLength={10} />
          </div>

          {/* Patient consent */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
            <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: 13, color: '#1e293b' }}>Patient Consent for ABHA Creation</p>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
              I voluntarily consent to the creation of my Ayushman Bharat Health Account (ABHA) under the Ayushman Bharat Digital Mission (ABDM). I understand that:
            </p>
            <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 12, color: '#475569', lineHeight: 1.8 }}>
              <li>My ABHA is a unique health identifier that enables digital access to my health records.</li>
              <li>My demographic information may be used for creating and verifying my ABHA.</li>
              <li>Health records linked to my ABHA can only be shared with healthcare providers based on my explicit consent.</li>
              <li>I can review, manage, grant, deny, or revoke consent at any time through ABDM-compliant applications.</li>
              <li>Creation of an ABHA is voluntary and I may choose not to create one.</li>
            </ul>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#475569' }}>
              By proceeding, I confirm that I have read and understood the above and provide my consent for ABHA creation.
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={consent1} onChange={e => setConsent1(e.target.checked)}
                style={{ marginTop: 2, accentColor: '#7c3aed', width: 15, height: 15, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#1e293b', fontWeight: 600 }}>I, the patient, give my consent for ABHA creation</span>
            </label>
          </div>

          {/* Health worker declaration */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
            <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: 13, color: '#1e293b' }}>Health Worker Declaration</p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={consent2} onChange={e => setConsent2(e.target.checked)}
                style={{ marginTop: 2, accentColor: '#7c3aed', width: 15, height: 15, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#1e293b' }}>I declare that I have informed the patient about ABHA creation and obtained their verbal consent to proceed on their behalf.</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button style={ghostBtn} onClick={onClose}>Cancel</button>
            <button style={primaryBtn(!consent1 || !consent2 || loading)} onClick={sendOtp}
              disabled={!consent1 || !consent2 || loading}>
              {loading ? 'Sending OTP…' : 'Send OTP'}
            </button>
          </div>
        </>
      )}

      {/* Step 2: Verify Aadhaar OTP */}
      {step === 2 && (
        <>
          <div style={infoBox}><AlertCircle size={14} style={{ flexShrink: 0 }} /> OTP sent to Aadhaar-linked mobile number</div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Aadhaar OTP</label>
            <input style={inp} placeholder="6-digit OTP" value={otp}
              onChange={e => setOtp(e.target.value.slice(0, 6))} maxLength={6} />
          </div>
          <button style={primaryBtn(loading)} onClick={verifyAadhaarOtp} disabled={loading}>
            {loading ? 'Verifying…' : 'Verify OTP'}
          </button>
        </>
      )}

      {/* Step 3: Mobile OTP */}
      {step === 3 && (
        <>
          {linkedMobile && (
            <div style={infoBox}><AlertCircle size={14} style={{ flexShrink: 0 }} />
              Mobile linked to ABHA: <strong style={{ marginLeft: 4 }}>{linkedMobile}</strong>
            </div>
          )}
          <button style={{ ...ghostBtn, background: '#f0fdf4', borderColor: '#86efac', color: '#166534' }}
            onClick={sendMobileOtp} disabled={loading}>
            {loading ? 'Sending…' : 'Send Mobile OTP'}
          </button>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Mobile OTP</label>
            <input style={inp} placeholder="6-digit OTP" value={mobileOtp}
              onChange={e => setMobileOtp(e.target.value.slice(0, 6))} maxLength={6} />
          </div>
          <button style={primaryBtn(loading || !mobileOtp)} onClick={verifyMobileOtp}
            disabled={loading || !mobileOtp}>
            {loading ? 'Verifying…' : 'Verify Mobile OTP'}
          </button>
        </>
      )}

      {/* Step 4: PHR / ABHA Address */}
      {step === 4 && (
        <>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>PHR Address (ABHA Address)</label>
            <div style={{ position: 'relative' }}>
              <input style={{ ...inp, paddingRight: 56 }} placeholder="yourname"
                value={phrAddress}
                onChange={e => setPhrAddress(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ''))} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#94a3b8', pointerEvents: 'none' }}>@abdm</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>8–18 chars · letters, numbers, dot, underscore</p>
          </div>
          {suggestions.length > 0 && (
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: '#64748b', fontWeight: 600 }}>Suggestions:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {suggestions.slice(0, 6).map(sg => {
                  const val = sg.replace('@abdm', '');
                  return (
                    <button key={sg} onClick={() => setPhrAddress(val)}
                      style={{ padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${phrAddress === val ? '#7c3aed' : '#e2e8f0'}`, background: phrAddress === val ? '#f3e8ff' : '#fff', color: '#475569', fontSize: 11, cursor: 'pointer' }}>
                      {sg}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <button style={primaryBtn(loading || !phrAddress)} onClick={createAbha}
            disabled={loading || !phrAddress}>
            {loading ? 'Creating ABHA…' : 'Create ABHA'}
          </button>
        </>
      )}
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────
export default function AddPatientAbhaFlow({ onClose, onSuccess }) {
  const [registered, setRegistered] = useState(null); // null | true | false

  const handleSuccess = (patient) => {
    if (onSuccess) onSuccess(patient);
    else onClose?.();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', position: 'relative' }}>
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Fingerprint size={20} color="#7c3aed" />
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Add Patient via ABHA</h2>
          </div>
          <button onClick={() => onClose?.()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Step 0: Registered? */}
          {registered === null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                Is the patient already registered with ABHA?
              </p>
              {[
                { val: true,  title: 'Yes', desc: 'Patient already has an ABHA number or mobile registered' },
                { val: false, title: 'No',  desc: 'Create a new ABHA for this patient using Aadhaar' },
              ].map(({ val, title, desc }) => (
                <button key={title} onClick={() => setRegistered(val)}
                  style={{ padding: '14px 18px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{title}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{desc}</p>
                  </div>
                  <ChevronRight size={18} color="#94a3b8" />
                </button>
              ))}
            </div>
          )}

          {registered === true && (
            <>
              <button onClick={() => setRegistered(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: 12, fontWeight: 600, padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: 4 }}>
                ← Back
              </button>
              <YesFlow onSuccess={handleSuccess} onClose={onClose} />
            </>
          )}

          {registered === false && (
            <>
              <button onClick={() => setRegistered(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: 12, fontWeight: 600, padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: 4 }}>
                ← Back
              </button>
              <NoFlow onSuccess={handleSuccess} onClose={onClose} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
