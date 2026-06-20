import { useState, useEffect } from 'react';
import { Stethoscope, Shield, Zap, Bell, Heart, Activity, Users, FileText, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api/client';

const STRIPS = [
  {
    icon: Shield,
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#e9d5ff',
    text: 'ABHA Scan & Share is active — patients can scan your facility QR to share their health profile instantly.',
    tag: 'ABDM',
  },
  {
    icon: Stethoscope,
    color: '#0284c7',
    bg: '#eff6ff',
    border: '#bfdbfe',
    text: 'Tip: Complete patient encounters before end of day to auto-generate FHIR bundles and link care contexts to ABDM.',
    tag: 'Workflow',
  },
  {
    icon: Heart,
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fecaca',
    text: 'Health Fact: Regular BP monitoring catches hypertension early. Encourage patients to check at every visit.',
    tag: 'Health Tip',
  },
  {
    icon: Activity,
    color: '#16a34a',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    text: 'Consent-based health record sharing is now live. Patients can grant and revoke access anytime via ABDM PHR app.',
    tag: 'ABDM M3',
  },
  {
    icon: FileText,
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    text: 'Tip: Use Infer Voice AI to transcribe consultations and auto-fill prescriptions, diagnosis, and SOAP notes.',
    tag: 'AI Feature',
  },
  {
    icon: Users,
    color: '#7c3aed',
    bg: '#faf5ff',
    border: '#e9d5ff',
    text: 'Multi-clinic ABDM: Each clinic has its own HIP/HIU identity. Configure in Clinic Settings → ABDM Configuration.',
    tag: 'Multi-tenant',
  },
  {
    icon: Bell,
    color: '#0891b2',
    bg: '#ecfeff',
    border: '#a5f3fc',
    text: 'Reminder: Profile share tokens expire in 30 minutes. Check the appointment card for the countdown timer.',
    tag: 'Reminder',
  },
];

export default function InfoStrip() {
  const [idx, setIdx] = useState(0);
  const [stats, setStats] = useState(null);
  const [fade, setFade] = useState(true);

  // Auto-rotate every 8 seconds
  useEffect(() => {
    const id = setInterval(() => advance(1), 8000);
    return () => clearInterval(id);
  }, [idx]);

  // Fetch quick stats
  useEffect(() => {
    api.get('/appointments?date=' + new Date().toISOString().slice(0, 10))
      .then(rows => setStats({ today: rows.length, booked: rows.filter(r => r.status === 'booked').length, ongoing: rows.filter(r => r.status === 'ongoing').length }))
      .catch(() => {});
  }, []);

  const advance = (dir) => {
    setFade(false);
    setTimeout(() => {
      setIdx(i => (i + dir + STRIPS.length) % STRIPS.length);
      setFade(true);
    }, 150);
  };

  const strip = STRIPS[idx];
  const Icon  = strip.icon;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      background: strip.bg, borderBottom: `1px solid ${strip.border}`,
      minHeight: 32, fontSize: 12,
    }}>
      {/* Stats pills */}
      {stats && (
        <div style={{ display: 'flex', gap: 0, borderRight: `1px solid ${strip.border}`, flexShrink: 0 }}>
          {[
            { label: 'Today', val: stats.today, color: '#475569' },
            { label: 'Waiting', val: stats.booked, color: '#7c3aed' },
            { label: 'Ongoing', val: stats.ongoing, color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{ padding: '0 12px', borderRight: `1px solid ${strip.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 52 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{s.val}</span>
              <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Rotating info message */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', overflow: 'hidden',
        opacity: fade ? 1 : 0, transition: 'opacity 0.15s ease' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: strip.color + '15', color: strip.color, borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0 }}>
          <Icon size={9} /> {strip.tag}
        </span>
        <span style={{ color: '#374151', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {strip.text}
        </span>
      </div>

      {/* Nav buttons */}
      <div style={{ display: 'flex', borderLeft: `1px solid ${strip.border}`, flexShrink: 0 }}>
        <button onClick={() => advance(-1)} style={{ background: 'none', border: 'none', padding: '0 8px', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
          <ChevronLeft size={12} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '0 4px' }}>
          {STRIPS.map((_, i) => (
            <button key={i} onClick={() => { setFade(false); setTimeout(() => { setIdx(i); setFade(true); }, 150); }}
              style={{ width: i === idx ? 14 : 5, height: 5, borderRadius: 3, background: i === idx ? strip.color : '#e2e8f0', border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.2s' }} />
          ))}
        </div>
        <button onClick={() => advance(1)} style={{ background: 'none', border: 'none', padding: '0 8px', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
