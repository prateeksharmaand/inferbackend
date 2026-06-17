import { useState } from 'react';
import { X, AlertCircle, Check } from 'lucide-react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

export default function AbhaRegistrationModal({ onClose, onSuccess }) {
  const [searchType, setSearchType] = useState('abha_address');
  const [step, setStep] = useState('search');
  const [searchValue, setSearchValue] = useState('');
  const [otp, setOtp] = useState('');
  const [mobileOtp, setMobileOtp] = useState('');
  const [txnId, setTxnId] = useState('');
  const [loading, setLoading] = useState(false);
  const [newPatient, setNewPatient] = useState(null);

  // ── ABHA Address/Number/Mobile flow (simple) ──────────────────────────────
  const requestAbhaOtp = async () => {
    if (!searchValue.trim()) return toast.error('Enter ABHA information');
    setLoading(true);
    try {
      const res = await api.post('/abha/request-otp', {
        abhaId: searchValue.trim(),
      });
      setTxnId(res.txnId || res.transactionId || '');
      setStep('abha-verify');
      toast.success('OTP sent to registered mobile');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyAbhaOtp = async () => {
    if (!otp.trim()) return toast.error('Enter OTP');
    setLoading(true);
    try {
      const res = await api.post('/abha/verify-create', { otp, txnId });
      setNewPatient(res);
      setStep('done');
      toast.success('Patient created!');
      onSuccess?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Aadhaar flow (4-step) ──────────────────────────────────────────────────
  // Step 1: Request Aadhaar OTP
  const requestAadhaarOtp = async () => {
    const clean = searchValue.replace(/\D/g, '');
    if (clean.length !== 12) return toast.error('Aadhaar must be 12 digits');
    setLoading(true);
    try {
      const res = await api.post('/abha/aadhaar-otp', { aadhaar: clean });
      setTxnId(res.txnId || res.transactionId || '');
      setStep('aadhaar-otp-verify');
      toast.success('OTP sent to Aadhaar-linked mobile');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify Aadhaar OTP → Request mobile OTP
  const verifyAadhaarOtp = async () => {
    if (!otp.trim()) return toast.error('Enter OTP');
    setLoading(true);
    try {
      const res = await api.post('/abha/aadhaar-verify', { otp, txnId });
      setTxnId(res.txnId || res.transactionId || '');
      setOtp('');
      setStep('aadhaar-mobile-otp-send');
      toast.success('Aadhaar verified');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Request mobile OTP for Aadhaar
  const requestAadhaarMobileOtp = async () => {
    setLoading(true);
    try {
      const res = await api.post('/abha/aadhaar-mobile-otp', { txnId });
      setTxnId(res.txnId || res.transactionId || txnId);
      setStep('aadhaar-mobile-verify');
      toast.success('OTP sent to your mobile');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Verify mobile OTP → Finalize ABHA
  const verifyAadhaarMobileOtp = async () => {
    if (!mobileOtp.trim()) return toast.error('Enter mobile OTP');
    setLoading(true);
    try {
      await api.post('/abha/aadhaar-mobile-verify', { otp: mobileOtp, txnId });
      await finalizeAadhaarAbha();
    } catch (err) {
      toast.error(err.message);
      setLoading(false);
    }
  };

  // Step 5: Finalize ABHA creation
  const finalizeAadhaarAbha = async () => {
    try {
      const res = await api.post('/abha/aadhaar-finalize', { txnId });
      setNewPatient(res);
      setStep('done');
      toast.success('ABHA created & patient registered!');
      onSuccess?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inp = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 6,
    border: '1.5px solid #e2e8f0',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };
  const btn = (color = '#7c3aed') => ({
    width: '100%',
    padding: '10px 16px',
    borderRadius: 6,
    border: 'none',
    background: color,
    color: '#fff',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    opacity: loading ? 0.6 : 1,
  });

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '28px',
          width: 420,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          position: 'relative',
        }}
      >
        <button
          onClick={() => onClose?.()}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#94a3b8',
            fontSize: 18,
          }}
        >
          ×
        </button>

        <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
          New Patient Registration Using ABHA
        </h2>

        {/* Search type selector */}
        {(step === 'search' || step === 'abha-verify') && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { key: 'abha_address', label: 'ABHA Address' },
              { key: 'abha_number', label: 'ABHA Number' },
              { key: 'mobile', label: 'Mobile Number' },
              { key: 'aadhaar', label: 'Aadhaar' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => {
                  setSearchType(key);
                  setSearchValue('');
                  setOtp('');
                  setMobileOtp('');
                  setStep('search');
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  border: `1.5px solid ${searchType === key ? '#7c3aed' : '#e2e8f0'}`,
                  background: searchType === key ? '#f3e8ff' : '#fff',
                  color: searchType === key ? '#7c3aed' : '#64748b',
                  fontWeight: searchType === key ? 600 : 500,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ABHA Address/Number/Mobile - Simple flow */}
        {step === 'search' && searchType !== 'aadhaar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                {searchType === 'abha_address' && 'ABHA Address *'}
                {searchType === 'abha_number' && 'ABHA Number *'}
                {searchType === 'mobile' && 'Mobile Number *'}
              </label>
              <input
                style={inp}
                placeholder={
                  searchType === 'abha_address'
                    ? 'e.g. username@abdm'
                    : searchType === 'abha_number'
                      ? 'e.g. 91-2345-6789-0123'
                      : 'e.g. 9876543210'
                }
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={btn('#f97316')} onClick={requestAbhaOtp} disabled={loading}>
                {loading ? 'Sending OTP...' : 'Verify ABHA'}
              </button>
              <button style={btn('#dc2626')} onClick={onClose}>
                CANCEL
              </button>
            </div>
          </div>
        )}

        {step === 'abha-verify' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                background: '#eff6ff',
                borderRadius: 8,
                padding: '12px',
                fontSize: 12,
                color: '#1d4ed8',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertCircle size={14} />
              OTP sent to registered mobile number
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                Enter OTP
              </label>
              <input
                style={inp}
                placeholder="6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value.slice(0, 6))}
                maxLength={6}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={btn('#f97316')} onClick={verifyAbhaOtp} disabled={loading}>
                {loading ? 'Verifying...' : 'Verify & Create'}
              </button>
              <button style={btn('#dc2626')} onClick={() => setStep('search')}>
                BACK
              </button>
            </div>
          </div>
        )}

        {/* Aadhaar - 4-step flow */}
        {step === 'search' && searchType === 'aadhaar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                Aadhaar Number *
              </label>
              <input
                style={inp}
                placeholder="12-digit Aadhaar (e.g. 1234-5678-9012)"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                maxLength={14}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={btn('#f97316')} onClick={requestAadhaarOtp} disabled={loading}>
                {loading ? 'Sending OTP...' : 'Verify ABHA'}
              </button>
              <button style={btn('#dc2626')} onClick={onClose}>
                CANCEL
              </button>
            </div>
          </div>
        )}

        {step === 'aadhaar-otp-verify' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#475569', fontWeight: 600 }}>Step 1/4: Verify Aadhaar</p>
            <div
              style={{
                background: '#eff6ff',
                borderRadius: 8,
                padding: '12px',
                fontSize: 12,
                color: '#1d4ed8',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertCircle size={14} />
              OTP sent to Aadhaar-linked mobile
            </div>
            <input
              style={inp}
              placeholder="6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value.slice(0, 6))}
              maxLength={6}
            />
            <button style={btn('#f97316')} onClick={verifyAadhaarOtp} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        )}

        {step === 'aadhaar-mobile-otp-send' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#475569', fontWeight: 600 }}>Step 2/4: Request Mobile OTP</p>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              We need to send an OTP to your mobile number to complete registration.
            </p>
            <button style={btn('#f97316')} onClick={requestAadhaarMobileOtp} disabled={loading}>
              {loading ? 'Sending...' : 'Send Mobile OTP'}
            </button>
          </div>
        )}

        {step === 'aadhaar-mobile-verify' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#475569', fontWeight: 600 }}>Step 3/4: Verify Mobile OTP</p>
            <div
              style={{
                background: '#eff6ff',
                borderRadius: 8,
                padding: '12px',
                fontSize: 12,
                color: '#1d4ed8',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertCircle size={14} />
              OTP sent to your mobile number
            </div>
            <input
              style={inp}
              placeholder="6-digit OTP"
              value={mobileOtp}
              onChange={(e) => setMobileOtp(e.target.value.slice(0, 6))}
              maxLength={6}
            />
            <button style={btn('#f97316')} onClick={verifyAadhaarMobileOtp} disabled={loading}>
              {loading ? 'Creating ABHA...' : 'Verify & Create ABHA'}
            </button>
          </div>
        )}

        {/* Success screen */}
        {step === 'done' && newPatient && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                width: 56,
                height: 56,
                background: '#f0fdf4',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
              }}
            >
              <Check size={28} color="#16a34a" strokeWidth={3} />
            </div>
            <div>
              <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 15, color: '#16a34a' }}>Patient Created!</p>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                <strong>{newPatient.patient?.name || 'New patient'}</strong> has been registered
              </p>
              {newPatient.patient?.abha_number && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#7c3aed', fontFamily: 'monospace' }}>
                  ABHA: {newPatient.patient.abha_number}
                </p>
              )}
            </div>
            <button style={btn()} onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
