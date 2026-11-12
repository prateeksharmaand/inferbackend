import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutList, Mic2, CreditCard, BarChart2, Settings, LogOut, Users, Wallet, ChevronsLeft, ChevronsRight } from 'lucide-react';
import styles from './Sidebar.module.css';

const ALL_NAV = [
  { to: '/queue',    Icon: LayoutList, label: 'Queue',           perm: 'appointments.view' },
  { to: '/patients', Icon: Users,      label: 'Patients',        perm: 'patients.view' },
  { to: '/voice',    Icon: Mic2,       label: 'Infer Voice AI',  perm: 'consultations.create' },
  { to: '/payments', Icon: CreditCard, label: 'Payments',        perm: 'billing.view' },
  { to: '/wallet',   Icon: Wallet,     label: 'Wallet',          perm: 'billing.view' },
  { to: '/analytics',Icon: BarChart2,  label: 'Analytics',       perm: 'dashboard.analytics' },
  { to: '/settings', Icon: Settings,   label: 'Settings',        perm: 'settings.clinic' },
];

function hasAccess(user, perm) {
  if (!user) return false;
  // Admin always has full access
  if (user.role === 'admin') return true;
  const perms = user.permissions || {};
  // all:true means superuser (e.g. clinic owner)
  if (perms.all) return true;
  return !!perms[perm];
}

export default function Sidebar() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const handleLogout = () => { logout(); navigate('/login'); };

  const nav = ALL_NAV.filter(item => hasAccess(user, item.perm));

  // Slide open / closed; remembered per browser. --sidebar-w keeps fixed panels aligned with it.
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('sidebar_open') === '1'; } catch { return false; } });
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', open ? '220px' : '64px');
    try { localStorage.setItem('sidebar_open', open ? '1' : '0'); } catch { /* private mode */ }
  }, [open]);

  return (
    <aside className={`${styles.sidebar} ${open ? styles.open : ''}`} aria-label="Main navigation">
      <div className={styles.logo}>
        <div className={styles.logoIcon} aria-hidden="true">I</div>
        {open && (
          <div className={styles.logoTextWrap}>
            <span className={styles.logoName}>Infer Care</span>
            <span className={styles.logoSub}>Doctor Management</span>
          </div>
        )}
      </div>

      <button type="button" className={styles.toggle} onClick={() => setOpen(o => !o)}
        aria-expanded={open} aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'} title={open ? 'Collapse' : 'Expand'}>
        {open ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}
      </button>

      <nav className={styles.nav}>
        {nav.map(({ to, Icon, label }) => (
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
        <div className={styles.userRow}>
          <div className={styles.avatar} title={user?.name} aria-hidden="true">
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          {open && (
            <div className={styles.userText}>
              <span className={styles.userName}>{user?.name}</span>
              <span className={styles.userRole}>{user?.role}</span>
            </div>
          )}
        </div>
        <button className={styles.logoutBtn} onClick={handleLogout} title="Logout" aria-label="Logout">
          <LogOut size={15} strokeWidth={1.8} />{open && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
