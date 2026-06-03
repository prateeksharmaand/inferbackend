/**
 * NotificationsTab - Real-time lab notifications and critical value alerts
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, AlertTriangle, Info, Bell, X, CheckCircle } from 'lucide-react';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
});

async function apiFetch(url, options = {}) {
  const res = await fetch(url, { headers: authHeaders(), ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function NotifIcon({ type }) {
  if (type === 'critical') return <AlertTriangle size={16} color="#991b1b" />;
  if (type === 'rejection') return <X size={16} color="#9a3412" />;
  return <Info size={16} color="#1e40af" />;
}

function notifIconBg(type) {
  if (type === 'critical') return '#fee2e2';
  if (type === 'rejection') return '#ffedd5';
  return '#dbeafe';
}

export function NotificationsTab({ labId, styles: s }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const socketRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true); setError('');
      const data = await apiFetch('/api/v1/doctors/critical-values');
      const criticals = (data.critical_values || data || []).map((cv) => ({
        id: cv.id || `cv-${cv.result_id}`,
        type: 'critical',
        title: `Critical Value: ${cv.test_name || cv.test_code}`,
        message: `Patient ${cv.patient_id} — Value: ${cv.result_value} ${cv.unit || ''} (${cv.interpretation || 'CRITICAL'})`,
        timestamp: cv.created_at || cv.result_date,
        read: cv.acknowledged || false,
        raw: cv,
      }));
      setNotifications(criticals);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Connect to socket.io for real-time events
  useEffect(() => {
    fetchNotifications();

    // Try socket.io connection
    try {
      const io = window.io;
      if (io) {
        const socket = io({ transports: ['websocket'] });
        socketRef.current = socket;

        socket.on('critical_value', (data) => {
          const notif = {
            id: `ws-${Date.now()}`,
            type: 'critical',
            title: `Critical Value: ${data.test_name || data.test_code}`,
            message: `Patient ${data.patient_id} — Value: ${data.result_value} ${data.unit || ''}`,
            timestamp: new Date().toISOString(),
            read: false,
            raw: data,
          };
          setNotifications((prev) => [notif, ...prev]);
        });

        socket.on('order_status_change', (data) => {
          const notif = {
            id: `ws-os-${Date.now()}`,
            type: 'status',
            title: `Order Status Changed`,
            message: `Order ${data.order_number || data.order_id} moved to ${data.status}`,
            timestamp: new Date().toISOString(),
            read: false,
            raw: data,
          };
          setNotifications((prev) => [notif, ...prev]);
        });

        socket.on('sample_rejection', (data) => {
          const notif = {
            id: `ws-sr-${Date.now()}`,
            type: 'rejection',
            title: `Sample Rejected`,
            message: `Sample ${data.sample_id} rejected: ${data.reason}`,
            timestamp: new Date().toISOString(),
            read: false,
            raw: data,
          };
          setNotifications((prev) => [notif, ...prev]);
        });

        return () => { socket.disconnect(); };
      }
    } catch (e) {
      // socket.io not available
    }
  }, [fetchNotifications]);

  const markRead = (id) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const filtered = filter === 'ALL' ? notifications
    : filter === 'UNREAD' ? notifications.filter((n) => !n.read)
    : notifications.filter((n) => n.type === filter.toLowerCase());

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Notifications
            {unreadCount > 0 && (
              <span className={`${s.badge} ${s.badgeRed}`}>{unreadCount} new</span>
            )}
          </div>
          <div className={s.pageSubtitle}>Critical values, order updates and sample alerts</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {unreadCount > 0 && (
            <button className={`${s.btn} ${s.btnSecondary}`} onClick={markAllRead}>
              <CheckCircle size={14} /> Mark All Read
            </button>
          )}
          <button className={`${s.btn} ${s.btnSecondary}`} onClick={fetchNotifications}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className={`${s.alert} ${s.alertError}`}>{error}</div>}

      <div className={s.filtersRow}>
        {['ALL', 'UNREAD', 'CRITICAL', 'STATUS', 'REJECTION'].map((f) => (
          <button key={f} className={`${s.filterPill} ${filter === f ? s.filterPillActive : ''}`} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      <div className={s.card}>
        {loading ? (
          <div className={s.emptyState}><div className={s.emptyText}>Loading notifications...</div></div>
        ) : filtered.length === 0 ? (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}><Bell size={48} /></div>
            <div className={s.emptyText}>No notifications</div>
          </div>
        ) : (
          filtered.map((notif) => (
            <div key={notif.id} className={`${s.notifItem} ${notif.read ? s.notifRead : ''}`}>
              <div className={s.notifIconWrap} style={{ background: notifIconBg(notif.type) }}>
                <NotifIcon type={notif.type} />
              </div>
              <div className={s.notifContent}>
                <div className={s.notifTitle}>{notif.title}</div>
                <div className={s.notifMsg}>{notif.message}</div>
                {notif.timestamp && (
                  <div className={s.notifTime}>{new Date(notif.timestamp).toLocaleString()}</div>
                )}
              </div>
              {!notif.read && (
                <button
                  className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                  onClick={() => markRead(notif.id)}
                  title="Mark as read"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default NotificationsTab;
