import { useState, useEffect } from 'react';
import { Plus, Trash2, Check, X, Calendar, Link2, Eye } from 'lucide-react';
import { api } from '../api/client';
import styles from './InboundAvailability.module.css';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const CHANNELS = ['sms','whatsapp','ivr','chat','email'];

// ── Availability add/edit modal ───────────────────────────────────────────
function AvailModal({ doctors, existing, onSave, onClose }) {
  const [form, setForm] = useState(existing || {
    doctor_id: doctors[0]?.id || '', day_of_week: 1,
    start_time: '09:00', end_time: '17:00',
    slot_duration_minutes: 15, is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.doctor_id) return setError('Select a doctor');
    setSaving(true); setError('');
    try { await onSave(form); }
    catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span>{existing ? 'Edit Availability' : 'Add Availability Window'}</span>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={submit} className={styles.modalBody}>
          <div className={styles.field}>
            <label>Doctor</label>
            <select className={styles.select} value={form.doctor_id} onChange={e => set('doctor_id', e.target.value)}>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.name}{d.specialization ? ` — ${d.specialization}` : ''}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label>Day of Week</label>
            <select className={styles.select} value={form.day_of_week} onChange={e => set('day_of_week', parseInt(e.target.value, 10))}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label>Start Time</label>
              <input type="time" className={styles.input} value={form.start_time} onChange={e => set('start_time', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>End Time</label>
              <input type="time" className={styles.input} value={form.end_time} onChange={e => set('end_time', e.target.value)} />
            </div>
          </div>
          <div className={styles.field}>
            <label>Slot Duration (minutes)</label>
            <select className={styles.select} value={form.slot_duration_minutes} onChange={e => set('slot_duration_minutes', parseInt(e.target.value, 10))}>
              {[10,15,20,30,45,60].map(n => <option key={n} value={n}>{n} min</option>)}
            </select>
          </div>
          <div className={styles.checkRow}>
            <input type="checkbox" id="avail-active" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
            <label htmlFor="avail-active">Active (patients can book this slot)</label>
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnSave} disabled={saving}>
              <Check size={13} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Channel config modal ──────────────────────────────────────────────────
function ChannelModal({ onSave, onClose }) {
  const [form, setForm] = useState({ channel: 'sms', channel_address: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.channel_address.trim()) return setError('Phone number or address is required');
    setSaving(true); setError('');
    try { await onSave(form); }
    catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span>Add Inbound Channel</span>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={submit} className={styles.modalBody}>
          <div className={styles.field}>
            <label>Channel Type</label>
            <select className={styles.select} value={form.channel} onChange={e => set('channel', e.target.value)}>
              {CHANNELS.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label>Phone / Address</label>
            <input className={styles.input} placeholder="+91XXXXXXXXXX or email@domain"
              value={form.channel_address} onChange={e => set('channel_address', e.target.value)} />
            <p className={styles.hint}>Your Exotel virtual number patients message or call into (e.g. +91XXXXXXXXXX). Use the same number for SMS, WhatsApp, and IVR — all provisioned from the Exotel dashboard.</p>
          </div>
          <div className={styles.checkRow}>
            <input type="checkbox" id="ch-active" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
            <label htmlFor="ch-active">Active</label>
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnSave} disabled={saving}>
              <Check size={13} /> {saving ? 'Saving…' : 'Add Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Slots preview modal ───────────────────────────────────────────────────
function SlotsPreview({ doctorId, doctors, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);

  const doc = doctors.find(d => d.id === doctorId);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get(`/inbound/availability/slots?doctor_id=${doctorId}&date=${date}`);
      setSlots(data.slots || []);
    } catch { setSlots([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (doctorId) load(); }, [doctorId, date]);

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span>Available Slots — {doc?.name}</span>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label>Pick a date</label>
            <input type="date" className={styles.input} value={date} min={today}
              onChange={e => setDate(e.target.value)} />
          </div>
          {loading ? (
            <p className={styles.hint}>Loading slots…</p>
          ) : slots.length === 0 ? (
            <p className={styles.hint}>No slots available on this date. Check the availability schedule.</p>
          ) : (
            <div className={styles.slotsGrid}>
              {slots.map(s => (
                <span key={s} className={styles.slotChip}>{s}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function InboundAvailability() {
  const [subTab, setSubTab]       = useState('schedule');
  const [doctors, setDoctors]     = useState([]);
  const [avails, setAvails]       = useState([]);
  const [channels, setChannels]   = useState([]);
  const [loading, setLoading]     = useState(true);

  const [showAvailModal, setShowAvailModal]     = useState(false);
  const [editAvail, setEditAvail]               = useState(null);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [previewDoctorId, setPreviewDoctorId]   = useState(null);

  const [filterDoctor, setFilterDoctor] = useState('all');

  useEffect(() => {
    Promise.all([
      api.get('/auth/doctors'),
      api.get('/inbound/availability'),
      api.get('/inbound/channels'),
    ]).then(([docs, av, ch]) => {
      setDoctors(docs || []);
      setAvails(av || []);
      setChannels(ch || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleAddAvail = async (form) => {
    const saved = await api.post('/inbound/availability', form);
    setAvails(a => {
      const filtered = a.filter(x => !(x.doctor_id === saved.doctor_id && x.day_of_week === saved.day_of_week));
      return [...filtered, saved].sort((a, b) => a.doctor_id - b.doctor_id || a.day_of_week - b.day_of_week);
    });
    setShowAvailModal(false);
  };

  const handleDeleteAvail = async (id) => {
    if (!window.confirm('Remove this availability window?')) return;
    await api.delete(`/inbound/availability/${id}`);
    setAvails(a => a.filter(x => x.id !== id));
  };

  const handleAddChannel = async (form) => {
    const saved = await api.post('/inbound/channels', form);
    setChannels(c => [...c, saved]);
    setShowChannelModal(false);
  };

  const handleDeleteChannel = async (id) => {
    if (!window.confirm('Remove this channel?')) return;
    await api.delete(`/inbound/channels/${id}`);
    setChannels(c => c.filter(x => x.id !== id));
  };

  const filteredAvails = filterDoctor === 'all'
    ? avails
    : avails.filter(a => String(a.doctor_id) === filterDoctor);

  if (loading) return <div className={styles.loading}>Loading…</div>;

  return (
    <div className={styles.page}>
      <div className={styles.subTabs}>
        <button className={`${styles.subTab} ${subTab === 'schedule' ? styles.subTabActive : ''}`}
          onClick={() => setSubTab('schedule')}>
          <Calendar size={14} /> Doctor Schedule
        </button>
        <button className={`${styles.subTab} ${subTab === 'channels' ? styles.subTabActive : ''}`}
          onClick={() => setSubTab('channels')}>
          <Link2 size={14} /> Inbound Channels
        </button>
      </div>

      {subTab === 'schedule' && (
        <div className={styles.section}>
          <div className={styles.toolbar}>
            <select className={styles.select} value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)}>
              <option value="all">All Doctors</option>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            <button className={styles.btnAdd} onClick={() => setShowAvailModal(true)}>
              <Plus size={13} strokeWidth={2.5} /> Add Window
            </button>
          </div>

          {filteredAvails.length === 0 ? (
            <div className={styles.empty}>
              <Calendar size={36} strokeWidth={1.2} />
              <p>No availability configured. Add a window to enable booking.</p>
            </div>
          ) : (
            <div className={styles.table}>
              <div className={styles.thead}>
                <span>Doctor</span>
                <span>Day</span>
                <span>Hours</span>
                <span>Slot</span>
                <span>Status</span>
                <span></span>
              </div>
              {filteredAvails.map(a => (
                <div key={a.id} className={styles.row}>
                  <span className={styles.docName}>{a.doctor_name || `Dr. #${a.doctor_id}`}</span>
                  <span className={styles.dayBadge}>{DAY_SHORT[a.day_of_week]}</span>
                  <span>{a.start_time?.slice(0,5)} – {a.end_time?.slice(0,5)}</span>
                  <span>{a.slot_duration_minutes} min</span>
                  <span>
                    <span className={`${styles.activeBadge} ${a.is_active ? styles.on : styles.off}`}>
                      {a.is_active ? 'Active' : 'Off'}
                    </span>
                  </span>
                  <span className={styles.rowActions}>
                    <button className={styles.iconBtn}
                      onClick={() => setPreviewDoctorId(a.doctor_id)} title="Preview slots">
                      <Eye size={13} />
                    </button>
                    <button className={`${styles.iconBtn} ${styles.danger}`}
                      onClick={() => handleDeleteAvail(a.id)} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'channels' && (
        <div className={styles.section}>
          <div className={styles.toolbar}>
            <div style={{ flex: 1 }} />
            <button className={styles.btnAdd} onClick={() => setShowChannelModal(true)}>
              <Plus size={13} strokeWidth={2.5} /> Add Channel
            </button>
          </div>

          {channels.length === 0 ? (
            <div className={styles.empty}>
              <Link2 size={36} strokeWidth={1.2} />
              <p>No channels configured. Add your Telnyx number to start receiving bookings.</p>
            </div>
          ) : (
            <div className={styles.table}>
              <div className={styles.thead}>
                <span>Channel</span>
                <span>Address (Telnyx number)</span>
                <span>Status</span>
                <span></span>
              </div>
              {channels.map(ch => (
                <div key={ch.id} className={styles.row}>
                  <span className={styles.channelType}>{ch.channel?.toUpperCase()}</span>
                  <span className={styles.channelAddr}>{ch.channel_address}</span>
                  <span>
                    <span className={`${styles.activeBadge} ${ch.is_active ? styles.on : styles.off}`}>
                      {ch.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </span>
                  <span className={styles.rowActions}>
                    <button className={`${styles.iconBtn} ${styles.danger}`}
                      onClick={() => handleDeleteChannel(ch.id)} title="Remove">
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAvailModal && (
        <AvailModal doctors={doctors} onSave={handleAddAvail} onClose={() => setShowAvailModal(false)} />
      )}
      {showChannelModal && (
        <ChannelModal onSave={handleAddChannel} onClose={() => setShowChannelModal(false)} />
      )}
      {previewDoctorId && (
        <SlotsPreview doctorId={previewDoctorId} doctors={doctors} onClose={() => setPreviewDoctorId(null)} />
      )}
    </div>
  );
}
