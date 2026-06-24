import { useState, useRef, useEffect } from 'react';
import { AlertCircle, Check, ChevronRight, QrCode, Smartphone, CreditCard, Fingerprint, Camera, Upload } from 'lucide-react';
import jsQR from 'jsqr';
import BookSlotModal from './BookSlotModal';
import BookAppointmentModal from './BookAppointmentModal';
import ServiceTypeSelector from './ServiceTypeSelector';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

// ── Global animation styles injected once ─────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('abha-flow-styles')) {
  const s = document.createElement('style');
  s.id = 'abha-flow-styles';
  s.textContent = `
    @keyframes abhaFadeIn  { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    @keyframes abhaSlideIn { from { opacity:0; transform:translateX(18px);} to { opacity:1; transform:translateX(0); } }
    @keyframes abhaPulse   { 0%,100%{transform:scale(1);opacity:1;} 50%{transform:scale(1.25);opacity:.6;} }
    @keyframes abhaFloat   { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-6px);} }
    @keyframes abhaSpinner { to { transform:rotate(360deg); } }
    @keyframes abhaBounce  { 0%,100%{transform:translateY(0);} 40%{transform:translateY(-8px);} 70%{transform:translateY(-4px);} }
    @keyframes abhaShimmer { 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }
    .abha-fade-in  { animation: abhaFadeIn  0.28s ease both; }
    .abha-slide-in { animation: abhaSlideIn 0.24s ease both; }
    .abha-float    { animation: abhaFloat   3s ease-in-out infinite; }
    .abha-option:hover { border-color: #7c3aed !important; background: #faf5ff !important; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(124,58,237,.12); }
    .abha-option { transition: all 0.18s ease; }
    .abha-tab-btn:hover { color: #7c3aed !important; }
  `;
  document.head.appendChild(s);
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const inp = { width: '100%', padding: '11px 14px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s', fontFamily: 'inherit' };
const primaryBtn = (disabled) => ({ width: '100%', padding: '12px', borderRadius: 9, border: 'none', background: disabled ? '#c4b5fd' : 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer', boxShadow: disabled ? 'none' : '0 2px 8px rgba(124,58,237,.35)', transition: 'opacity 0.15s' });
const ghostBtn = { width: '100%', padding: '11px', borderRadius: 9, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'border-color 0.15s' };
const infoBox = { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 9, padding: '10px 14px', fontSize: 12, color: '#1d4ed8', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 14 };
const fieldLabel = { fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, letterSpacing: 0.2 };

// ── 6-box OTP input ───────────────────────────────────────────────────────────
function OtpBoxes({ value, onChange, autoFocus }) {
  const r0 = useRef(null), r1 = useRef(null), r2 = useRef(null);
  const r3 = useRef(null), r4 = useRef(null), r5 = useRef(null);
  const refs = [r0, r1, r2, r3, r4, r5];
  const digits = value.padEnd(6, '').split('').slice(0, 6);

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        onChange(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        refs[i - 1].current?.focus();
        onChange(value.slice(0, i - 1) + value.slice(i));
      }
      return;
    }
    if (e.key === 'ArrowLeft' && i > 0) { refs[i - 1].current?.focus(); return; }
    if (e.key === 'ArrowRight' && i < 5) { refs[i + 1].current?.focus(); return; }
  };

  const handleChange = (i, e) => {
    const ch = e.target.value.replace(/\D/g, '').slice(-1);
    if (!ch) return;
    const arr = digits.slice();
    arr[i] = ch;
    onChange(arr.join('').replace(/ /g, ''));
    if (i < 5) setTimeout(() => refs[i + 1].current?.focus(), 0);
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text) { onChange(text); setTimeout(() => refs[Math.min(text.length, 5)].current?.focus(), 0); }
    e.preventDefault();
  };

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] !== ' ' ? digits[i] : ''}
          autoFocus={autoFocus && i === 0}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          style={{
            width: 44, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 700,
            borderRadius: 10, border: `2px solid ${digits[i] && digits[i] !== ' ' ? '#7c3aed' : '#e2e8f0'}`,
            background: digits[i] && digits[i] !== ' ' ? '#faf5ff' : '#f8fafc',
            color: '#1e293b', outline: 'none', caretColor: 'transparent',
            boxShadow: digits[i] && digits[i] !== ' ' ? '0 0 0 3px rgba(124,58,237,.12)' : 'none',
            transition: 'all 0.15s',
          }}
        />
      ))}
    </div>
  );
}

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
function ShareProfileTab({ onSuccess }) {
  const [status, setStatus] = useState('waiting'); // waiting | registering | done
  const [patient, setPatient] = useState(null);
  const [clinicAbdm, setClinicAbdm] = useState(null);
  const seenIds = useRef(new Set());

  useEffect(() => {
    api.get('/clinic-settings/abdm').then(setClinicAbdm).catch(() => {});
  }, []);

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

  const hipId   = clinicAbdm?.hip_id   || '';
  const clinicName = clinicAbdm?.hip_name || null;
  const qrUrl   = `https://phrsbx.abdm.gov.in/share-profile?hip-id=${encodeURIComponent(hipId)}&counter-id=12345`;

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={infoBox}><AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Ask patient to open ABDM PHR app → tap <strong>Scan & Share</strong> → scan this QR. Profile will be auto-registered.</span>
      </div>

      {/* QR card with elevation */}
      <div style={{
        margin: '16px auto',
        display: 'inline-block',
        padding: '20px 24px 16px',
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 10px 30px -4px rgba(0,0,0,0.10)',
        border: '1px solid #f1f5f9',
      }}>
        <QRCodeSVG value={qrUrl} size={170} level="M" />
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
          {clinicName
            ? <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{clinicName}</p>
            : <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{hipId}</p>
          }
        </div>
      </div>

      {status === 'waiting' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: '#94a3b8' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed', display: 'inline-block', animation: 'abhaPulse 1.5s ease-in-out infinite' }} />
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
  const hipId = '';

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
        <div className="abha-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460, margin: '0 auto', width: '100%' }}>
          <div style={{ background: 'linear-gradient(135deg,#faf5ff,#ede9fe)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <CreditCard size={20} color="#7c3aed" style={{ flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#5b21b6' }}>Enter one of the following</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7c3aed' }}>ABHA number OR registered mobile — not both</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={fieldLabel}>ABHA Number</label>
              <input style={{ ...inp, borderColor: abhaInput ? '#7c3aed' : '#e2e8f0' }} placeholder="91-XXXX-XXXX-XXXX"
                value={abhaInput} onChange={e => { setAbhaInput(e.target.value); if (e.target.value) setMobile(''); }} />
            </div>
            <div>
              <label style={fieldLabel}>Mobile Number</label>
              <input style={{ ...inp, borderColor: mobile ? '#7c3aed' : '#e2e8f0' }} placeholder="10-digit mobile"
                value={mobile} onChange={e => { setMobile(e.target.value); if (e.target.value) setAbhaInput(''); }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button style={{ ...ghostBtn, width: 'auto', padding: '11px 24px' }} onClick={onClose}>Cancel</button>
            <button style={{ ...primaryBtn(loading || (!abhaInput.trim() && !mobile.trim())), width: 'auto', padding: '11px 32px' }} onClick={requestOtp} disabled={loading || (!abhaInput.trim() && !mobile.trim())}>
              {loading ? '⏳ Sending OTP…' : 'Send OTP →'}
            </button>
          </div>
        </div>
      )}

      {/* ABHA tab - Step 2: Verify OTP */}
      {tab === 'abha' && step === 2 && (
        <div className="abha-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#ede9fe,#ddd6fe)', marginBottom: 10 }}>
              <span style={{ fontSize: 26 }}>📱</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Check your phone</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>OTP sent to your registered mobile number</p>
          </div>
          <OtpBoxes value={otp} onChange={setOtp} autoFocus />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button style={{ ...ghostBtn, width: 'auto', padding: '11px 24px' }} onClick={() => setStep(1)}>← Back</button>
            <button style={{ ...primaryBtn(loading || otp.length < 6), width: 'auto', padding: '11px 32px' }} onClick={verifyOtp} disabled={loading || otp.length < 6}>
              {loading ? '⏳ Verifying…' : 'Verify & Fetch →'}
            </button>
          </div>
        </div>
      )}

      {/* ABHA tab - Step 3: Success */}
      {tab === 'abha' && step === 3 && patient && (
        <PatientCard patient={patient} onSuccess={onSuccess} />
      )}

      {/* Share Profile tab */}
      {tab === 'share' && <ShareProfileTab onSuccess={onSuccess} />}

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
  const [showAddToClinic, setShowAddToClinic] = useState(false);
  const [showServiceType, setShowServiceType] = useState(false);
  const [selectedServiceType, setSelectedServiceType] = useState(null);
  const [currentVisit, setCurrentVisit] = useState(null);

  const p = patient.patient || patient;
  // Check if patient is new to this clinic (no UHID assigned means new to clinic)
  const isNewToClinic = p.id && !p.uhid;

  const fetchCard = async () => {
    if (!xToken) return;
    setLoadingCard(true);
    try {
      const res = await api.get(`/abha/card?xToken=${encodeURIComponent(xToken)}`);
      if (res.image) setCardImg(`data:${res.mimeType};base64,${res.image}`);
    } catch { /* card is optional */ }
    finally { setLoadingCard(false); }
  };

  // Auto-fetch card immediately when xToken is available
  useEffect(() => { if (xToken) fetchCard(); }, [xToken]);


  return (
    <>
      <div className="abha-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Success banner */}
        <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Check size={16} color="#fff" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#166534' }}>
              {patient.created ? '🎉 New patient registered!' : '✓ Patient found'}
            </p>
            <p style={{ margin: '1px 0 0', fontSize: 11, color: '#15803d' }}>Health record linked to ABHA</p>
          </div>
        </div>

        {/* Patient info card */}
        <div style={{ background: 'linear-gradient(135deg,#faf5ff 0%,#f5f3ff 100%)', borderRadius: 12, padding: 18, border: '1.5px solid #e9d5ff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', flexShrink: 0, boxShadow: '0 4px 12px rgba(124,58,237,.3)' }}>
              {p.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: '#1e293b' }}>{p.name || 'Unknown'}</p>
              {p.abha_number && <p style={{ margin: '3px 0 0', fontSize: 11, color: '#7c3aed', fontFamily: 'monospace', background: '#ede9fe', display: 'inline-block', padding: '1px 8px', borderRadius: 20 }}>ABHA: {p.abha_number}</p>}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', background: '#fff', borderRadius: 8, padding: '12px 14px', border: '1px solid #e9d5ff' }}>
            {p.mobile       && <InfoRow label="Mobile"       value={p.mobile} />}
            {p.gender       && <InfoRow label="Gender"       value={p.gender} />}
            {p.dob          && <InfoRow label="DOB"          value={p.dob} />}
            {p.abha_address && <InfoRow label="ABHA Address" value={p.abha_address} />}
          </div>
        </div>

        {/* ABHA Card — auto-loaded, shimmer while fetching */}
        {xToken && loadingCard && (
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e9d5ff' }}>
            <div style={{ height: 160, background: 'linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 50%,#f3f4f6 75%)', backgroundSize: '200% 100%', animation: 'abhaShimmer 1.4s infinite', borderRadius: 12 }} />
            <p style={{ margin: '8px 0', textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>Loading ABHA card…</p>
          </div>
        )}
        {cardImg && (
          <div className="abha-fade-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.5 }}>ABHA Health Card</p>
              <a
                href={cardImg}
                download={`ABHA-${p.abha_number || p.name || 'card'}.png`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, background: '#7c3aed', color: '#fff', fontSize: 11, fontWeight: 700, textDecoration: 'none', boxShadow: '0 2px 6px rgba(124,58,237,.3)' }}
              >
                ⬇ Download
              </a>
            </div>
            <img src={cardImg} alt="ABHA Card" style={{ width: '100%', borderRadius: 12, border: '1.5px solid #e9d5ff', boxShadow: '0 4px 16px rgba(124,58,237,.15)' }} />
          </div>
        )}

        {/* Show service type selector */}
        <button style={primaryBtn(false)} onClick={() => setShowServiceType(true)}>
          Continue to Clinic Visit →
        </button>
      </div>

      {/* Service Type Selector */}
      {showServiceType && (
        <ServiceTypeSelector
          selectedPatientName={p.name}
          onSelect={async (serviceType) => {
            setSelectedServiceType(serviceType);
            setShowServiceType(false);

            // Create visit with service type
            try {
              const visit = await api.post('/visits', {
                patient_id: p.id,
                visit_type: serviceType,
                status: 'waiting'
              });

              setCurrentVisit(visit);

              // Route based on service type
              if (serviceType === 'consultation') {
                // For consultation, proceed to appointment booking
                if (isNewToClinic) {
                  setShowAddToClinic(true);
                } else {
                  setShowBook(true);
                }
              } else {
                // For non-consultation services, queue directly
                toast.success(`${serviceType} visit created. Patient in queue.`);
                onSuccess?.(p);
              }
            } catch (err) {
              console.error('Failed to create visit:', err);
              toast.error('Failed to create visit. Please try again.');
            }
          }}
          onCancel={() => setShowServiceType(false)}
        />
      )}

      {showAddToClinic && (
        <BookAppointmentModal
          mode="checkin"
          visitType={selectedServiceType}
          visitId={currentVisit?.id}
          prefill={{
            patient_id:     p.id     || null,
            patient_name:   p.name   || '',
            patient_mobile: p.mobile || '',
            patient_dob:    p.dob    || '',
            patient_gender: p.gender || '',
            patient_abha:   p.abha_number || p.abha_address || '',
          }}
          onClose={() => setShowAddToClinic(false)}
          onCreated={(form) => {
            setShowAddToClinic(false);
            // After adding to clinic, show book appointment
            setShowBook(true);
          }}
        />
      )}

      {showBook && !showAddToClinic && (
        <BookSlotModal
          visitType={selectedServiceType}
          visitId={currentVisit?.id}
          prefill={{
            patient_id:     p.id     || null,
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
  const [enrollTxnId, setEnrollTxnId] = useState(''); // byAadhaar txnId — passed unchanged to suggestions
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
      const newTxnId = res.txnId || res.transactionId || txnId;
      setTxnId(newTxnId);
      setEnrollTxnId(newTxnId); // preserve enrollment txnId for suggestions
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
      const res = await api.post('/abha/aadhaar-mobile-otp', { txnId, mobile: mobilePh.trim() });
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
      // always use the byAadhaar txnId for suggestions — not the mobile OTP txnId
      const sugRes = await api.post('/abha/aadhaar-suggestions', { xToken: newXToken, txnId: enrollTxnId });
      setSuggestions(sugRes.abhaAddressList || sugRes.suggestions || []);
      setStep(4);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const createAbha = async () => {
    if (!phrAddress.trim()) return toast.error('Enter PHR address');
    setLoading(true);
    try {
      await api.post('/abha/aadhaar-set-address', { xToken, abhaAddress: phrAddress.trim(), txnId: enrollTxnId });
      const res = await api.post('/abha/aadhaar-finalize', { abdmProfile, abhaAddress: phrAddress.trim() });
      setCreatedPatient({ ...(res.patient || res), created: true });
      setStep(5);
      toast.success('ABHA created successfully!');
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const STEPS = ['Aadhaar OTP', 'Verify OTP', 'Mobile OTP'];

  // Auto-send mobile OTP as soon as step 3 is entered — no manual button needed
  useEffect(() => {
    if (step === 3) sendMobileOtp();
  }, [step]);

  // Step 5: success
  if (step === 5 && createdPatient) {
    return <PatientCard patient={createdPatient} onSuccess={onSuccess} xToken={xToken} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {step > 1 && <StepBadges steps={STEPS} current={step} startAt={1} />}

      {/* Step 1: Consent + Aadhaar + Mobile */}
      {step === 1 && (
        <div style={{ maxWidth: 460, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={fieldLabel}>Aadhaar Number</label>
              <input style={{ ...inp, borderColor: aadhaar ? '#7c3aed' : '#e2e8f0' }} placeholder="12-digit Aadhaar" value={aadhaar}
                onChange={e => setAadhaar(e.target.value)} maxLength={14} />
            </div>
            <div>
              <label style={fieldLabel}>Mobile Number</label>
              <input style={{ ...inp, borderColor: mobilePh ? '#7c3aed' : '#e2e8f0' }} placeholder="10-digit mobile" value={mobilePh}
                onChange={e => setMobilePh(e.target.value)} maxLength={10} />
            </div>
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

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button style={{ ...ghostBtn, width: 'auto', padding: '11px 24px' }} onClick={onClose}>Cancel</button>
            <button style={{ ...primaryBtn(!consent1 || !consent2 || loading), width: 'auto', padding: '11px 32px' }}
              onClick={sendOtp} disabled={!consent1 || !consent2 || loading}>
              {loading ? '⏳ Sending OTP…' : 'Send OTP →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Verify Aadhaar OTP */}
      {step === 2 && (
        <div className="abha-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 400, margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#ede9fe,#ddd6fe)', marginBottom: 10 }}>
              <span style={{ fontSize: 26 }}>🔐</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Enter Aadhaar OTP</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>OTP sent to your Aadhaar-linked mobile</p>
          </div>
          <OtpBoxes value={otp} onChange={setOtp} autoFocus />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button style={{ ...ghostBtn, width: 'auto', padding: '11px 24px' }} onClick={() => setStep(1)}>← Back</button>
            <button style={{ ...primaryBtn(loading || otp.length < 6), width: 'auto', padding: '11px 32px' }} onClick={verifyAadhaarOtp} disabled={loading || otp.length < 6}>
              {loading ? '⏳ Verifying…' : 'Verify OTP →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Mobile OTP — auto-sent on enter */}
      {step === 3 && (
        <div className="abha-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 400, margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', marginBottom: 10 }}>
              <span style={{ fontSize: 26 }}>📲</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
              {loading ? 'Sending OTP…' : 'OTP sent to your mobile'}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
              {linkedMobile ? <>Sent to <strong>{linkedMobile}</strong></> : 'Check your registered mobile number'}
            </p>
          </div>
          <OtpBoxes value={mobileOtp} onChange={setMobileOtp} autoFocus />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: '11px 0' }}
              onClick={sendMobileOtp} disabled={loading}>Resend OTP</button>
            <button style={{ ...primaryBtn(loading || mobileOtp.length < 6), width: 'auto', padding: '11px 32px' }} onClick={verifyMobileOtp}
              disabled={loading || mobileOtp.length < 6}>
              {loading ? '⏳ Verifying…' : 'Verify OTP →'}
            </button>
          </div>
        </div>
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
      <div style={{ padding: '24px', flex: 1, boxSizing: 'border-box', width: '100%', maxWidth: '600px', margin: '0 auto' }}>
        {/* Step 0: Registered? */}
        {registered === null && (
          <div className="abha-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Hero illustration */}
            <div style={{ textAlign: 'center', padding: '8px 0 24px' }}>
              <div className="abha-float" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#ede9fe,#ddd6fe)', marginBottom: 14 }}>
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                  <rect x="6" y="10" width="32" height="24" rx="4" fill="#7c3aed" opacity=".15"/>
                  <rect x="10" y="14" width="24" height="16" rx="3" fill="#7c3aed" opacity=".25"/>
                  <circle cx="22" cy="20" r="5" fill="#7c3aed"/>
                  <path d="M14 30c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round"/>
                  <rect x="28" y="8" width="10" height="14" rx="2" fill="#a78bfa"/>
                  <line x1="30" y1="12" x2="36" y2="12" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="30" y1="15" x2="36" y2="15" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="30" y1="18" x2="34" y2="18" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Add Patient via ABHA</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Does the patient already have an ABHA account?</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { val: true,  emoji: '✅', title: 'Yes, has ABHA',  desc: 'Fetch using ABHA number, mobile, QR or profile share', color: '#16a34a', bg: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '#86efac' },
                { val: false, emoji: '🆕', title: 'No, create ABHA', desc: 'Create a new ABHA for this patient via Aadhaar',         color: '#7c3aed', bg: 'linear-gradient(135deg,#faf5ff,#ede9fe)', border: '#c4b5fd' },
              ].map(({ val, emoji, title, desc, color, bg, border }) => (
                <button key={title} onClick={() => setRegistered(val)} className="abha-option"
                  style={{ padding: '20px 16px', borderRadius: 12, border: `1.5px solid ${border}`, background: bg, cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
                  <span style={{ fontSize: 28 }}>{emoji}</span>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{title}</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>{desc}</p>
                  <span style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color, background: '#fff', borderRadius: 20, padding: '3px 12px', border: `1px solid ${border}` }}>Select →</span>
                </button>
              ))}
            </div>

            <div style={{ marginTop: 20, background: '#f8fafc', borderRadius: 10, padding: '12px 16px', border: '1px solid #f1f5f9' }}>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>What is ABHA?</p>
              <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                ABHA (Ayushman Bharat Health Account) is a 14-digit unique health ID issued by NHA under ABDM. It enables patients to share health records digitally across all ABDM-compliant providers.
              </p>
            </div>
          </div>
        )}

        {registered === true  && <div className="abha-slide-in"><YesFlow onSuccess={handleSuccess} onClose={onClose} /></div>}
        {registered === false && <div className="abha-slide-in"><NoFlow onSuccess={handleSuccess} onClose={onClose} /></div>}
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,10,40,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div className="abha-fade-in" style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,.32), 0 0 0 1px rgba(0,0,0,.06)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {inner}
      </div>
    </div>
  );
}
