import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar  from './TopBar';
import Banner  from './Banner';
import styles  from './Layout.module.css';

export default function Layout() {
  const { pathname } = useLocation();
  const onSettings  = pathname.includes('/settings');
  const hideTopBar  = pathname.startsWith('/rx/') || onSettings;
  const hideBanner  = pathname.startsWith('/rx/') || onSettings;

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        {!hideBanner && <Banner />}
        {!hideTopBar && <TopBar />}
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
