import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutList, Mic2, CreditCard, BarChart2, ShieldPlus, Settings, LogOut } from 'lucide-react';
import styles from './Sidebar.module.css';

const NAV = [
  { to: '/queue',     Icon: LayoutList, label: 'Queue' },
  { to: '/voice',     Icon: Mic2,       label: 'Infer Voice AI' },
  { to: '/payments',  Icon: CreditCard, label: 'Payments' },
  { to: '/analytics', Icon: BarChart2,  label: 'Dr Analytics' },
  { to: '/abha',      Icon: ShieldPlus, label: 'ABHA' },
  { to: '/settings',  Icon: Settings,   label: 'Settings' },
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
        {NAV.map(({ to, Icon, label }) => (
          <NavLink
            key={to} to={to}
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            title={label}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span className={styles.navLabel}>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className={styles.bottom}>
        <button className={styles.avatar} title={`${user?.name} — Logout`} onClick={handleLogout}>
          {user?.name?.[0]?.toUpperCase() ?? 'U'}
        </button>
        <button className={styles.logoutBtn} onClick={handleLogout} title="Logout">
          <LogOut size={15} strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  );
}
