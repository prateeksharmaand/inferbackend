import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Building2, CreditCard, ScrollText, LogOut } from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import styles from './AdminLayout.module.css';

const NAV = [
  { to: '/admin/dashboard',     Icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/admin/clinics',       Icon: Building2,        label: 'Clinics'     },
  { to: '/admin/subscriptions', Icon: CreditCard,       label: 'Subscriptions' },
  { to: '/admin/audit',         Icon: ScrollText,       label: 'Audit Log'   },
];

export default function AdminLayout() {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>I</div>
          <span className={styles.brandName}>Infer</span>
          <span className={styles.brandBadge}>Admin</span>
        </div>

        <nav className={styles.nav}>
          {NAV.map(({ to, Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
              title={label}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label.split(' ')[0]}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.footer}>
          <div className={styles.avatar} title={admin?.email}>
            {admin?.name?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout} title="Sign out">
            <LogOut size={15} strokeWidth={1.8} />
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
