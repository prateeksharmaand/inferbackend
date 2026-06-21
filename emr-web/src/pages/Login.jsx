import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import styles from './Login.module.css';

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const suspended = searchParams.get('suspended') === '1';

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [fpEmail,    setFpEmail]    = useState('');
  const [fpLoading,  setFpLoading]  = useState(false);
  const [fpMsg,      setFpMsg]      = useState('');
  const [fpError,    setFpError]    = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api.post('/auth/login', { email, password, role: 'staff' });
      login(data.token, data.user);
      navigate('/queue');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setFpError(''); setFpMsg(''); setFpLoading(true);
    try {
      const data = await api.post('/auth/forgot-password', { email: fpEmail, role: 'staff' });
      setFpMsg(data.message || 'Reset link sent. Check your email.');
    } catch (err) {
      setFpError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setFpLoading(false);
    }
  };

  if (showForgot) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>I</div>
            <div className={styles.logoTextWrap}>
              <span className={styles.logoText}>Infer Care</span>
              <span className={styles.logoSub}>Doctor Management</span>
            </div>
          </div>
          <h2 className={styles.title}>Reset Password</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-2)', marginBottom: 16 }}>
            Enter your email and we'll send you a reset link.
          </p>
          <form onSubmit={handleForgotPassword} className={styles.form}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              type="email" required autoFocus
              value={fpEmail} onChange={e => setFpEmail(e.target.value)}
              placeholder="you@clinic.com"
            />
            {fpError && <p className={styles.error}>{fpError}</p>}
            {fpMsg   && <p style={{ color: 'green', fontSize: 13 }}>{fpMsg}</p>}
            <button className={styles.btn} type="submit" disabled={fpLoading}>
              {fpLoading ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
          <button
            onClick={() => { setShowForgot(false); setFpMsg(''); setFpError(''); }}
            style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 13, cursor: 'pointer' }}
          >
            ← Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>I</div>
          <div className={styles.logoTextWrap}>
            <span className={styles.logoText}>Infer Care</span>
            <span className={styles.logoSub}>Doctor Management</span>
          </div>
        </div>
        {suspended && (
          <div className={styles.suspendedBanner}>
            Your clinic account has been suspended. Please contact support at{' '}
            <a href="mailto:support@inferapp.online">support@inferapp.online</a>
          </div>
        )}
        <h2 className={styles.title}>Sign in to your clinic</h2>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>Email</label>
          <input
            className={styles.input}
            type="email" required autoFocus
            value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@clinic.com"
          />
          <label className={styles.label}>Password</label>
          <input
            className={styles.input}
            type="password" required
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <button
          onClick={() => { setShowForgot(true); setFpEmail(email); }}
          style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 13, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center' }}
        >
          Forgot password?
        </button>
      </div>
    </div>
  );
}
