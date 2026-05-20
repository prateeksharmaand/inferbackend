import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Sidebar.module.css';

const NAV = [
  { to: '/queue',    icon: '☰',  label: 'Queue' },
  { to: '/voice',   icon: '🎙',  label: 'Infer Voice AI' },
  { to: '/payments',icon: '₹',   label: 'Payments' },
  { to: '/analytics',icon: '📊', label: 'Dr Analytics' },
  { to: '/abha',    icon: '🏥',  label: 'ABHA' },
];

export default function Sidebar() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <div className={styles.logoIcon}>I</div>
        <div className={styles.logoTextWrap}>
          <span className={styles.logoName}>Infer Care</span>
          <span className={styles.logoSub}>Doctor Management</span>
        </div>
      </div>

      <nav className={styles.nav}>
        {NAV.map(({ to, icon, label }) => (
          <NavLink
            key={to} to={to}
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            title={label}
          >
            <span className={styles.icon}>{icon}</span>
            <span className={styles.navLabel}>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className={styles.bottom}>
        <button className={styles.avatar} title={user?.name} onClick={handleLogout}>
          {user?.name?.[0]?.toUpperCase() ?? 'U'}
        </button>
      </div>
    </aside>
  );
}
