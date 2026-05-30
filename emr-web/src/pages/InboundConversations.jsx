import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Phone, Smartphone, Monitor,
         UserCheck, Send, AlertTriangle, CheckCircle,
         Clock, XCircle, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import styles from './InboundConversations.module.css';

const STATES   = ['all','active','booked','handoff','cancelled','expired'];
const CHANNELS = ['all','sms','whatsapp','ivr','chat'];

const CHANNEL_META = {
  sms:       { label: 'SMS',       Icon: MessageSquare, color: '#2563eb' },
  whatsapp:  { label: 'WhatsApp',  Icon: Smartphone,    color: '#16a34a' },
  ivr:       { label: 'IVR',       Icon: Phone,         color: '#d97706' },
  chat:      { label: 'Chat',      Icon: Monitor,       color: '#7c3aed' },
};

const STATE_META = {
  active:    { label: 'Active',    color: '#2563eb', bg: '#dbeafe' },
  booked:    { label: 'Booked',    color: '#16a34a', bg: '#dcfce7' },
  handoff:   { label: 'Handoff',   color: '#d97706', bg: '#fef3c7' },
  cancelled: { label: 'Cancelled', color: '#64748b', bg: '#f1f5f9' },
  expired:   { label: 'Expired',   color: '#64748b', bg: '#f1f5f9' },
};

function ChannelBadge({ channel }) {
  const m = CHANNEL_META[channel] || CHANNEL_META.sms;
  const Icon = m.Icon;
  return (
    <span className={styles.channelBadge} style={{ color: m.color, borderColor: m.color + '40', background: m.color + '12' }}>
      <Icon size={11} strokeWidth={2} /> {m.label}
    </span>
  );
}

function StateBadge({ state }) {
  const m = STATE_META[state] || STATE_META.cancelled;
  return (
    <span className={styles.stateBadge} style={{ color: m.color, background: m.bg }}>{m.label}</span>
  );
}

function ConvThread({ conv, onTakeover, onReply }) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const logs = conv.audit_log || [];
  const context = typeof conv.context === 'string' ? JSON.parse(conv.context || '{}') : (conv.context || {});

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs.length]);

  const handleSend = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await onReply(reply.trim());
      setReply('');
    } finally { setSending(false); }
  };

  return (
    <div className={styles.thread}>
      <div className={styles.threadHeader}>
        <div>
          <span className={styles.threadFrom}>{conv.channel_id}</span>
          <ChannelBadge channel={conv.channel} />
          <StateBadge state={conv.state} />
        </div>
        {context.patient_name && <span className={styles.threadPatient}>{context.patient_name}</span>}
        {conv.doctor_name && <span className={styles.threadDoctor}>→ {conv.doctor_name}</span>}
        {conv.appointment_date && (
          <span className={styles.threadAppt}>
            <CheckCircle size={12} /> {conv.appointment_date} {conv.appointment_time?.slice(0,5)} · Token #{conv.token_number}
          </span>
        )}
      </div>

      <div className={styles.messages}>
        {logs.length === 0 && <p className={styles.noMessages}>No messages yet.</p>}
        {logs.map((log, i) => (
          <div key={i} className={`${styles.bubble} ${log.direction === 'outbound' ? styles.bubbleOut : styles.bubbleIn}`}>
            <div className={styles.bubbleText}>{log.message}</div>
            <div className={styles.bubbleTime}>
              {log.direction === 'outbound' ? (
                log.metadata?.sent_by_staff ? '👤 Staff' : '🤖 AI'
              ) : '📱 Patient'}
              · {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.threadFooter}>
        {conv.is_handoff ? (
          <div className={styles.replyRow}>
            <input
              className={styles.replyInput}
              placeholder="Type your reply to the patient…"
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            />
            <button className={styles.sendBtn} onClick={handleSend} disabled={sending || !reply.trim()}>
              <Send size={14} />
            </button>
          </div>
        ) : (
          <div className={styles.takeoverRow}>
            <AlertTriangle size={14} className={styles.takeoverIcon} />
            <span>AI is handling this conversation.</span>
            <button className={styles.takeoverBtn} onClick={() => onTakeover(conv.id)}>
              <UserCheck size={13} /> Take Over
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InboundConversations() {
  const [conversations, setConversations] = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [convDetail, setConvDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [stateFilter,   setStateFilter]   = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 25 });
      if (stateFilter   !== 'all') params.set('state',   stateFilter);
      if (channelFilter !== 'all') params.set('channel', channelFilter);
      const data = await api.get(`/inbound/conversations?${params}`);
      setConversations(data.conversations || []);
      setTotal(data.total || 0);
    } catch { setConversations([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [stateFilter, channelFilter, page]);

  const openThread = async (conv) => {
    setSelected(conv.id);
    setDetailLoading(true);
    try {
      const detail = await api.get(`/inbound/conversations/${conv.id}`);
      setConvDetail(detail);
    } catch { setConvDetail(conv); }
    finally { setDetailLoading(false); }
  };

  const handleTakeover = async (id) => {
    await api.patch(`/inbound/conversations/${id}/takeover`, {});
    const updated = { ...convDetail, is_handoff: true, state: 'handoff' };
    setConvDetail(updated);
    setConversations(cs => cs.map(c => c.id === id ? { ...c, is_handoff: true, state: 'handoff' } : c));
  };

  const handleReply = async (message) => {
    await api.post(`/inbound/conversations/${convDetail.id}/reply`, { message });
    setConvDetail(d => ({
      ...d,
      audit_log: [...(d.audit_log || []), {
        direction: 'outbound', message,
        metadata: { sent_by_staff: true },
        created_at: new Date().toISOString(),
      }],
    }));
  };

  return (
    <div className={styles.wrap}>
      {/* ── Left: list ── */}
      <div className={styles.listPanel}>
        <div className={styles.filters}>
          <div className={styles.filterRow}>
            {STATES.map(s => (
              <button key={s}
                className={`${styles.chip} ${stateFilter === s ? styles.chipActive : ''}`}
                onClick={() => { setStateFilter(s); setPage(1); }}
              >
                {s === 'all' ? 'All' : STATE_META[s]?.label || s}
              </button>
            ))}
          </div>
          <div className={styles.filterRow}>
            {CHANNELS.map(c => (
              <button key={c}
                className={`${styles.chip} ${channelFilter === c ? styles.chipActive : ''}`}
                onClick={() => { setChannelFilter(c); setPage(1); }}
              >
                {c === 'all' ? 'All Channels' : CHANNEL_META[c]?.label || c}
              </button>
            ))}
            <button className={styles.refreshBtn} onClick={load} title="Refresh">
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        <div className={styles.listScroll}>
          {loading ? (
            <div className={styles.empty}><Clock size={24} strokeWidth={1.2} /><p>Loading…</p></div>
          ) : conversations.length === 0 ? (
            <div className={styles.empty}><MessageSquare size={32} strokeWidth={1.2} /><p>No conversations found</p></div>
          ) : conversations.map(conv => {
            const ctx = typeof conv.context === 'string' ? JSON.parse(conv.context || '{}') : (conv.context || {});
            return (
              <div key={conv.id}
                className={`${styles.convRow} ${selected === conv.id ? styles.convRowActive : ''} ${conv.is_handoff ? styles.convRowHandoff : ''}`}
                onClick={() => openThread(conv)}
              >
                <div className={styles.convTop}>
                  <ChannelBadge channel={conv.channel} />
                  <StateBadge state={conv.state} />
                  {conv.is_handoff && <AlertTriangle size={12} className={styles.handoffIcon} />}
                </div>
                <div className={styles.convFrom}>{ctx.patient_name || conv.channel_id}</div>
                {ctx.patient_name && <div className={styles.convSub}>{conv.channel_id}</div>}
                {conv.doctor_name && <div className={styles.convSub}>→ {conv.doctor_name}</div>}
                <div className={styles.convTime}>
                  {new Date(conv.updated_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            );
          })}
        </div>

        {total > 25 && (
          <div className={styles.pagination}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>←</button>
            <span>Page {page} of {Math.ceil(total / 25)}</span>
            <button disabled={page >= Math.ceil(total / 25)} onClick={() => setPage(p => p + 1)}>→</button>
          </div>
        )}
      </div>

      {/* ── Right: thread ── */}
      <div className={styles.threadPanel}>
        {!selected ? (
          <div className={styles.threadEmpty}>
            <MessageSquare size={40} strokeWidth={1} />
            <p>Select a conversation to view the thread</p>
          </div>
        ) : detailLoading ? (
          <div className={styles.threadEmpty}><Clock size={24} strokeWidth={1.2} /><p>Loading thread…</p></div>
        ) : convDetail ? (
          <ConvThread conv={convDetail} onTakeover={handleTakeover} onReply={handleReply} />
        ) : null}
      </div>
    </div>
  );
}
