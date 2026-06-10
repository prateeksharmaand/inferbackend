import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import styles from './Login.module.css';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const token = searchParams.get('token') || '';
  const role  = searchParams.get('role')  || 'staff';

  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('Passwords do not match.');
    if (password.length < 6)  return setError('Password must be at least 6 characters.');
    setLoading(true);
    try {
      const data = await api.post('/auth/reset-password', { token, role, new_password: password });
      setSuccess(data.message || 'Password reset! Redirecting to login…');
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.message || 'Invalid or expired link. Please request a new one.');
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
        <h2 className={styles.title}>Set New Password</h2>

        {!token ? (
          <p className={styles.error}>Invalid reset link. Please request a new one.</p>
        ) : success ? (
          <p style={{ color: 'green', fontSize: 14 }}>{success}</p>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.label}>New Password</label>
            <input
              className={styles.input}
              type="password" required autoFocus
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <label className={styles.label}>Confirm Password</label>
            <input
              className={styles.input}
              type="password" required
              value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Set Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
