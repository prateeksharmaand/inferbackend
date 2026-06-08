import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import styles from './AdminLayout.module.css';

const NAV = [
  { to: '/admin/dashboard',      label: 'Dashboard'  },
  { to: '/admin/clinics',        label: 'Clinics'    },
  { to: '/admin/subscriptions',  label: 'Subscriptions' },
  { to: '/admin/audit',          label: 'Audit Log'  },
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
          <span className={styles.brandName}>Infer</span>
          <span className={styles.brandBadge}>Admin</span>
        </div>

        <nav className={styles.nav}>
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.footer}>
          <span className={styles.adminEmail}>{admin?.email}</span>
          <button className={styles.logoutBtn} onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
