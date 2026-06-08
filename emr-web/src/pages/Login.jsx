import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import styles from './Login.module.css';

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const suspended  = searchParams.get('suspended') === '1';
  const [role,     setRole]     = useState('staff');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api.post('/auth/login', { email, password, role });
      login(data.token, data.user);
      navigate('/queue');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
            Your clinic account has been suspended. Please contact support.
          </div>
        )}
        <h2 className={styles.title}>Sign in to your clinic</h2>

        <div className={styles.roleTabs}>
          {['staff', 'doctor'].map(r => (
            <button
              key={r}
              className={`${styles.roleTab} ${role === r ? styles.roleTabActive : ''}`}
              onClick={() => setRole(r)}
            >
              {r === 'staff' ? 'Clinic / Staff' : 'Doctor'}
            </button>
          ))}
        </div>

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
      </div>
    </div>
  );
}
