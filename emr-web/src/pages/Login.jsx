import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import styles from './Login.module.css';

const FEATURES = [
  { icon: '🩺', label: 'Smart EMR' },
  { icon: '📋', label: 'InferPad' },
  { icon: '🤖', label: 'AI Scribe' },
  { icon: '🏥', label: 'ABDM Ready' },
  { icon: '📊', label: 'Analytics' },
  { icon: '💊', label: 'e-Prescriptions' },
];

const FLOATING = [
  { icon: '❤️', text: 'Patient Records' },
  { icon: '📅', text: 'Appointments' },
  { icon: '🧪', text: 'Lab Reports' },
  { icon: '💊', text: 'Medications' },
];

export default function Login() {
  const { login }   = useAuth();
  const navigate    = useNavigate();
  const [searchParams] = useSearchParams();
  const suspended   = searchParams.get('suspended') === '1';

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

  const LeftPanel = () => (
    <div className={styles.left}>
      {/* Animated blobs */}
      <div className={styles.blob + ' ' + styles.blob1} />
      <div className={styles.blob + ' ' + styles.blob2} />
      <div className={styles.blob + ' ' + styles.blob3} />

      {/* Dot grid */}
      <div className={styles.dotGrid} />

      {/* Floating cards */}
      <div className={styles.floatingCards}>
        {FLOATING.map((f, i) => (
          <div key={i} className={`${styles.fCard} ${styles['fCard' + (i + 1)]}`}>
            <span className={styles.fCardIcon}>{f.icon}</span>
            {f.text}
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className={styles.leftContent}>
        <div className={styles.leftLogo}>I</div>
        <h1 className={styles.leftTitle}>
          Modern EMR for<br /><span>Smarter Clinics</span>
        </h1>
        <p className={styles.leftSub}>
          Streamline your clinic with AI-powered prescriptions,
          smart patient management, and seamless ABDM integration.
        </p>

        <div className={styles.pills}>
          {FEATURES.map((f, i) => (
            <div key={i} className={styles.pill}>
              {f.icon} {f.label}
            </div>
          ))}
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <div className={styles.statNum}>10K+</div>
            <div className={styles.statLabel}>Consultations</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statNum}>500+</div>
            <div className={styles.statLabel}>Clinics</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statNum}>99.9%</div>
            <div className={styles.statLabel}>Uptime</div>
          </div>
        </div>
      </div>
    </div>
  );

  if (showForgot) {
    return (
      <div className={styles.page}>
        <LeftPanel />
        <div className={styles.right}>
          <div className={styles.card}>
            <div className={styles.logo}>
              <div className={styles.logoIcon}>I</div>
              <div className={styles.logoTextWrap}>
                <span className={styles.logoText}>Infer Care</span>
                <span className={styles.logoSub}>Doctor Management</span>
              </div>
            </div>
            <h2 className={styles.title}>Reset Password</h2>
            <p className={styles.titleSub}>Enter your email and we'll send you a reset link.</p>
            <form onSubmit={handleForgotPassword} className={styles.form}>
              <div>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  type="email" required autoFocus
                  value={fpEmail} onChange={e => setFpEmail(e.target.value)}
                  placeholder="you@clinic.com"
                />
              </div>
              {fpError && <p className={styles.error}>{fpError}</p>}
              {fpMsg   && <p style={{ color: '#16a34a', fontSize: 13 }}>{fpMsg}</p>}
              <button className={styles.btn} type="submit" disabled={fpLoading}>
                {fpLoading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
            <button
              onClick={() => { setShowForgot(false); setFpMsg(''); setFpError(''); }}
              style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 13, cursor: 'pointer', width: '100%', textAlign: 'center' }}
            >
              ← Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <LeftPanel />

      <div className={styles.right}>
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

          <h2 className={styles.title}>Welcome back</h2>
          <p className={styles.titleSub}>Sign in to your clinic account</p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div>
              <label className={styles.label}>Email address</label>
              <input
                className={styles.input}
                type="email" required autoFocus
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@clinic.com"
              />
            </div>
            <div>
              <label className={styles.label}>Password</label>
              <input
                className={styles.input}
                type="password" required
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>

          <button
            onClick={() => { setShowForgot(true); setFpEmail(email); }}
            style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 13, cursor: 'pointer', width: '100%', textAlign: 'center', display: 'block' }}
          >
            Forgot your password?
          </button>

          <p className={styles.bottomNote}>
            Protected by Infer Care · ABDM compliant · ISO 27001
          </p>
        </div>
      </div>
    </div>
  );
}
