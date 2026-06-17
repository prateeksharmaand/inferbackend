import { useState, useRef, useEffect } from 'react';
import { AlertCircle, Check, ChevronRight, QrCode, Smartphone, CreditCard, Fingerprint, Camera, Upload } from 'lucide-react';
import jsQR from 'jsqr';
import BookSlotModal from './BookSlotModal';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

// ── Shared styles ──────────────────────────────────────────────────────────────
const inp = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const primaryBtn = (disabled) => ({ width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: disabled ? '#c4b5fd' : '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer' });
const ghostBtn = { width: '100%', padding: '10px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const infoBox = { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1d4ed8', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 14 };

// Step indicator matching screenshot style
function StepBadges({ steps, current, startAt = 2 }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const idx = i + startAt;
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

// ── QR decode helper (same logic as AbhaQrScan page) ──────────────────────
function decodeAbhaQr(text) {
  try {
    const json = JSON.parse(text);
    if (json.hidn || json.abhaNumber || json.abhaAddress || json.hid) {
      return {
        abhaNumber:  json.hidn || json.abhaNumber || json.abha_number || '',
        abhaAddress: json.hid  || json.abhaAddress || json.abha_address || '',
        name:    json.name || [json.firstName, json.lastName].filter(Boolean).join(' ') || '',
        gender:  json.gender || '',
        dob:     json.dob || json.dateOfBirth || '',
        mobile:  json.mobile || json.phone || '',
        address: json.address || '',
      };
    }
  } catch {
    const parts = text.split('|').map(s => s.trim());
    if (parts.length >= 2) {
      return { abhaNumber: parts[0], abhaAddress: parts[1], name: parts[2] || '', gender: parts[3] || '', dob: parts[4] || '', mobile: parts[5] || '', address: '' };
    }
  }
  return null;
}

// ── Scan QR sub-component ──────────────────────────────────────────────────
function ScanQrTab({ onSuccess }) {
  const [mode, setMode] = useState('choice'); // choice | camera | done
  const [loading, setLoading] = useState(false);
  const [patient, setPatient] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopCamera(), []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setMode('camera');
      // wait for videoRef to mount
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 100);
    } catch (err) { toast.error('Camera access denied: ' + err.message); }
  };

  useEffect(() => {
    if (mode !== 'camera') return;
    const interval = setInterval(() => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, canvas.width, canvas.height);
      if (code) {
        const data = decodeAbhaQr(code.data);
        if (data) { stopCamera(); handleScanned(data); }
      }
    }, 300);
    return () => clearInterval(interval);
  }, [mode]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        const imageData = canvas.getContext('2d').getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, img.width, img.height);
        if (code) {
          const data = decodeAbhaQr(code.data);
          if (data) { handleScanned(data); return; }
        }
        toast.error('No valid ABHA QR found in image');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleScanned = async (data) => {
    stopCamera();
    setLoading(true);
    try {
      const res = await api.post('/patients/register-abha', {
        abhaNumber: data.abhaNumber, abhaAddress: data.abhaAddress,
        name: data.name, gender: data.gender, dob: data.dob,
        phoneNumber: data.mobile, address: data.address,
      });
      setPatient(res);
      setMode('done');
      toast.success('Patient registered!');
    } catch (err) { toast.error(err.message); setMode('choice'); }
    finally { setLoading(false); }
  };

  if (mode === 'done' && patient) return <PatientCard patient={patient} onSuccess={onSuccess} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Camera view */}
      {mode === 'camera' && (
        <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
          <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxHeight: 260, display: 'block' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: 160, height: 160, border: '3px solid #7c3aed', borderRadius: 12, boxShadow: '0 0 0 2000px rgba(0,0,0,0.4)' }} />
          </div>
          <button onClick={() => { stopCamera(); setMode('choice'); }}
            style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 6, color: '#fff', padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
            Cancel
          </button>
          <p style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 12, margin: 0 }}>
            Point camera at patient's ABHA QR code
          </p>
        </div>
      )}

      {mode === 'choice' && (
        <>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />

          {/* Scan area */}
          <div style={{ border: '2px dashed #c4b5fd', borderRadius: 12, background: '#faf5ff', padding: '32px 20px', textAlign: 'center' }}>
            <QrCode size={44} color="#7c3aed" style={{ marginBottom: 16 }} />
            <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Scan Patient's ABHA Health ID Card QR</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={startCamera}
                style={{ padding: '9px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Camera size={14} /> Use Camera
              </button>
              <button onClick={() => fileRef.current?.click()}
                style={{ padding: '9px 20px', background: '#fff', color: '#7c3aed', border: '1.5px solid #7c3aed', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Upload size={14} /> Upload QR Image
              </button>
            </div>
          </div>

          {/* Info steps */}
          <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#475569' }}>How it works</p>
            {[
              { step: '1', text: 'Ask the patient to show their ABHA Health ID card or the ABHA app QR code.' },
              { step: '2', text: 'Use camera to scan live, or upload a photo of the QR code.' },
              { step: '3', text: 'Patient details will be auto-fetched and pre-filled for registration.' },
            ].map(({ step, text }) => (
              <div key={step} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: step === '3' ? 0 : 8 }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#ede9fe', color: '#7c3aed', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{step}</span>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{text}</p>
              </div>
            ))}
          </div>

          {/* Supported formats */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['ABHA Health ID Card QR', 'ABHA Mobile App QR', 'Aadhaar-linked ABHA QR'].map(tag => (
              <span key={tag} style={{ padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', fontSize: 11, color: '#64748b', fontWeight: 500 }}>✓ {tag}</span>
            ))}
          </div>
        </>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 13, color: '#7c3aed', fontWeight: 600 }}>
          Registering patient…
        </div>
      )}
    </div>
  );
}

// ── Share Profile tab: show QR + auto-register when patient scans ────────────
function ShareProfileTab({ onSuccess, hipId }) {
  const [status, setStatus] = useState('waiting'); // waiting | registering | done
  const [patient, setPatient] = useState(null);
  const seenIds = useRef(new Set());

  useEffect(() => {
    const poll = async () => {
      try {
        const rows = await api.get('/profile-shares');
        const pending = rows.filter(r => r.status === 'pending' && !seenIds.current.has(r.id));
        if (pending.length > 0) {
          const share = pending[0];
          seenIds.current.add(share.id);
          setStatus('registering');
          const res = await api.post('/patients/register-abha', {
            abhaNumber:  share.abha_number  || '',
            abhaAddress: share.abha_address || '',
            name:        share.name         || '',
            gender:      share.gender       || '',
            dob:         share.dob          || '',
            phoneNumber: share.mobile       || '',
          });
          await api.post(`/profile-shares/${share.id}/link-patient`, { patientId: res.patientId || res.patient?.id });
          setPatient(res);
          setStatus('done');
          toast.success('Patient registered from shared profile!');
        }
      } catch { /* silent */ }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, []);

  if (status === 'done' && patient) return <PatientCard patient={patient} onSuccess={onSuccess} />;

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={infoBox}><AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Ask patient to open ABDM PHR app → tap <strong>Scan & Share</strong> → scan this QR. Profile will be auto-registered.</span>
      </div>
      <div style={{ margin: '16px auto', display: 'inline-block', padding: 16, border: '2px solid #e2e8f0', borderRadius: 12 }}>
        <QRCodeSVG value="https://phrsbx.abdm.gov.in/share-profile?hip-id=noushealthhip&counter-id=12345" size={170} level="M" />
      </div>
      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>HIP ID: <strong>{hipId}</strong></p>
      {status === 'waiting' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: '#94a3b8' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
          Waiting for patient to scan…
        </div>
      )}
      {status === 'registering' && (
        <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>Profile received! Registering patient…</div>
      )}
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
          <QrCode size={13} /> Scan Health ID
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
      {tab === 'share' && <ShareProfileTab onSuccess={onSuccess} hipId={hipId} />}

      {/* Scan QR tab */}
      {tab === 'qr' && <ScanQrTab onSuccess={onSuccess} />}
    </div>
  );
}

// ── Patient detail card shown after fetch/creation ─────────────────────────
function PatientCard({ patient, onSuccess, xToken }) {
  const [cardImg, setCardImg] = useState(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [showBook, setShowBook] = useState(false);

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
    <>
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
            {p.mobile       && <InfoRow label="Mobile"       value={p.mobile} />}
            {p.gender       && <InfoRow label="Gender"       value={p.gender} />}
            {p.dob          && <InfoRow label="DOB"          value={p.dob} />}
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
        <button style={primaryBtn(false)} onClick={() => setShowBook(true)}>
          Book Appointment →
        </button>
      </div>

      {showBook && (
        <BookSlotModal
          prefill={{
            patient_name:   p.name   || '',
            patient_mobile: p.mobile || '',
            patient_dob:    p.dob    || '',
            patient_gender: p.gender || '',
            patient_abha:   p.abha_number || p.abha_address || '',
          }}
          onClose={() => setShowBook(false)}
          onBooked={() => { setShowBook(false); onSuccess?.(p); }}
        />
      )}
    </>
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
      const res = await api.post('/abha/aadhaar-verify', { otp, txnId, mobile: mobilePh.trim() });
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

  const STEPS = ['Aadhaar OTP', 'Verify OTP', 'Mobile OTP'];

  // Step 5: success
  if (step === 5 && createdPatient) {
    return <PatientCard patient={createdPatient} onSuccess={onSuccess} xToken={xToken} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {step > 1 && <StepBadges steps={STEPS} current={step} startAt={1} />}

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
          <div style={{ border: `1.5px solid ${consent1 ? '#7c3aed' : '#e2e8f0'}`, borderRadius: 10, padding: 16, background: consent1 ? '#faf5ff' : '#fff', transition: 'all 0.2s' }}>
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
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#475569' }}>
              By proceeding, I confirm that I have read and understood the above and provide my consent for ABHA creation.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: consent1 ? '#ede9fe' : '#f8fafc', borderRadius: 8, padding: '10px 12px', border: `1px solid ${consent1 ? '#c4b5fd' : '#e2e8f0'}` }}>
              <input type="checkbox" checked={consent1} onChange={e => setConsent1(e.target.checked)}
                style={{ accentColor: '#7c3aed', width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />
              <span style={{ fontSize: 12, color: '#1e293b', fontWeight: 600 }}>I, the patient, give my consent for ABHA creation</span>
            </label>
          </div>

          {/* Health worker declaration */}
          <div style={{ border: `1.5px solid ${consent2 ? '#7c3aed' : '#e2e8f0'}`, borderRadius: 10, padding: 16, background: consent2 ? '#faf5ff' : '#fff', transition: 'all 0.2s' }}>
            <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: 13, color: '#1e293b' }}>Health Worker Declaration</p>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
              I declare that I have informed the patient about ABHA creation and obtained their verbal consent to proceed on their behalf.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: consent2 ? '#ede9fe' : '#f8fafc', borderRadius: 8, padding: '10px 12px', border: `1px solid ${consent2 ? '#c4b5fd' : '#e2e8f0'}` }}>
              <input type="checkbox" checked={consent2} onChange={e => setConsent2(e.target.checked)}
                style={{ accentColor: '#7c3aed', width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />
              <span style={{ fontSize: 12, color: '#1e293b', fontWeight: 600 }}>I confirm the above declaration</span>
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

      {/* Step 4: Choose ABHA Address */}
      {step === 4 && (
        <>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Choose ABHA Address</p>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#475569' }}>Suggested addresses:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {suggestions.slice(0, 6).map(sg => {
                  const val = sg.replace('@abdm', '').replace('@sbx', '');
                  return (
                    <button key={sg} onClick={() => setPhrAddress(val)}
                      style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${phrAddress === val ? '#7c3aed' : '#e2e8f0'}`, background: phrAddress === val ? '#f3e8ff' : '#fff', color: phrAddress === val ? '#7c3aed' : '#475569', fontSize: 12, fontWeight: phrAddress === val ? 600 : 400, cursor: 'pointer' }}>
                      {sg}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* No suggestions warning */}
          {suggestions.length === 0 && (
            <p style={{ margin: 0, fontSize: 12, color: '#d97706', fontWeight: 500 }}>
              Could not load suggestions — please enter a custom address below.
            </p>
          )}

          {/* Custom address input */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              {suggestions.length > 0 ? 'Or create a custom ABHA address' : 'Or create a custom ABHA address'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                style={{ ...inp, paddingRight: 52 }}
                placeholder="e.g. prateek.sharma"
                value={phrAddress}
                onChange={e => setPhrAddress(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
              />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#94a3b8', fontWeight: 500, pointerEvents: 'none' }}>@sbx</span>
            </div>
          </div>

          {/* Rules box */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#374151' }}>ABHA Address Rules:</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#475569', lineHeight: 1.8 }}>
              <li>8–18 characters (letters, numbers, or a combination)</li>
              <li>At most one dot <strong>.</strong> and/or one underscore <strong>_</strong> allowed</li>
              <li>Dot or underscore must not be at the start or end</li>
              <li>No other special characters allowed</li>
            </ul>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={ghostBtn} onClick={onClose}>Cancel</button>
            <button style={primaryBtn(loading || !phrAddress)} onClick={createAbha}
              disabled={loading || !phrAddress}>
              {loading ? 'Creating ABHA…' : 'Confirm ABHA Address'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Component (fullPage or modal) ────────────────────────────────────────
export default function AddPatientAbhaFlow({ onClose, onSuccess, fullPage = false }) {
  const [registered, setRegistered] = useState(null); // null | true | false

  const handleSuccess = (patient) => {
    if (onSuccess) onSuccess(patient);
    else onClose?.();
  };

  // Header back action: page-level back (to previous page) OR step-level back (to Yes/No selector)
  const headerBackLabel = registered !== null ? 'Back' : fullPage ? 'Back' : null;
  const headerBackAction = registered !== null ? () => setRegistered(null) : onClose;

  const inner = (
    <>
      {/* Single unified header */}
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#fff', position: 'sticky', top: 0, zIndex: 10,
        width: '100%', boxSizing: 'border-box',
      }}>
        {(fullPage || registered !== null) && (
          <button onClick={headerBackAction}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 13, padding: '6px 0', flexShrink: 0 }}>
            ← {headerBackLabel}
          </button>
        )}
        <div style={{ width: 1, height: 20, background: '#e2e8f0', display: (fullPage || registered !== null) ? 'block' : 'none' }} />
        <Fingerprint size={18} color="#7c3aed" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {registered === true ? 'Registered with ABHA' : registered === false ? 'Create ABHA via Aadhaar' : 'Add Patient via ABHA'}
          </h2>
          <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>
            {registered === true ? 'Fetch patient using ABHA number, mobile, QR or profile share'
              : registered === false ? 'New ABHA creation using Aadhaar number'
              : 'Register a new patient using their ABHA'}
          </p>
        </div>
        {!fullPage && <button onClick={() => onClose?.()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>}
      </div>

      {/* Scrollable content */}
      <div style={{ padding: '24px', flex: 1, boxSizing: 'border-box', width: '100%' }}>
        {/* Step 0: Registered? */}
        {registered === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
              Is the patient already registered with ABHA?
            </p>
            {[
              { val: true,  title: 'Yes', desc: 'Patient already has an ABHA number, mobile, or ABHA card' },
              { val: false, title: 'No',  desc: 'Create a new ABHA for this patient using Aadhaar' },
            ].map(({ val, title, desc }) => (
              <button key={title} onClick={() => setRegistered(val)}
                style={{ padding: '16px 18px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', transition: 'border-color 0.15s' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{title}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>{desc}</p>
                </div>
                <ChevronRight size={18} color="#94a3b8" style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}

        {registered === true  && <YesFlow onSuccess={handleSuccess} onClose={onClose} />}
        {registered === false && <NoFlow onSuccess={handleSuccess} onClose={onClose} />}
      </div>
    </>
  );

  if (fullPage) {
    return (
      <div style={{ height: '100%', minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
          {inner}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 500, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {inner}
      </div>
    </div>
  );
}
