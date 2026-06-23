import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle, Clock, User, Phone, Calendar, Hash, RefreshCw, X, CalendarPlus } from 'lucide-react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

// Live countdown timer for profile share token (1-hour window)
function ShareTokenTimer({ expiresAt, createdAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const expiry     = expiresAt ? new Date(expiresAt).getTime() : (new Date(createdAt).getTime() + 3600_000);
  const remaining  = expiry - now;
  const expired    = remaining <= 0;
  const totalMs    = 3600_000;
  const elapsed    = totalMs - Math.max(0, remaining);
  const pct        = Math.min(100, (elapsed / totalMs) * 100);
  const color      = expired ? '#dc2626' : remaining < 10 * 60000 ? '#f59e0b' : '#7c3aed';

  const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.3 }}>
          {expired ? '⚠ Expired' : '⏱ Token valid'}
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, color, fontFamily: 'monospace' }}>
          {expired ? 'Expired' : fmt(remaining)}
        </span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: '#e2e8f0' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 1s linear' }} />
      </div>
    </div>
  );
}

const inp = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const label = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 };

export default function ProfileShares() {
  const navigate = useNavigate();
  const [shares, setShares] = useState([]);
  const [clinicAbdm, setClinicAbdm] = useState(null);
  const [selected, setSelected] = useState(null); // selected share
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(null); // result after register

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get('/profile-shares');
      const pending = rows.filter(r => r.status === 'pending');
      setShares(pending);
      // Auto-select first pending if none selected
      if (!selected && pending.length > 0) {
        pick(pending[0]);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [selected]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    api.get('/clinic-settings/abdm').then(setClinicAbdm).catch(() => {});
  }, []);

  const pick = async (share) => {
    setSelected(share);
    setRegistered(null);

    // Check if patient already exists by ABHA number
    if (share.abha_number) {
      try {
        const patients = await api.get(`/patients?q=${encodeURIComponent(share.abha_number)}`);
        const existing = patients.find(p =>
          p.abha_number === share.abha_number ||
          p.abha_address === share.abha_address
        );

        if (existing && existing.uhid) {
          // Patient already registered with UHID — show quick book appointment
          setRegistered({
            patient: existing,
            message: 'Patient already registered',
            action: 'book'
          });
          return;
        }
      } catch (err) {
        // Continue with registration form if lookup fails
      }
    }

    // Show registration form for new patient
    setForm({
      name:        share.name        || '',
      mobile:      share.mobile      || '',
      dob:         share.dob         || '',
      gender:      share.gender      || '',
      abhaNumber:  share.abha_number || '',
      abhaAddress: share.abha_address|| '',
      address:     share.address     || '',
      department:  '',
      doctor:      '',
      visitType:   'OPD',
    });
  };

  const dismiss = async (share) => {
    try {
      await api.patch(`/profile-shares/${share.id}/dismiss`);
      setShares(prev => prev.filter(s => s.id !== share.id));
      if (selected?.id === share.id) { setSelected(null); setForm(null); }
      toast.success('Dismissed');
    } catch (err) { toast.error(err.message); }
  };

  const register = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    setRegistering(true);
    try {
      const res = await api.post('/patients/register-abha', {
        abhaNumber:  form.abhaNumber,
        abhaAddress: form.abhaAddress,
        name:        form.name,
        gender:      form.gender,
        dob:         form.dob,
        phoneNumber: form.mobile,
        address:     form.address,
        department:  form.department,
        doctor:      form.doctor,
        visitType:   form.visitType,
      });
      // Link share to patient
      if (selected) {
        await api.post(`/profile-shares/${selected.id}/link-patient`, { patientId: res.patientId || res.patient?.id });
      }
      setRegistered(res);
      setShares(prev => prev.filter(s => s.id !== selected?.id));
      toast.success('Patient registered!');
    } catch (err) { toast.error(err.message); }
    finally { setRegistering(false); }
  };

  const f = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: '100vh', background: '#f8fafc' }}>

      {/* ── Left panel: QR + pending list ── */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column' }}>

        {/* QR section */}
        {(() => {
          const hipId = clinicAbdm?.hip_id || '';
          const clinicName = clinicAbdm?.hip_name || null;
          const qrUrl = `https://phrsbx.abdm.gov.in/share-profile?hip-id=${encodeURIComponent(hipId)}&counter-id=12345`;
          return (
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Facility QR Code</p>
              <div style={{
                display: 'inline-block',
                padding: '16px 16px 12px',
                background: '#fff',
                borderRadius: 16,
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 10px 30px -4px rgba(0,0,0,0.10)',
                border: '1px solid #f1f5f9',
              }}>
                <QRCodeSVG value={qrUrl} size={160} level="M" />
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                  {clinicName
                    ? <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{clinicName}</p>
                    : <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{hipId}</p>
                  }
                </div>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 11, color: '#94a3b8' }}>Patient scans this with ABDM PHR app</p>
            </div>
          );
        })()}

        {/* Pending shares list */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
              PENDING PROFILES {shares.length > 0 && <span style={{ background: '#7c3aed', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, marginLeft: 4 }}>{shares.length}</span>}
            </span>
            <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }} title="Refresh">
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          {shares.length === 0 && (
            <div style={{ padding: '20px 16px', textAlign: 'center' }}>
              <Clock size={28} color="#cbd5e1" style={{ marginBottom: 8 }} />
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Waiting for patient scans…</p>
            </div>
          )}

          {shares.map(share => (
            <div key={share.id}
              onClick={() => pick(share)}
              style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: selected?.id === share.id ? '#f5f3ff' : '#fff', borderLeft: `3px solid ${selected?.id === share.id ? '#7c3aed' : 'transparent'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1e293b', truncate: true }}>{share.name || 'Unknown'}</p>
                  {share.abha_number && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7c3aed', fontFamily: 'monospace' }}>{share.abha_number}</p>}
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>{new Date(share.created_at).toLocaleTimeString()}</p>
                  <ShareTokenTimer expiresAt={share.token_expires_at} createdAt={share.created_at} />
                </div>
                <button onClick={e => { e.stopPropagation(); dismiss(share); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 2, flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel: registration form or placeholder ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>

        {/* No selection */}
        {!selected && !registered && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', gap: 12 }}>
            <User size={48} strokeWidth={1} />
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Select a profile from the left</p>
            <p style={{ fontSize: 12, margin: 0 }}>Profiles will appear here when patients scan the facility QR</p>
          </div>
        )}

        {/* Success screen */}
        {registered && (
          <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
            <CheckCircle size={56} color={registered.action === 'book' ? '#3b82f6' : '#16a34a'} style={{ marginBottom: 16 }} />
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#1e293b' }}>
              {registered.action === 'book' ? 'Patient Recognized!' : 'Patient Registered!'}
            </h2>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: '#64748b' }}>
              <strong>{registered.patient?.name || form?.name}</strong>
              {registered.action === 'book'
                ? ' is already registered. Ready to book appointment?'
                : ' has been successfully registered.'}
            </p>
            {registered.patient?.abha_number && (
              <div style={{ background: '#f5f3ff', borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'inline-block' }}>
                <p style={{ margin: 0, fontSize: 12, color: '#7c3aed', fontFamily: 'monospace' }}>ABHA: {registered.patient.abha_number}</p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => navigate(`/queue?newPatient=${registered.patientId || registered.patient?.id}`)}
                style={{ padding: '10px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CalendarPlus size={15} /> {registered.action === 'book' ? 'Book Appointment Now' : 'Book Appointment'}
              </button>
              <button
                onClick={() => { setRegistered(null); setSelected(null); setForm(null); }}
                style={{ padding: '10px 20px', background: '#fff', color: '#475569', border: '1.5px solid #e2e8f0', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                {registered.action === 'book' ? 'Back' : 'Register Another'}
              </button>
            </div>
          </div>
        )}

        {/* Registration form */}
        {form && !registered && (
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>New Patient Registration</h2>
              <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Profile shared via ABDM PHR app · Verify and register</p>
            </div>

            {/* ABHA info banner */}
            {(form.abhaNumber || form.abhaAddress) && (
              <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
                <Hash size={16} color="#7c3aed" />
                <div>
                  {form.abhaNumber  && <p style={{ margin: 0, fontSize: 12, color: '#5b21b6', fontFamily: 'monospace', fontWeight: 600 }}>ABHA Number: {form.abhaNumber}</p>}
                  {form.abhaAddress && <p style={{ margin: 0, fontSize: 12, color: '#7c3aed', marginTop: 2 }}>ABHA Address: {form.abhaAddress}</p>}
                </div>
              </div>
            )}

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Name */}
              <div>
                <label style={label}>Full Name *</label>
                <input style={inp} value={form.name} onChange={e => f('name', e.target.value)} placeholder="Patient full name" />
              </div>

              {/* Mobile + DOB */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={label}><Phone size={11} style={{ marginRight: 4 }} />Mobile Number</label>
                  <input style={inp} value={form.mobile} onChange={e => f('mobile', e.target.value)} placeholder="10-digit mobile" maxLength={10} />
                </div>
                <div>
                  <label style={label}><Calendar size={11} style={{ marginRight: 4 }} />Date of Birth</label>
                  <input style={inp} type="date" value={form.dob} onChange={e => f('dob', e.target.value)} />
                </div>
              </div>

              {/* Gender + Visit Type */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={label}>Gender</label>
                  <select style={inp} value={form.gender} onChange={e => f('gender', e.target.value)}>
                    <option value="">Select</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="O">Other</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Visit Type</label>
                  <select style={inp} value={form.visitType} onChange={e => f('visitType', e.target.value)}>
                    <option value="OPD">OPD</option>
                    <option value="IPD">IPD</option>
                    <option value="Emergency">Emergency</option>
                    <option value="Teleconsultation">Teleconsultation</option>
                  </select>
                </div>
              </div>

              {/* Address */}
              <div>
                <label style={label}>Address</label>
                <input style={inp} value={form.address} onChange={e => f('address', e.target.value)} placeholder="Patient address (optional)" />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
                <button onClick={() => dismiss(selected)}
                  style={{ padding: '10px 20px', background: '#fff', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  Dismiss
                </button>
                <button onClick={register} disabled={registering}
                  style={{ flex: 1, padding: '11px', background: registering ? '#c4b5fd' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: registering ? 'not-allowed' : 'pointer' }}>
                  {registering ? 'Registering…' : 'Register Patient'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
