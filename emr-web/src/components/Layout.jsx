import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar      from './Sidebar';
import TopBar       from './TopBar';
import Banner       from './Banner';
import InfoStrip    from './InfoStrip';
import UpgradeModal from './UpgradeModal';
import styles       from './Layout.module.css';

export default function Layout() {
  const { pathname } = useLocation();
  const onSettings   = pathname.includes('/settings');
  const hideTopBar   = pathname.startsWith('/rx/') || onSettings;
  const hideBanner   = pathname.startsWith('/rx/') || onSettings;

  const [limitEvent, setLimitEvent] = useState(null);

  useEffect(() => {
    const handler = (e) => setLimitEvent(e.detail);
    window.addEventListener('subscription:limit', handler);
    return () => window.removeEventListener('subscription:limit', handler);
  }, []);

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        {!hideBanner && <Banner />}
        {!hideBanner && <InfoStrip />}
        {!hideTopBar && <TopBar />}
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>

      {limitEvent && (
        <UpgradeModal
          triggerResource={limitEvent.resource}
          limitMessage={limitEvent.message}
          onClose={() => setLimitEvent(null)}
        />
      )}
    </div>
  );
}
