import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminClient';
import styles from './AdminAudit.module.css';

export default function AdminAudit() {
  const [logs, setLogs] = useState([]);

  useEffect(() => { adminApi.getAuditLogs().then(setLogs).catch(console.error); }, []);

  return (
    <div>
      <h1 className={styles.title}>Audit Log</h1>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Target</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id}>
                <td className={styles.time}>
                  {new Date(l.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td>{l.admin_name}</td>
                <td><code className={styles.action}>{l.action}</code></td>
                <td className={styles.muted}>{l.target_type} #{l.target_id}</td>
                <td className={styles.details}>
                  {l.details ? (
                    <pre className={styles.pre}>{JSON.stringify(l.details, null, 2)}</pre>
                  ) : '—'}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={5} className={styles.empty}>No audit logs yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
