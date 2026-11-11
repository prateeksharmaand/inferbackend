/**
 * Self-service clinic registration (shown inside the Login page layout).
 * Step 1: clinic + admin details → we email a 6-digit code.
 * Step 2: enter the code → the clinic is created with a 10-day Base trial → signed in.
 */
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import styles from '../pages/Login.module.css';

export default function ClinicSignup({ onBack, onSignedIn }) {
  const [step, setStep] = useState('details');     // details | code
  const [f, setF] = useState({ clinic_name: '', admin_name: '', email: '', phone: '', city: '', password: '', confirm: '', accept_terms: false });
  const [signupId, setSignupId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!cooldown) return undefined;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const start = async e => {
    e.preventDefault();
    setError(''); setInfo('');
    if (f.password !== f.confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      const r = await api.post('/auth/signup/start', { ...f, confirm: undefined });
      setSignupId(r.signup_id); setStep('code'); setCooldown(60);
      setInfo(`We sent a 6-digit code to ${r.email}.`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const verify = async e => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await api.post('/auth/signup/verify', { signup_id: signupId, code });
      // Account created — sign in with the details just entered
      const data = await api.post('/auth/login', { email: f.email.trim().toLowerCase(), password: f.password, role: 'staff' });
      onSignedIn(data);
    } catch (err) { setError(err.message); setBusy(false); }
  };

  const resend = async () => {
    setError(''); setInfo('');
    try { await api.post('/auth/signup/resend', { signup_id: signupId }); setInfo('A new code is on its way.'); setCooldown(60); }
    catch (err) { setError(err.message); }
  };

  const field = (k, label, props = {}) => (
    <div>
      <label className={styles.label} htmlFor={`su-${k}`}>{label}</label>
      <input id={`su-${k}`} className={styles.input} value={f[k]} onChange={e => set(k, e.target.value)} required {...props} />
    </div>
  );

  return (
    <>
      <h2 className={styles.title}>{step === 'details' ? 'Create your clinic account' : 'Verify your email'}</h2>
      <p className={styles.titleSub}>
        {step === 'details'
          ? 'Start a free 10-day trial. No card needed.'
          : info || 'Enter the 6-digit code we emailed you.'}
      </p>

      {step === 'details' ? (
        <form onSubmit={start} className={styles.form}>
          {field('clinic_name', 'Clinic name', { placeholder: 'e.g. Sharma Family Clinic', autoFocus: true, maxLength: 120 })}
          {field('admin_name', 'Your name', { placeholder: 'e.g. Dr Priya Sharma', maxLength: 100, autoComplete: 'name' })}
          {field('email', 'Email address', { type: 'email', placeholder: 'you@clinic.com', autoComplete: 'email' })}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {field('phone', 'Mobile number', { type: 'tel', inputMode: 'tel', placeholder: '98765 43210', autoComplete: 'tel' })}
            {field('city', 'City', { placeholder: 'e.g. Jaipur', required: false, maxLength: 80 })}
          </div>
          {field('password', 'Password', { type: 'password', placeholder: 'At least 8 characters, with a number', autoComplete: 'new-password', minLength: 8 })}
          {field('confirm', 'Confirm password', { type: 'password', autoComplete: 'new-password', minLength: 8 })}
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#4b5563', lineHeight: 1.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.accept_terms} onChange={e => set('accept_terms', e.target.checked)} required style={{ marginTop: 2 }} />
            <span>I agree to the <a href="https://inferapp.online/terms.html" target="_blank" rel="noopener noreferrer">Terms</a> and <a href="https://inferapp.online/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</span>
          </label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.btn} type="submit" disabled={busy}>{busy ? 'Sending code…' : 'Continue →'}</button>
        </form>
      ) : (
        <form onSubmit={verify} className={styles.form}>
          <div>
            <label className={styles.label} htmlFor="su-code">Verification code</label>
            <input id="su-code" className={styles.input} value={code} required autoFocus inputMode="numeric" autoComplete="one-time-code"
              maxLength={6} pattern="\d{6}" placeholder="••••••"
              style={{ letterSpacing: 8, fontSize: 22, textAlign: 'center', fontWeight: 700 }}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.btn} type="submit" disabled={busy || code.length !== 6}>{busy ? 'Creating your clinic…' : 'Verify & create account'}</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <button type="button" onClick={() => { setStep('details'); setCode(''); setError(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 6 }}>← Change details</button>
            <button type="button" onClick={resend} disabled={cooldown > 0}
              style={{ background: 'none', border: 'none', color: cooldown ? '#9ca3af' : 'var(--color-primary)', cursor: cooldown ? 'default' : 'pointer', padding: 6 }}>
              {cooldown ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}

      <button type="button" onClick={onBack}
        style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 13, cursor: 'pointer', width: '100%', textAlign: 'center' }}>
        Already have an account? Sign in
      </button>
    </>
  );
}
