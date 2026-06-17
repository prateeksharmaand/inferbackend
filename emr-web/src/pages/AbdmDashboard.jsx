import { useState, useEffect } from 'react';
import { BarChart3, Activity, Users, Shield, AlertCircle, RefreshCw, TrendingUp, Database } from 'lucide-react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

function Card({ title, value, icon: Icon, color = '#7c3aed' }) {
  return (
    <div style={{
      background: '#fff',
      border: '1.5px solid #e2e8f0',
      borderRadius: 12,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    }}>
      <div style={{
        width: 48,
        height: 48,
        background: `${color}20`,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Icon size={20} color={color} strokeWidth={2} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#1e293b' }}>
          {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
        </div>
      </div>
    </div>
  );
}

export default function AbdmDashboard() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/abdm/dashboard');
      setData(res);
      setLastRefresh(new Date());
      toast.success('Dashboard refreshed');
    } catch (err) {
      toast.error('Failed to load dashboard: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const autoRefresh = setInterval(load, 30000); // 30s
  useEffect(() => () => clearInterval(autoRefresh), []);

  if (loading) {
    return (
      <div style={{ padding: '40px 32px', maxWidth: 1200, margin: '0 auto', textAlign: 'center', color: '#94a3b8' }}>
        <p>Loading ABDM dashboard…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: '40px 32px', maxWidth: 1200, margin: '0 auto', textAlign: 'center', color: '#ef4444' }}>
        <AlertCircle size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
        <p>Failed to load ABDM dashboard</p>
        <button
          onClick={load}
          style={{
            marginTop: 12,
            padding: '8px 16px',
            background: '#7c3aed',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, color: '#1e293b' }}>
            ABDM Gateway Status
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Real-time health information exchange activity
          </p>
        </div>
        <button
          onClick={load}
          style={{
            padding: '8px 14px',
            background: '#f1f5f9',
            border: '1.5px solid #e2e8f0',
            borderRadius: 6,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontWeight: 600,
            fontSize: 13,
            color: '#475569',
          }}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Gateway info banner */}
      <div style={{
        background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
        color: '#fff',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 24,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 20,
      }}>
        <div>
          <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gateway URL</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, fontFamily: 'monospace' }}>{data.gatewayUrl}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 0.5 }}>HIP ID</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, fontFamily: 'monospace' }}>{data.hipId || 'Not configured'}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Environment</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, background: data.environment === 'production' ? '#ef4444' : '#fbbf24', borderRadius: '50%', display: 'inline-block' }}></span>
            {data.environment}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
        marginBottom: 28,
      }}>
        <Card
          title="Pending OTP Requests"
          value={data.pendingOtps || 0}
          icon={AlertCircle}
          color="#f59e0b"
        />
        <Card
          title="Health Requests"
          value={data.healthRequests?.reduce((sum, r) => sum + parseInt(r.count || 0), 0) || 0}
          icon={Activity}
          color="#06b6d4"
        />
        <Card
          title="Care Contexts Shared"
          value={data.careContexts?.total || 0}
          icon={Database}
          color="#8b5cf6"
        />
        <Card
          title="With FHIR Data"
          value={data.careContexts?.with_fhir || 0}
          icon={TrendingUp}
          color="#16a34a"
        />
      </div>

      {/* Health Requests breakdown */}
      <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={16} color="#06b6d4" /> Health Request Status Breakdown (24h)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {(!data.healthRequests || data.healthRequests.length === 0) ? (
            <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>No requests yet</p>
          ) : (
            data.healthRequests.map((hr, i) => (
              <div key={i} style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '12px 14px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>
                  {hr.count}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>
                  {hr.status || 'unknown'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Consent status */}
      <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={16} color="#7c3aed" /> Consent Status Breakdown
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {(!data.consentStatus || data.consentStatus.length === 0) ? (
            <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>No consent artifacts</p>
          ) : (
            data.consentStatus.map((cs, i) => {
              const colors = { REQUESTED: '#f59e0b', GRANTED: '#16a34a', DENIED: '#ef4444', REVOKED: '#dc2626', EXPIRED: '#94a3b8' };
              return (
                <div key={i} style={{
                  background: '#f8fafc',
                  border: `1.5px solid ${colors[cs.status] || '#e2e8f0'}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors[cs.status] || '#64748b', marginBottom: 4 }}>
                    {cs.count}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>
                    {cs.status || 'unknown'}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Audit events (last 24h) */}
      <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '20px 24px' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={16} color="#06b6d4" /> Audit Events (Last 24 Hours)
        </h3>
        {(!data.auditLast24h || data.auditLast24h.length === 0) ? (
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>No audit events recorded</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {data.auditLast24h.map((evt, i) => (
              <div key={i} style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '12px 14px',
                borderLeft: `3px solid #7c3aed`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {evt.event_type}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#7c3aed' }}>
                  {evt.count}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Last refresh */}
      <div style={{ marginTop: 20, fontSize: 12, color: '#94a3b8', textAlign: 'right' }}>
        Last refreshed: {lastRefresh.toLocaleTimeString('en-IN')}
      </div>
    </div>
  );
}
