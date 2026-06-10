import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Send, Bot, RotateCcw, Search,
  MessageSquare, User, ChevronDown, Copy, Check,
  Sparkles, RefreshCw,
} from 'lucide-react';
import { api } from '../api/client';
import styles from './DocAssistAI.module.css';

// ── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'chat',     label: 'Chat',     Icon: MessageSquare },
  { id: 'patients', label: 'Patients', Icon: User },
];

const CHAT_SUGGESTIONS = [
  { icon: '💊', text: 'Safe anti-hypertensives in asthma' },
  { icon: '💉', text: 'Ozempic vs Rybelsus — which is more effective?' },
  { icon: '🤰', text: 'Safe cough syrup for pregnant woman' },
  { icon: '🥗', text: 'Diet chart for DM2 patient in Hindi' },
  { icon: '⚠️', text: 'Common drug interactions to watch' },
  { icon: '🔬', text: 'When to order HbA1c vs fasting glucose?' },
];

const SEGMENT_MS = 5000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtAge(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  let h = d.getHours(), m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

// Simple markdown renderer: bold, italic, bullets, headers, code
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const out = [];
  let listItems = [];

  const flushList = () => {
    if (listItems.length) {
      out.push(<ul key={`ul-${out.length}`} className={styles.mdList}>{listItems}</ul>);
      listItems = [];
    }
  };

  const inlineFormat = (str, key) => {
    const parts = [];
    let rest = str;
    let i = 0;
    // bold **text**
    rest = rest.replace(/\*\*(.+?)\*\*/g, (_, m) => `§B§${m}§/B§`);
    // italic *text*
    rest = rest.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_, m) => `§I§${m}§/I§`);
    // inline code `text`
    rest = rest.replace(/`(.+?)`/g, (_, m) => `§C§${m}§/C§`);

    const tokens = rest.split(/(§B§.*?§\/B§|§I§.*?§\/I§|§C§.*?§\/C§)/);
    return tokens.map((tok, j) => {
      if (tok.startsWith('§B§')) return <strong key={j}>{tok.slice(3, -4)}</strong>;
      if (tok.startsWith('§I§')) return <em key={j}>{tok.slice(3, -4)}</em>;
      if (tok.startsWith('§C§')) return <code key={j} className={styles.mdCode}>{tok.slice(3, -4)}</code>;
      return tok;
    });
  };

  lines.forEach((line, idx) => {
    if (/^#{1,3}\s/.test(line)) {
      flushList();
      const level = line.match(/^(#{1,3})/)[1].length;
      const content = line.replace(/^#{1,3}\s/, '');
      const Tag = `h${level + 3}`; // h4-h6 for visual hierarchy
      out.push(<p key={idx} className={styles[`mdH${level}`]}>{inlineFormat(content, idx)}</p>);
    } else if (/^[-•*]\s/.test(line)) {
      listItems.push(<li key={idx} className={styles.mdLi}>{inlineFormat(line.replace(/^[-•*]\s/, ''), idx)}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      listItems.push(<li key={idx} className={styles.mdLi}>{inlineFormat(line.replace(/^\d+\.\s/, ''), idx)}</li>);
    } else if (line.trim() === '') {
      flushList();
      out.push(<br key={idx} />);
    } else {
      flushList();
      out.push(<p key={idx} className={styles.mdP}>{inlineFormat(line, idx)}</p>);
    }
  });
  flushList();
  return out;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Logo({ size = 'sm' }) {
  const sz = size === 'lg' ? styles.logoLg : styles.logoSm;
  return (
    <div className={`${styles.logo} ${sz}`}>
      <span className={styles.logoDot1} />
      <span className={styles.logoDot2} />
    </div>
  );
}

function TypingDots() {
  return (
    <div className={styles.msgRow}>
      <div className={styles.msgAvatar}><Bot size={13} strokeWidth={2} /></div>
      <div className={`${styles.bubble} ${styles.bubbleAI}`}>
        <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
      </div>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button className={styles.copyBtn} onClick={copy} title="Copy">
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
    </button>
  );
}

// ── Chat Tab ─────────────────────────────────────────────────────────────────

function ChatTab({ patientCtx }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  async function send(text) {
    const query = text.trim();
    if (!query || loading) return;
    const ts = fmtTime(new Date());
    setMessages(prev => [...prev, { role: 'user', text: query, ts }]);
    setInput('');
    setLoading(true);
    try {
      const history = messages.map(m => ({ role: m.role, content: m.text }));
      const res = await api.post('/docassist', {
        message: query,
        history,
        patient_context: patientCtx || null,
      });
      setMessages(prev => [...prev, { role: 'ai', text: res.reply, ts: fmtTime(new Date()) }]);
    } catch (err) {
      const is429 = err?.status === 429 || String(err?.message).includes('429');
      setMessages(prev => [...prev, {
        role: 'ai',
        text: is429
          ? '⚠️ AI service is busy (rate limit). Please wait 30 seconds and try again.'
          : 'Sorry, I could not get a response. Please check your connection and try again.',
        ts: fmtTime(new Date()),
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className={styles.tabPane}>
      <div className={styles.chatBody}>
        {isEmpty ? (
          <div className={styles.welcome}>
            <Logo size="lg" />
            <h2 className={styles.welcomeTitle}>DocAssist AI</h2>
            <p className={styles.welcomeSub}>Your intelligent clinical copilot</p>
            {patientCtx && (
              <div className={styles.ctxBadge}>
                <User size={11} /> Patient context active
              </div>
            )}
            <p className={styles.suggestLabel}>Try asking:</p>
            <div className={styles.suggestions}>
              {CHAT_SUGGESTIONS.map((s, i) => (
                <button key={i} className={styles.suggCard} onClick={() => send(s.text)}>
                  <span className={styles.suggIcon}>{s.icon}</span>
                  <span className={styles.suggText}>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.messages}>
            {messages.map((m, i) => (
              <div key={i} className={`${styles.msgRow} ${m.role === 'user' ? styles.msgRowUser : ''}`}>
                {m.role === 'ai' && (
                  <div className={styles.msgAvatar}><Bot size={13} strokeWidth={2} /></div>
                )}
                <div className={`${styles.bubble} ${m.role === 'user' ? styles.bubbleUser : styles.bubbleAI} ${m.error ? styles.bubbleError : ''}`}>
                  {m.role === 'ai' ? renderMarkdown(m.text) : <p className={styles.mdP}>{m.text}</p>}
                  <div className={styles.bubbleMeta}>
                    <span className={styles.bubbleTs}>{m.ts}</span>
                    {m.role === 'ai' && !m.error && <CopyButton text={m.text} />}
                  </div>
                </div>
              </div>
            ))}
            {loading && <TypingDots />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {!isEmpty && (
        <button className={styles.newChatBtn} onClick={() => setMessages([])}>
          <RotateCcw size={12} strokeWidth={2} /> New chat
        </button>
      )}

      <div className={styles.inputWrap}>
        <textarea
          ref={inputRef}
          className={styles.input}
          rows={1}
          placeholder="Ask a clinical question…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
        />
        <button
          className={`${styles.sendBtn} ${input.trim() ? styles.sendBtnActive : ''}`}
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
        >
          <Send size={14} strokeWidth={2.5} />
        </button>
      </div>
      <p className={styles.disclaimer}>We recommend double-checking responses.</p>
    </div>
  );
}

// ── Patients Tab ──────────────────────────────────────────────────────────────

function PatientsTab({ onSetPatientCtx }) {
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [insight,   setInsight]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [expanded,  setExpanded]  = useState({});
  const debRef = useRef(null);

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const data = await api.get(`/patients?q=${encodeURIComponent(q)}&limit=8`);
      setResults(Array.isArray(data) ? data : data.patients || data.data || []);
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => search(query), 350);
    return () => clearTimeout(debRef.current);
  }, [query, search]);

  const selectPatient = async (p) => {
    setSelected(p);
    setInsight('');
    onSetPatientCtx && onSetPatientCtx(`Patient: ${p.name}, Age: ${fmtAge(p.dob) || '?'}, Gender: ${p.gender || '?'}`);

    setLoading(true);
    try {
      const res = await api.post('/docassist', {
        message: `Give a brief clinical summary and key insights for this patient. Highlight any abnormal patterns, chronic conditions, allergy risks, or follow-up gaps. Be concise.`,
        history: [],
        patient_context: `Patient: ${p.name}, Age: ${fmtAge(p.dob) || '?'}, Gender: ${p.gender || '?'}, UHID: ${p.uhid || 'N/A'}`,
      });
      setInsight(res.reply);
    } catch { setInsight('Could not generate AI insight for this patient.'); }
    finally { setLoading(false); }
  };

  const toggle = (key) => setExpanded(e => ({ ...e, [key]: !e[key] }));

  return (
    <div className={styles.tabPane}>
      <div className={styles.patientsBody}>
        {/* Search bar */}
        <div className={styles.patientSearch}>
          <Search size={14} className={styles.patientSearchIcon} strokeWidth={2} />
          <input
            className={styles.patientSearchInput}
            placeholder="Name, UHID, mobile, ABHA ID…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {searching && <RefreshCw size={13} className={styles.spin} />}
        </div>

        {/* Results */}
        {results.length > 0 && !selected && (
          <div className={styles.patientResults}>
            {results.map(p => (
              <button key={p.id} className={styles.patientCard} onClick={() => selectPatient(p)}>
                <div className={styles.patientAvatar}>
                  {(p.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className={styles.patientInfo}>
                  <span className={styles.patientName}>{p.name}</span>
                  <span className={styles.patientMeta}>
                    {[p.uhid, fmtAge(p.dob) ? `${fmtAge(p.dob)}y` : null, p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : p.gender].filter(Boolean).join(' · ')}
                  </span>
                  {p.mobile && <span className={styles.patientMeta}>{p.mobile}</span>}
                </div>
                <ChevronDown size={14} className={styles.patientArrow} strokeWidth={2} />
              </button>
            ))}
          </div>
        )}

        {/* Selected patient detail */}
        {selected && (
          <div className={styles.patientDetail}>
            <button className={styles.backBtn} onClick={() => { setSelected(null); setInsight(''); onSetPatientCtx && onSetPatientCtx(''); }}>
              ← Back to search
            </button>

            <div className={styles.patientDetailHeader}>
              <div className={styles.patientAvatarLg}>
                {(selected.name || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className={styles.patientName}>{selected.name}</div>
                <div className={styles.patientMeta}>
                  {[selected.uhid, fmtAge(selected.dob) ? `${fmtAge(selected.dob)} years` : null, selected.gender === 'M' ? 'Male' : selected.gender === 'F' ? 'Female' : selected.gender, selected.mobile].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>

            {/* AI Insight */}
            <div className={styles.insightCard}>
              <div className={styles.insightHeader}>
                <Sparkles size={13} />
                <span>AI Clinical Insight</span>
              </div>
              {loading
                ? <div className={styles.insightLoading}><span className={styles.dot}/><span className={styles.dot}/><span className={styles.dot}/></div>
                : <div className={styles.insightBody}>{renderMarkdown(insight)}</div>
              }
            </div>

            {/* Quick actions */}
            <div className={styles.quickActions}>
              <span className={styles.quickActionsLabel}>Quick questions</span>
              {[
                'What changed since last visit?',
                'Any drug interactions?',
                'Summarize chronic conditions.',
                'Show abnormal lab trends.',
              ].map((q, i) => (
                <button key={i} className={styles.quickAction} onClick={() => {
                  onSetPatientCtx && onSetPatientCtx(`Patient: ${selected.name}, Age: ${fmtAge(selected.dob) || '?'}`);
                  // Switch to chat tab is handled by parent — we just set context
                }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {!selected && !searching && query.length > 1 && results.length === 0 && (
          <div className={styles.noResults}>
            <Search size={28} className={styles.noResultsIcon} />
            <p>No patients found for "{query}"</p>
          </div>
        )}

        {!selected && !query && (
          <div className={styles.patientEmpty}>
            <User size={36} className={styles.patientEmptyIcon} />
            <p>Search for a patient to get AI-powered clinical insights</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DocAssistAI() {
  const [open,       setOpen]       = useState(false);
  const [activeTab,  setActiveTab]  = useState('chat');
  const [patientCtx, setPatientCtx] = useState('');

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      {/* Backdrop */}
      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} />}

      {/* Floating button — hidden when drawer is open */}
      {!open && (
        <button
          className={styles.fab}
          onClick={() => setOpen(true)}
          title="DocAssist AI"
        >
          <Bot size={18} strokeWidth={2} />
          <span className={styles.fabLabel}>DocAssist AI</span>
          <span className={styles.fabBadge}>Beta</span>
        </button>
      )}

      {/* Side Drawer */}
      {open && (
        <div className={styles.drawer}>
          {/* Header */}
          <div className={styles.drawerHeader}>
            <Logo size="sm" />
            <div className={styles.headerText}>
              <span className={styles.headerTitle}>DocAssist AI</span>
              <span className={styles.headerBadge}>Beta</span>
            </div>
            {patientCtx && (
              <div className={styles.headerPatientCtx}>
                <User size={10} /> context
              </div>
            )}
            <button className={styles.headerCloseBtn} onClick={() => setOpen(false)}>
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          {/* Tabs */}
          <div className={styles.tabs}>
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon size={13} strokeWidth={2} />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className={styles.drawerBody}>
            {activeTab === 'chat'     && <ChatTab patientCtx={patientCtx} />}
            {activeTab === 'patients' && <PatientsTab onSetPatientCtx={ctx => { setPatientCtx(ctx); if (ctx) setActiveTab('chat'); }} />}
          </div>
        </div>
      )}
    </>
  );
}
