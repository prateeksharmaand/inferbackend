import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, Check, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import s from './InviteAccept.module.css';

export default function InviteAccept() {
  const { token }   = useParams();
  const navigate    = useNavigate();

  const [info, setInfo]       = useState(null);   // invite metadata
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPw, setShowPw]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [done, setDone]       = useState(false);

  useEffect(() => {
    fetch(`/api/emr/invite/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return; }
        setInfo(data);
        if (data.name)  setName(data.name);
        if (data.email) setEmail(data.email);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load invitation. Please check the link.'); setLoading(false); });
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim())              return setError('Name is required');
    if (!info?.email && !email.trim()) return setError('Email is required');
    if (!password)     return setError('Password is required');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    if (password !== confirm) return setError('Passwords do not match');

    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/emr/invite/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to complete registration'); setSaving(false); return; }
      setDone(true);
    } catch {
      setError('Network error. Please try again.'); setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <Loader2 size={32} className={s.spinner} />
          <p className={s.loadingText}>Loading invitation…</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.successIcon}><Check size={28} strokeWidth={2.5} /></div>
          <h2 className={s.title}>You're all set!</h2>
          <p className={s.sub}>Your account has been created for <strong>{info?.clinic_name}</strong>.</p>
          <button className={s.btnPrimary} onClick={() => navigate('/login')}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <AlertCircle size={32} className={s.errorIcon} />
          <h2 className={s.title}>Invalid Invitation</h2>
          <p className={s.errorText}>{error}</p>
          <button className={s.btnSecondary} onClick={() => navigate('/login')}>Back to Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.logoWrap}>
          <Shield size={22} className={s.logoIcon} />
          <span className={s.logoText}>Infer Care</span>
        </div>

        <h2 className={s.title}>Complete Your Registration</h2>
        <p className={s.sub}>
          You've been invited to join <strong>{info?.clinic_name}</strong> as{' '}
          <strong>{info?.role_name}</strong>.
        </p>

        <form onSubmit={handleSubmit} className={s.form}>
          <div className={s.field}>
            <label>Full Name <span className={s.req}>*</span></label>
            <input
              className={s.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your full name"
              autoFocus
            />
          </div>

          {/* Only ask for email if it wasn't set when the invitation was created */}
          {!info?.email && (
            <div className={s.field}>
              <label>Email <span className={s.req}>*</span></label>
              <input
                className={s.input}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@clinic.com"
              />
            </div>
          )}

          <div className={s.field}>
            <label>Password <span className={s.req}>*</span></label>
            <div className={s.pwWrap}>
              <input
                className={s.input}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 8 characters"
              />
              <button type="button" className={s.pwToggle} onClick={() => setShowPw(v => !v)}>
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className={s.field}>
            <label>Confirm Password <span className={s.req}>*</span></label>
            <input
              className={s.input}
              type={showPw ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Re-enter password"
            />
          </div>

          {error && <p className={s.errorMsg}>{error}</p>}

          <button type="submit" className={s.btnPrimary} disabled={saving}>
            {saving ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
