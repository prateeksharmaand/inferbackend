import { useState, useEffect } from 'react';
import { MessageSquare, CheckCircle, AlertTriangle, Brain, TrendingUp, Clock } from 'lucide-react';
import { api } from '../api/client';
import styles from './InboundAnalytics.module.css';

const PERIODS = [
  { label: 'Last 7 days',  value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
];

const CHANNEL_COLORS = {
  sms:      '#2563eb',
  whatsapp: '#16a34a',
  ivr:      '#d97706',
  chat:     '#7c3aed',
};

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon} style={{ background: color + '18', color }}>
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <div className={styles.statBody}>
        <div className={styles.statValue}>{value}</div>
        <div className={styles.statLabel}>{label}</div>
        {sub && <div className={styles.statSub}>{sub}</div>}
      </div>
    </div>
  );
}

function BarRow({ label, count, total, color }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className={styles.barRow}>
      <span className={styles.barLabel}>{label}</span>
      <div className={styles.barTrack}>
        <div className={styles.barFill} style={{ width: `${pct}%`, background: color || 'var(--color-primary)' }} />
      </div>
      <span className={styles.barCount}>{count}</span>
      <span className={styles.barPct}>{pct}%</span>
    </div>
  );
}

export default function InboundAnalytics() {
  const [days, setDays]       = useState(30);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.get(`/inbound/analytics?days=${days}`);
      setData(result);
    } catch { setData(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [days]);

  const totals     = data?.totals     || {};
  const byChannel  = data?.by_channel || [];
  const byState    = data?.by_state   || [];
  const peakHours  = data?.peak_hours || [];
  const handoff    = data?.handoff_rate || {};

  const total = parseInt(totals.total_conversations || 0, 10);

  const confidencePct = totals.avg_confidence
    ? Math.round(parseFloat(totals.avg_confidence) * 100)
    : null;

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.periodPicker}>
          {PERIODS.map(p => (
            <button key={p.value}
              className={`${styles.periodBtn} ${days === p.value ? styles.periodActive : ''}`}
              onClick={() => setDays(p.value)}>
              {p.label}
            </button>
          ))}
        </div>
        <button className={styles.refreshBtn} onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}><Clock size={20} strokeWidth={1.5} /> Loading analytics…</div>
      ) : !data ? (
        <div className={styles.loading}>Failed to load analytics.</div>
      ) : (
        <>
          {/* ── Stat cards ── */}
          <div className={styles.statsGrid}>
            <StatCard
              icon={MessageSquare}
              label="Total Conversations"
              value={total}
              sub={`Past ${days} days`}
              color="#2563eb"
            />
            <StatCard
              icon={CheckCircle}
              label="Appointments Booked"
              value={parseInt(totals.booked || 0, 10)}
              sub={total ? `${Math.round((totals.booked / total) * 100)}% conversion` : '—'}
              color="#16a34a"
            />
            <StatCard
              icon={AlertTriangle}
              label="Handoff Rate"
              value={`${handoff.handoff_pct || 0}%`}
              sub={`${parseInt(totals.handed_off || 0, 10)} conversations handed to staff`}
              color="#d97706"
            />
            <StatCard
              icon={Brain}
              label="AI Confidence"
              value={confidencePct !== null ? `${confidencePct}%` : '—'}
              sub="Average per resolved conversation"
              color="#7c3aed"
            />
          </div>

          <div className={styles.chartsRow}>
            {/* ── By Channel ── */}
            <div className={styles.chartCard}>
              <div className={styles.chartTitle}>
                <TrendingUp size={14} strokeWidth={2} /> By Channel
              </div>
              {byChannel.length === 0 ? (
                <p className={styles.noData}>No data yet</p>
              ) : byChannel.map(row => (
                <BarRow
                  key={row.channel}
                  label={row.channel?.toUpperCase()}
                  count={parseInt(row.count, 10)}
                  total={total}
                  color={CHANNEL_COLORS[row.channel]}
                />
              ))}
            </div>

            {/* ── By State ── */}
            <div className={styles.chartCard}>
              <div className={styles.chartTitle}>
                <CheckCircle size={14} strokeWidth={2} /> By Outcome
              </div>
              {byState.length === 0 ? (
                <p className={styles.noData}>No data yet</p>
              ) : byState.map(row => (
                <BarRow
                  key={row.state}
                  label={row.state?.charAt(0).toUpperCase() + row.state?.slice(1)}
                  count={parseInt(row.count, 10)}
                  total={total}
                />
              ))}
            </div>

            {/* ── Peak Hours ── */}
            <div className={styles.chartCard}>
              <div className={styles.chartTitle}>
                <Clock size={14} strokeWidth={2} /> Peak Inbound Hours
              </div>
              {peakHours.length === 0 ? (
                <p className={styles.noData}>No data yet</p>
              ) : (
                <div className={styles.peakTable}>
                  <div className={styles.peakHead}>
                    <span>Hour</span><span>Messages</span>
                  </div>
                  {peakHours.map(row => (
                    <div key={row.hour} className={styles.peakRow}>
                      <span>{_formatHour(row.hour)}</span>
                      <span className={styles.peakCount}>{row.msgs}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Summary note ── */}
          <div className={styles.note}>
            <Brain size={13} /> Conversations where Gemini AI successfully books an appointment without human intervention count as fully automated.
            Handoff occurs when AI confidence drops below 45% or after 20 turns.
          </div>
        </>
      )}
    </div>
  );
}

function _formatHour(h) {
  const n = parseInt(h, 10);
  const ampm = n < 12 ? 'AM' : 'PM';
  const disp = n === 0 ? 12 : n > 12 ? n - 12 : n;
  return `${disp}:00 ${ampm}`;
}
