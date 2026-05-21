import { useState } from 'react';
import { X, Plus, Eye, Pencil, Trash2, CheckCircle } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import CreateReceiptModal from './CreateReceiptModal';
import styles from './ViewReceiptsModal.module.css';

const STATUS_LABEL = {
  unbilled: { label: 'Unbilled', cls: 'statusUnbilled' },
  paid:     { label: 'Received', cls: 'statusPaid' },
  partial:  { label: 'Partial',  cls: 'statusPartial' },
  due:      { label: 'Due',      cls: 'statusDue' },
};

function fmtDateTime(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

function getRxImages(clinicId) {
  const cid = clinicId || 'default';
  return {
    headerImg:  localStorage.getItem(`rx_header_${cid}`)  || '',
    footerImg:  localStorage.getItem(`rx_footer_${cid}`)  || '',
  };
}

// ── Single receipt view (right side of the post-receipt screen) ───────────────
function ReceiptDocumentView({ receipt, appt, user, rxImages, onClose }) {
  const ReceiptDocument = () => {
    const items = receipt.items || [];
    return (
      <div className={styles.rxDoc} id="receipt-print-area">
        {rxImages.headerImg ? (
          <div className={styles.rxImgBlock}><img src={rxImages.headerImg} alt="Header" className={styles.rxImg} /></div>
        ) : (
          <div className={styles.rxHeader}>
            <div>
              <div className={styles.rxClinicName}>{user?.clinic_name || 'Clinic'}</div>
              <div className={styles.rxClinicAddr}>{user?.clinic_address || ''}</div>
            </div>
            <div className={styles.rxDrName}>Dr. {user?.name || ''}</div>
          </div>
        )}
        <div className={styles.rxMetaRow}>
          <span><strong>Receipt No:</strong> {receipt.id}</span>
          <span><strong>Visit Date:</strong> {fmtDateTime(receipt.created_at || new Date()).date}</span>
        </div>
        <div className={styles.rxBilledTo}>
          <strong>Billed To:</strong> {receipt.patient_name}
          {receipt.phone && ` | ${receipt.phone}`}
          {receipt.uhid  && ` | ${receipt.uhid}`}
        </div>
        <table className={styles.rxTable}>
          <thead>
            <tr>
              <th className={styles.rxThN}>S.No</th>
              <th>Service</th>
              <th className={styles.rxThR}>Qty</th>
              <th className={styles.rxThR}>Amount</th>
              <th className={styles.rxThR}>Discount</th>
              <th className={styles.rxThR}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td className={styles.rxTdN}>{String(i+1).padStart(2,'0')}</td>
                <td className={styles.capitalize}>{item.service_name}</td>
                <td className={styles.rxTdR}>{String(item.qty||1).padStart(2,'0')}</td>
                <td className={styles.rxTdR}>Rs. {parseFloat(item.amount||0).toFixed(0)}</td>
                <td className={styles.rxTdR}>{parseFloat(item.discount||0)>0?`Rs. ${parseFloat(item.discount).toFixed(0)}`:'0'}</td>
                <td className={styles.rxTdR}>Rs. {parseFloat(item.total||0).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={styles.rxTotals}>
          <div className={styles.rxTotalRow}><span>Sub Total</span><span>{parseFloat(receipt.total_amount||0).toFixed(0)}</span></div>
          <div className={styles.rxTotalRow}><span>Total Discount</span><span>{parseFloat(receipt.total_discount||0).toFixed(0)}</span></div>
          <div className={`${styles.rxTotalRow} ${styles.rxGrand}`}><span>Grand Total</span><span>Rs. {parseFloat(receipt.grand_total||0).toFixed(0)}</span></div>
          <div className={styles.rxTotalRow}><span>● Paid Via {receipt.paymode||'Cash'}</span><span>Rs. {parseFloat(receipt.amount_paid||0).toFixed(0)}</span></div>
        </div>
        {rxImages.footerImg ? (
          <div className={styles.rxImgBlock}><img src={rxImages.footerImg} alt="Footer" className={styles.rxImg} /></div>
        ) : (
          <div className={styles.rxFooterTxt}>{user?.clinic_name || ''}</div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`${styles.modal} ${styles.modalWide}`}>
        <div className={styles.header}>
          <span>Receipt #{receipt.id}</span>
          <div style={{ display:'flex', gap:8 }}>
            <button className={styles.printBtn} onClick={() => window.print()}>Print</button>
            <button className={styles.closeBtn} onClick={onClose}><X size={16}/></button>
          </div>
        </div>
        <div className={styles.viewDocBody}>
          <ReceiptDocument />
        </div>
      </div>
    </div>
  );
}

// ── Main: View All Receipts ───────────────────────────────────────────────────
export default function ViewReceiptsModal({ appt, receipts: initialReceipts, onClose, onReceiptsChange }) {
  const { user } = useAuth();
  const rxImages = getRxImages(user?.clinic_id);

  const [receipts,     setReceipts]     = useState(initialReceipts || []);
  const [viewReceipt,  setViewReceipt]  = useState(null);
  const [showCreate,   setShowCreate]   = useState(false);
  const [deleting,     setDeleting]     = useState(null);

  const reload = async () => {
    try {
      const rows = await api.get(`/receipts?appointment_id=${appt.id}`);
      setReceipts(rows);
      onReceiptsChange?.(rows);
    } catch {}
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete Receipt #${r.id}?`)) return;
    setDeleting(r.id);
    try {
      await api.delete(`/receipts/${r.id}`);
      const updated = receipts.filter(x => x.id !== r.id);
      setReceipts(updated);
      onReceiptsChange?.(updated);
    } catch {}
    setDeleting(null);
  };

  if (viewReceipt) {
    return (
      <ReceiptDocumentView
        receipt={viewReceipt} appt={appt} user={user} rxImages={rxImages}
        onClose={() => setViewReceipt(null)}
      />
    );
  }

  if (showCreate) {
    return (
      <CreateReceiptModal
        appt={appt} user={user} rxImages={rxImages}
        onClose={() => { setShowCreate(false); reload(); }}
        onSaved={() => {}}
      />
    );
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span>View All Receipts</span>
          <button className={styles.closeBtn} onClick={onClose}><X size={16}/></button>
        </div>

        <div className={styles.body}>
          {/* Patient info row */}
          <div className={styles.patientRow}>
            <div className={styles.field}>
              <label>Name <span className={styles.req}>*</span></label>
              <input className={styles.input} value={appt.patient_name || ''} readOnly />
            </div>
            <div className={styles.field}>
              <label>UHID</label>
              <input className={`${styles.input} ${styles.inputMuted}`} value={appt.uhid || ''} readOnly />
            </div>
            <div className={styles.field}>
              <label>Phone <span className={styles.req}>*</span></label>
              <div className={styles.phoneWrap}>
                <span className={styles.phoneCode}>+91</span>
                <input className={`${styles.input} ${styles.phoneInput}`}
                  value={(appt.patient_mobile || '').replace(/^\+91/, '').trim()} readOnly />
              </div>
            </div>
          </div>

          {/* Receipts table */}
          {receipts.length === 0 ? (
            <div className={styles.empty}>No receipts found for this appointment.</div>
          ) : (
            <div className={styles.table}>
              <div className={styles.tableHead}>
                <span>S NO.</span>
                <span>SERVICE</span>
                <span>STATUS</span>
                <span>UPDATED AT</span>
                <span>TOTAL AMOUNT</span>
                <span>ACTIONS</span>
              </div>
              {receipts.map((r, i) => {
                const firstService = (r.items && r.items[0]?.service_name) || '—';
                const moreCount    = r.items && r.items.length > 1 ? ` +${r.items.length - 1}` : '';
                const st           = STATUS_LABEL[r.payment_status] || STATUS_LABEL.unbilled;
                const { date, time } = fmtDateTime(r.updated_at || r.created_at || new Date());
                return (
                  <div key={r.id} className={styles.tableRow}>
                    <span className={styles.tdSno}>{i + 1}</span>
                    <span className={styles.tdService}>{firstService}{moreCount && <em className={styles.more}>{moreCount} more</em>}</span>
                    <span>
                      <span className={`${styles.statusBadge} ${styles[st.cls]}`}>
                        {st.cls === 'statusPaid' && <CheckCircle size={11} strokeWidth={2.5} />}
                        {st.label}
                      </span>
                    </span>
                    <span className={styles.tdDate}>
                      <span>{date}</span>
                      <span className={styles.tdTime}>{time}</span>
                    </span>
                    <span className={styles.tdAmount}>₹{parseFloat(r.grand_total || 0).toFixed(0)}</span>
                    <span className={styles.tdActions}>
                      <button className={styles.actView} onClick={() => setViewReceipt(r)}>View</button>
                      {r.payment_status === 'unbilled' ? (
                        <>
                          <button className={styles.actEdit} onClick={() => {}}>Edit</button>
                          <button className={styles.actDelete} onClick={() => handleDelete(r)} disabled={deleting === r.id}>
                            {deleting === r.id ? '…' : 'Delete'}
                          </button>
                        </>
                      ) : (
                        <span className={styles.actLocked} title="Cannot edit or delete a settled receipt">Locked</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnClose}  onClick={onClose}>Close</button>
          <button className={styles.btnCreate} onClick={() => setShowCreate(true)}>
            <Plus size={14} strokeWidth={2.5} /> Create New Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
