import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminApi } from '../../api/adminClient';
import { MessageCircle, Mail, Phone, Edit2, X } from 'lucide-react';
import styles from './AdminCRM.module.css';

const STATUS_COLORS = {
  new: '#6b7280',
  active: '#3b82f6',
  replied: '#10b981',
  booked: '#8b5cf6',
  unsubscribed: '#ef4444',
  failed: '#f97316',
};

function StatusBadge({ status }) {
  return (
    <span className={styles.badge} style={{ background: STATUS_COLORS[status] + '22', color: STATUS_COLORS[status] }}>
      {status}
    </span>
  );
}

function LeadModal({ lead, onClose, onUpdate }) {
  const [form, setForm] = useState(lead);
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const updates = {};
      if (form.status !== lead.status) updates.status = form.status;
      if (form.notes !== lead.notes) updates.notes = form.notes;
      if (form.phone !== lead.phone) updates.phone = form.phone;
      if (form.next_send_date !== lead.next_send_date) updates.next_send_date = form.next_send_date;

      if (Object.keys(updates).length) {
        await adminApi.updateLead(lead.id, updates);
        toast.success('Lead updated');
        onUpdate();
      }
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>Edit Lead</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label>
            Email
            <input type="email" value={form.email} disabled />
          </label>

          <label>
            Phone
            <input value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+919876543210" />
          </label>

          <label>
            Status
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="new">New</option>
              <option value="active">Active</option>
              <option value="replied">Replied</option>
              <option value="booked">Booked</option>
              <option value="unsubscribed">Unsubscribed</option>
              <option value="failed">Failed</option>
            </select>
          </label>

          <label>
            Next Send Date
            <input type="date" value={form.next_send_date || ''} onChange={e => set('next_send_date', e.target.value)} />
          </label>

          <label>
            Notes
            <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={4} placeholder="Additional notes..." />
          </label>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ActivityModal({ lead, activities, waMessages, onClose }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.modal} style={{ maxWidth: '600px' }}>
        <div className={styles.modalHeader}>
          <h2>Activity History - {lead.email}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.activityList}>
          {activities.length ? (
            activities.map(a => (
              <div key={a.id} className={styles.activityItem}>
                <div className={styles.activityType}>{a.activity_type}</div>
                <div className={styles.activityDate}>{new Date(a.activity_date).toLocaleString()}</div>
                {a.message_body && <div className={styles.activityMessage}>{a.message_body.substring(0, 100)}</div>}
              </div>
            ))
          ) : (
            <p className={styles.noData}>No activities yet</p>
          )}
        </div>

        {waMessages?.length > 0 && (
          <div className={styles.section}>
            <h3>WhatsApp Messages</h3>
            <div className={styles.waList}>
              {waMessages.map(msg => (
                <div key={msg.id} className={styles.waItem}>
                  <div className={styles.waMeta}>{new Date(msg.created_at).toLocaleString()}</div>
                  <div className={styles.waBody}>{msg.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className={styles.btnPrimary} onClick={onClose} style={{ marginTop: '1rem' }}>Close</button>
      </div>
    </div>
  );
}

function CallAttemptModal({ message, onClose, onUpdate }) {
  const [callAttempted, setCallAttempted] = useState(message.call_attempted || false);
  const [callNotes, setCallNotes] = useState(message.call_notes || '');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      await onUpdate(message.id, { call_attempted: callAttempted, call_notes: callNotes });
      toast.success('Call status updated');
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>Call Tracking</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.form}>
          <div className={styles.msgBox}>
            <strong>From:</strong> {message.from_number}<br />
            <strong>Message:</strong> {message.body}
          </div>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={callAttempted}
              onChange={e => setCallAttempted(e.target.checked)}
            />
            <span>Call Attempted</span>
          </label>

          {callAttempted && (
            <label>
              Call Notes
              <textarea
                value={callNotes}
                onChange={e => setCallNotes(e.target.value)}
                placeholder="What was discussed? Any follow-ups needed?"
                rows={3}
              />
            </label>
          )}

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="button" className={styles.btnPrimary} onClick={handleSubmit} disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WAInboxModal({ message, onClose, onLink }) {
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleLink() {
    if (!selectedLead) return toast.error('Select a lead');
    setLoading(true);
    try {
      await onLink(message.id, selectedLead.id);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>Link WhatsApp Message</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.form}>
          <div className={styles.msgBox}>
            <strong>From:</strong> {message.from_number}<br />
            <strong>Message:</strong> {message.body}
          </div>

          <label>
            Search Lead (email or phone)
            <input
              value={leadSearch}
              onChange={e => setLeadSearch(e.target.value)}
              placeholder="Search..."
            />
          </label>

          {selectedLead && (
            <div className={styles.selectedItem}>
              {selectedLead.email} ({selectedLead.phone})
            </div>
          )}

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="button" className={styles.btnPrimary} onClick={handleLink} disabled={loading || !selectedLead}>
              {loading ? 'Linking...' : 'Link Message'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminCRM() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [waMessages, setWaMessages] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(searchParams.get('tab') || 'leads');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedLead, setSelectedLead] = useState(null);
  const [editLead, setEditLead] = useState(null);
  const [leadActivity, setLeadActivity] = useState(null);
  const [waInboxLink, setWaInboxLink] = useState(null);
  const [waCallTrack, setWaCallTrack] = useState(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getCrmDashboard({ status: status !== 'all' ? status : undefined, search });
      setLeads(data.leads);
      setStats(data.stats);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  const loadWaInbox = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getWhatsAppInbox({ synced: 'false' });
      setWaMessages(data.messages);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleViewActivity = async (lead) => {
    try {
      const data = await adminApi.getLeadDetail(lead.id);
      setLeadActivity({ ...data, selectedLead: lead });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleLinkWA = async (waId, leadId) => {
    try {
      await adminApi.linkWhatsAppToLead(waId, { lead_id: leadId });
      toast.success('Message linked to lead');
      loadWaInbox();
      setWaInboxLink(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCallAttemptUpdate = async (waId, data) => {
    try {
      await adminApi.markCallAttempted(waId, data);
      toast.success('Call status updated');
      loadWaInbox();
      setWaCallTrack(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    if (tab === 'leads') loadLeads();
    else loadWaInbox();
  }, [tab, loadLeads, loadWaInbox]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Sales CRM Dashboard</h1>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'leads' ? styles.active : ''}`}
            onClick={() => setTab('leads')}
          >
            Leads
          </button>
          <button
            className={`${styles.tab} ${tab === 'wa' ? styles.active : ''}`}
            onClick={() => setTab('wa')}
          >
            WhatsApp Inbox
          </button>
        </div>
      </div>

      {stats && (
        <div className={styles.statsGrid}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Total Leads</div>
            <div className={styles.statValue}>{stats.total}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>New</div>
            <div className={styles.statValue}>{stats.new_count}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Active</div>
            <div className={styles.statValue}>{stats.active_count}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Replied</div>
            <div className={styles.statValue}>{stats.replied_count}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Booked</div>
            <div className={styles.statValue}>{stats.booked_count}</div>
          </div>
        </div>
      )}

      {tab === 'leads' ? (
        <div className={styles.section}>
          <div className={styles.filters}>
            <input
              type="text"
              placeholder="Search email, phone, clinic..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={styles.searchInput}
            />
            <select value={status} onChange={e => setStatus(e.target.value)} className={styles.select}>
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="active">Active</option>
              <option value="replied">Replied</option>
              <option value="booked">Booked</option>
              <option value="unsubscribed">Unsubscribed</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : leads.length ? (
            <div className={styles.table}>
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Clinic</th>
                    <th>Status</th>
                    <th>Activity</th>
                    <th>Last Activity</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(lead => (
                    <tr key={lead.id}>
                      <td className={styles.email}>{lead.email}</td>
                      <td>{lead.phone || '—'}</td>
                      <td>{lead.clinic || '—'}</td>
                      <td><StatusBadge status={lead.status} /></td>
                      <td>{lead.activity_count || 0}</td>
                      <td className={styles.date}>
                        {lead.last_activity_date ? new Date(lead.last_activity_date).toLocaleDateString() : '—'}
                      </td>
                      <td className={styles.actions}>
                        <button
                          className={styles.iconBtn}
                          onClick={() => handleViewActivity(lead)}
                          title="View activity"
                        >
                          <MessageCircle size={16} />
                        </button>
                        <button
                          className={styles.iconBtn}
                          onClick={() => setEditLead(lead)}
                          title="Edit lead"
                        >
                          <Edit2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.noData}>No leads found</div>
          )}
        </div>
      ) : (
        <div className={styles.section}>
          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : waMessages.length ? (
            <div className={styles.waGrid}>
              {waMessages.map(msg => (
                <div key={msg.id} className={styles.waCard}>
                  <div className={styles.waHeader}>
                    <strong>{msg.from_number}</strong>
                    <span className={styles.waTime}>{new Date(msg.created_at).toLocaleString()}</span>
                  </div>
                  <p className={styles.waText}>{msg.body}</p>
                  {msg.call_attempted && (
                    <div className={styles.callBadge}>
                      ✓ Call Attempted {msg.call_attempted_at ? `on ${new Date(msg.call_attempted_at).toLocaleDateString()}` : ''}
                    </div>
                  )}
                  {msg.call_notes && (
                    <div className={styles.callNotes}>{msg.call_notes}</div>
                  )}
                  <div className={styles.waActions}>
                    <button
                      className={styles.btnSmall}
                      onClick={() => setWaInboxLink(msg)}
                    >
                      Link to Lead
                    </button>
                    <button
                      className={`${styles.btnSmall} ${msg.call_attempted ? styles.btnActive : ''}`}
                      onClick={() => setWaCallTrack(msg)}
                    >
                      {msg.call_attempted ? '✓ Called' : 'Mark Call'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.noData}>No unsynced WhatsApp messages</div>
          )}
        </div>
      )}

      {editLead && (
        <LeadModal
          lead={editLead}
          onClose={() => setEditLead(null)}
          onUpdate={loadLeads}
        />
      )}

      {leadActivity && (
        <ActivityModal
          lead={leadActivity.selectedLead}
          activities={leadActivity.activities}
          waMessages={leadActivity.waMessages}
          onClose={() => setLeadActivity(null)}
        />
      )}

      {waInboxLink && (
        <WAInboxModal
          message={waInboxLink}
          onClose={() => setWaInboxLink(null)}
          onLink={handleLinkWA}
        />
      )}

      {waCallTrack && (
        <CallAttemptModal
          message={waCallTrack}
          onClose={() => setWaCallTrack(null)}
          onUpdate={handleCallAttemptUpdate}
        />
      )}
    </div>
  );
}
