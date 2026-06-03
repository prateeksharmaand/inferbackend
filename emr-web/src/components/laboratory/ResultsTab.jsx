/**
 * ResultsTab - OpenELIS-inspired Enter Results by department
 */

import React, { useState, useEffect, useCallback } from 'react';
import { FlaskConical, Save } from 'lucide-react';

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

const LAB_SECTIONS = [
  'Serology Department',
  'Histopathology Department',
  'Microbiology Department',
  'Pathology Department',
  'Biochemistry Department',
  'Haematology Lab Department',
];

const SECTION_KEYWORDS = {
  'Serology Department': ['serology', 'hiv', 'hepatitis', 'widal', 'vdrl', 'rpr'],
  'Histopathology Department': ['histopathology', 'biopsy', 'histology', 'tissue'],
  'Microbiology Department': ['microbiology', 'culture', 'sensitivity', 'gram', 'bacteria', 'fungal'],
  'Pathology Department': ['pathology', 'cytology', 'pap smear'],
  'Biochemistry Department': ['biochemistry', 'glucose', 'creatinine', 'urea', 'cholesterol', 'liver', 'kidney', 'thyroid', 'tsh', 'hba1c'],
  'Haematology Lab Department': ['haematology', 'hematology', 'cbc', 'hemoglobin', 'platelet', 'wbc', 'rbc', 'blood count'],
};

function matchesDepartment(order, department) {
  const keywords = SECTION_KEYWORDS[department] || [];
  const testName = (order.test_name || order.department || order.section_name || '').toLowerCase();
  return keywords.some((k) => testName.includes(k));
}

export function ResultsTab({ labId, styles: s }) {
  const [selectedDept, setSelectedDept] = useState(LAB_SECTIONS[0]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({}); // { orderId: { value, abnormal } }
  const [savingRow, setSavingRow] = useState({});
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');

  // Referred out
  const [referredOrders, setReferredOrders] = useState([]);
  const [referredResults, setReferredResults] = useState({});
  const [referredSaving, setReferredSaving] = useState(false);

  const showMsg = (m, t = 'success') => { setMsg(m); setMsgType(t); setTimeout(() => setMsg(''), 5000); };

  const loadOrders = useCallback(async () => {
    if (!labId) return;
    try {
      setLoading(true);
      const data = await apiFetch(`/api/v1/orders/lab/${labId}?status=COLLECTED,PROCESSING`);
      const all = data.orders || data || [];
      setOrders(all);
      // Init results state
      const init = {};
      all.forEach((o) => { init[o.id] = { value: o.result_value || '', abnormal: o.is_abnormal || false }; });
      setResults((prev) => ({ ...init, ...prev }));
      // Referred out: orders with "referral" in notes
      setReferredOrders(all.filter((o) => (o.notes || '').toLowerCase().includes('referral') || o.is_referred));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [labId]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const filteredOrders = orders.filter((o) => matchesDepartment(o, selectedDept));

  const handleResultChange = (orderId, field, value) => {
    setResults((prev) => ({ ...prev, [orderId]: { ...(prev[orderId] || {}), [field]: value } }));
  };

  const handleSaveRow = async (order) => {
    const resultData = results[order.id] || {};
    try {
      setSavingRow((p) => ({ ...p, [order.id]: true }));
      await apiFetch('/api/v1/labs/upload-result', {
        method: 'POST',
        body: JSON.stringify({
          format: 'JSON',
          patient_id: order.patient_id,
          order_id: order.id,
          data: {
            test_name: order.test_name || 'Unknown Test',
            result_value: resultData.value || '',
            is_abnormal: resultData.abnormal || false,
            unit: order.unit || '',
          },
        }),
      });
      // Also update order status to PROCESSING if it's COLLECTED
      if (order.status === 'COLLECTED') {
        await apiFetch(`/api/v1/orders/${order.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'PROCESSING' }),
        }).catch(() => {});
      }
      showMsg(`Result saved for ${order.test_name || order.id}`);
      loadOrders();
    } catch (err) {
      showMsg(`Failed: ${err.message}`, 'error');
    } finally {
      setSavingRow((p) => ({ ...p, [order.id]: false }));
    }
  };

  const handleReferredChange = (orderId, field, value) => {
    setReferredResults((prev) => ({ ...prev, [orderId]: { ...(prev[orderId] || {}), [field]: value } }));
  };

  const handleSaveReferred = async () => {
    try {
      setReferredSaving(true);
      for (const order of referredOrders) {
        const rd = referredResults[order.id];
        if (rd && rd.markDone) {
          await apiFetch(`/api/v1/orders/${order.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'REPORTED', notes: rd.notes || order.notes }),
          }).catch(() => {});
        }
        if (rd && rd.cancelReferral) {
          await apiFetch(`/api/v1/orders/${order.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'CANCELLED', notes: 'Referral cancelled' }),
          }).catch(() => {});
        }
      }
      showMsg('Referred orders updated');
      loadOrders();
    } catch (err) {
      showMsg(`Failed: ${err.message}`, 'error');
    } finally {
      setReferredSaving(false);
    }
  };

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Results</div>
          <div className={s.pageSubtitle}>Enter and validate lab results by department</div>
        </div>
      </div>

      {msg && <div className={`${s.alert} ${msgType === 'error' ? s.alertError : s.alertSuccess}`}>{msg}</div>}

      {/* Department selector */}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div className={s.cardBody} style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 8 }}>SELECT DEPARTMENT</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {LAB_SECTIONS.map((dept) => (
              <button
                key={dept}
                className={`${s.btn} ${s.btnSm} ${selectedDept === dept ? s.btnPrimary : s.btnSecondary}`}
                onClick={() => setSelectedDept(dept)}
              >
                {dept.replace(' Department', '').replace(' Lab', '')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results pending entry */}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div className={s.cardHeader}>
          <div className={s.cardTitle}><FlaskConical size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />{selectedDept} — Pending Results</div>
          <span className={`${s.badge} ${s.badgeBlue}`}>{filteredOrders.length} orders</span>
        </div>
        {loading ? (
          <div className={s.emptyState}><div className={s.emptyText}>Loading...</div></div>
        ) : filteredOrders.length === 0 ? (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}><FlaskConical size={48} /></div>
            <div className={s.emptyText}>No pending results for {selectedDept}</div>
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>{['Accession #', 'Patient ID', 'Request Date', 'Test Name', 'Result', 'Abnormal', 'Action'].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const rowResult = results[order.id] || { value: '', abnormal: false };
                  return (
                    <tr key={order.id}>
                      <td style={{ fontWeight: 600 }}>{order.accession_number || order.id}</td>
                      <td>{order.patient_id || '—'}</td>
                      <td>{order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</td>
                      <td>{order.test_name || '—'}</td>
                      <td>
                        <input
                          className={s.input}
                          style={{ minWidth: 120 }}
                          value={rowResult.value}
                          onChange={(e) => handleResultChange(order.id, 'value', e.target.value)}
                          placeholder="Enter result..."
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={rowResult.abnormal}
                          onChange={(e) => handleResultChange(order.id, 'abnormal', e.target.checked)}
                        />
                      </td>
                      <td>
                        <button
                          className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`}
                          onClick={() => handleSaveRow(order)}
                          disabled={savingRow[order.id]}
                        >
                          <Save size={12} /> {savingRow[order.id] ? '...' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Referred Out section */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.cardTitle}>Referred Out</div>
          <span className={`${s.badge} ${s.badgeYellow}`}>{referredOrders.length} referred</span>
        </div>
        {referredOrders.length === 0 ? (
          <div className={s.emptyState}>
            <div className={s.emptyText}>No referred orders</div>
          </div>
        ) : (
          <>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>{['Patient ID', 'Accession #', 'Request Date', 'Sample Type', 'Test Name', 'Result', 'Abnormal', 'Mark Done', 'Report Date', 'Cancel Referral', 'Notes', 'Files'].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {referredOrders.map((order) => {
                    const rd = referredResults[order.id] || {};
                    return (
                      <tr key={order.id}>
                        <td>{order.patient_id || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{order.accession_number || order.id}</td>
                        <td>{order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</td>
                        <td>{order.sample_type || '—'}</td>
                        <td>{order.test_name || '—'}</td>
                        <td>
                          <input
                            className={s.input}
                            style={{ minWidth: 100 }}
                            value={rd.result || ''}
                            onChange={(e) => handleReferredChange(order.id, 'result', e.target.value)}
                            placeholder="Result..."
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={rd.abnormal || false} onChange={(e) => handleReferredChange(order.id, 'abnormal', e.target.checked)} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={rd.markDone || false} onChange={(e) => handleReferredChange(order.id, 'markDone', e.target.checked)} />
                        </td>
                        <td>
                          <input
                            className={s.input}
                            type="date"
                            style={{ minWidth: 130 }}
                            value={rd.reportDate || ''}
                            onChange={(e) => handleReferredChange(order.id, 'reportDate', e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={rd.cancelReferral || false} onChange={(e) => handleReferredChange(order.id, 'cancelReferral', e.target.checked)} />
                        </td>
                        <td>
                          <input
                            className={s.input}
                            style={{ minWidth: 120 }}
                            value={rd.notes || ''}
                            onChange={(e) => handleReferredChange(order.id, 'notes', e.target.value)}
                            placeholder="Notes..."
                          />
                        </td>
                        <td>
                          <span style={{ fontSize: 11, color: 'var(--color-text-2)' }}>—</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={s.formActions} style={{ padding: '12px 16px' }}>
              <button className={`${s.btn} ${s.btnSecondary}`} onClick={loadOrders}>Cancel</button>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleSaveReferred} disabled={referredSaving}>
                {referredSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ResultsTab;
