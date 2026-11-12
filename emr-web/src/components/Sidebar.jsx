import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
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

  // Clinic name + logo (Settings → Clinic Website logo, else the InferPad logo in this browser)
  const cid = user?.clinic_id;
  const localLogo = () => { try { return cid ? localStorage.getItem(`rx_logo_${cid}`) || '' : ''; } catch { return ''; } };
  const [brand, setBrand] = useState(() => ({ name: user?.clinic_name || '', logo: localLogo() }));
  useEffect(() => {
    if (!cid) return undefined;
    let alive = true;
    const load = () => api.get('/clinic-branding')
      .then(b => { if (alive) setBrand({ name: b?.name || user?.clinic_name || '', logo: b?.logo || localLogo() }); })
      .catch(() => { if (alive) setBrand(x => ({ ...x, logo: x.logo || localLogo() })); });
    load();
    window.addEventListener('storage', load);             // logo changed in InferPad settings
    window.addEventListener('clinic-branding:changed', load);
    return () => { alive = false; window.removeEventListener('storage', load); window.removeEventListener('clinic-branding:changed', load); };
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps
  const clinicName = brand.name || 'Infer Care';
  const initial = (clinicName.trim()[0] || 'I').toUpperCase();

  return (
    <aside className={`${styles.sidebar} ${open ? styles.open : ''}`} aria-label="Main navigation">
      <div className={styles.logo} title={clinicName}>
        <div className={`${styles.logoIcon} ${brand.logo ? styles.logoHasImg : ''}`} aria-hidden="true">
          {brand.logo ? <img src={brand.logo} alt="" /> : initial}
        </div>
        {open && (
          <div className={styles.logoTextWrap}>
            <span className={styles.logoName}>{clinicName}</span>
            <span className={styles.logoSub}>{brand.name ? 'Powered by Infer Care' : 'Doctor Management'}</span>
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
