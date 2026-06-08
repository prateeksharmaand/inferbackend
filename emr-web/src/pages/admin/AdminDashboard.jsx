import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/adminClient';
import styles from './AdminDashboard.module.css';

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={styles.statCard} style={{ borderTopColor: accent }}>
      <div className={styles.statValue}>{value ?? '—'}</div>
      <div className={styles.statLabel}>{label}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats]     = useState(null);
  const [revenue, setRevenue] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    adminApi.getStats().then(setStats).catch(console.error);
    adminApi.getRevenue().then(setRevenue).catch(console.error);
  }, []);

  const planMap = {};
  stats?.subscriptions?.forEach(s => { planMap[s.plan_key] = s.count; });

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <button className={styles.newBtn} onClick={() => navigate('/admin/clinics?new=1')}>
          + New Clinic
        </button>
      </div>

      <div className={styles.statGrid}>
        <StatCard label="Total Clinics"    value={stats?.clinics?.total}           accent="#2563eb" />
        <StatCard label="Active Clinics"   value={stats?.clinics?.active}          accent="#16a34a" />
        <StatCard label="Suspended"        value={stats?.clinics?.suspended}       accent="#d97706" />
        <StatCard label="New This Month"   value={stats?.clinics?.new_this_month}  accent="#2563eb" />
        <StatCard label="Total Patients"   value={stats?.total_patients}           accent="#2563eb" />
        <StatCard label="Pro Clinics"      value={planMap['pro'] ?? 0}             accent="#16a34a" />
        <StatCard label="Base (Free)"      value={planMap['base'] ?? 0}            accent="#64748b" />
      </div>

      {revenue.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Revenue (last 12 months)</h2>
          <div className={styles.revenueTable}>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Orders</th>
                  <th>Revenue (₹)</th>
                </tr>
              </thead>
              <tbody>
                {revenue.map(r => (
                  <tr key={r.month}>
                    <td>{new Date(r.month).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</td>
                    <td>{r.orders}</td>
                    <td>₹{(r.total_paise / 100).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
