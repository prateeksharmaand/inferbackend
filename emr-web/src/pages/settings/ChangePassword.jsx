import { useState } from 'react';
import { api } from '../../api/client';
import styles from './ServicesSettings.module.css';

export default function ChangePassword() {
  const [form,    setForm]    = useState({ current_password: '', new_password: '', confirm: '' });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (form.new_password !== form.confirm) return setError('New passwords do not match.');
    if (form.new_password.length < 6) return setError('New password must be at least 6 characters.');
    setSaving(true);
    try {
      const data = await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      setSuccess(data.message || 'Password changed successfully.');
      setForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      setError(err.message || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 420 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Change Password</h3>
      <p style={{ fontSize: 13, color: 'var(--color-text-2)', marginBottom: 20 }}>
        Update your login password. You'll need your current password to proceed.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className={styles.label}>Current Password</label>
          <input
            className={styles.input}
            type="password" required
            value={form.current_password}
            onChange={e => set('current_password', e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <div>
          <label className={styles.label}>New Password</label>
          <input
            className={styles.input}
            type="password" required
            value={form.new_password}
            onChange={e => set('new_password', e.target.value)}
            placeholder="Min. 6 characters"
          />
        </div>
        <div>
          <label className={styles.label}>Confirm New Password</label>
          <input
            className={styles.input}
            type="password" required
            value={form.confirm}
            onChange={e => set('confirm', e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error   && <p style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</p>}
        {success && <p style={{ color: 'green', fontSize: 13 }}>{success}</p>}

        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '10px 20px', background: 'var(--color-primary)', color: '#fff',
            border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, alignSelf: 'flex-start',
          }}
        >
          {saving ? 'Saving…' : 'Change Password'}
        </button>
      </form>
    </div>
  );
}
