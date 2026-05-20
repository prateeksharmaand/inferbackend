import { useState, useEffect } from 'react';
import { Hash, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../../api/client';
import styles from './UhidSettings.module.css';

export default function UhidSettings() {
  const [settings, setSettings] = useState({ prefix: '', next_number: 1, preview: null, configured: false });
  const [form,     setForm]     = useState({ prefix: '', start_number: '' });
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  const load = () => {
    setLoading(true);
    api.get('/settings/uhid')
      .then(data => {
        setSettings(data);
        setForm({ prefix: data.prefix || '', start_number: data.next_number || 1 });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.prefix.trim()) return setError('Prefix is required');
    const num = parseInt(form.start_number, 10);
    if (isNaN(num) || num < 1) return setError('Starting number must be a positive integer');
    setSaving(true); setError(''); setSuccess('');
    try {
      const data = await api.patch('/settings/uhid', { prefix: form.prefix, start_number: num });
      setSettings(data);
      setSuccess(`UHID configured. Next UHID: ${data.preview}`);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const preview = form.prefix.trim()
    ? `${form.prefix.trim().toUpperCase()}${parseInt(form.start_number, 10) || 1}`
    : null;

  if (loading) return <p style={{ padding: 32, color: 'var(--color-text-3)' }}>Loading…</p>;

  return (
    <div className={styles.wrap}>
      {/* Status banner */}
      {settings.configured ? (
        <div className={styles.statusBanner}>
          <Hash size={16} strokeWidth={2} />
          <div>
            <strong>UHID Active</strong>
            <span>Next UHID to be issued: <code>{settings.preview}</code></span>
          </div>
        </div>
      ) : (
        <div className={styles.alertBanner}>
          <AlertCircle size={16} strokeWidth={2} />
          <span>UHID not configured yet. Set a prefix and starting number below.</span>
        </div>
      )}

      {/* Config form */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>UHID Configuration</h3>
        <p className={styles.cardSub}>
          Each patient gets a unique UHID in the format <strong>PREFIX + Number</strong> (e.g. INFER1001).
          The number auto-increments with every new patient registration.
        </p>

        <form onSubmit={handleSave} className={styles.form}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Prefix <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                value={form.prefix}
                onChange={e => setForm(f => ({ ...f, prefix: e.target.value.toUpperCase() }))}
                placeholder="e.g. INFER, CLINIC, CARE"
                maxLength={15}
              />
              <span className={styles.hint}>Will be stored in uppercase</span>
            </div>
            <div className={styles.field}>
              <label>Starting Number <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                type="number"
                min={1}
                value={form.start_number}
                onChange={e => setForm(f => ({ ...f, start_number: e.target.value }))}
                placeholder="e.g. 1000"
              />
              <span className={styles.hint}>First UHID will use this number</span>
            </div>
            <div className={styles.field}>
              <label>Preview</label>
              <div className={styles.previewBox}>
                {preview ? <code className={styles.previewCode}>{preview}</code> : <span style={{ color: 'var(--color-text-3)' }}>—</span>}
              </div>
            </div>
          </div>

          {error   && <p className={styles.error}>{error}</p>}
          {success && <p className={styles.successMsg}><Check size={13} /> {success}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.btnSecondary} onClick={load} disabled={loading}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'Saving…' : <><Check size={14} /> {settings.configured ? 'Update Settings' : 'Configure UHID'}</>}
            </button>
          </div>
        </form>

        {settings.configured && (
          <div className={styles.infoBox}>
            <p><strong>Note:</strong> Changing the prefix or starting number only affects future UHIDs. Previously issued UHIDs remain unchanged.</p>
            <p>If you lower the starting number below the current counter, duplicates may occur.</p>
          </div>
        )}
      </div>
    </div>
  );
}
