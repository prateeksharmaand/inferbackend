import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, ChevronDown, CheckCircle, Printer, Download, Send, MessageCircle, Pencil } from 'lucide-react';
import { api } from '../api/client';
import styles from './CreateReceiptModal.module.css';

const PAYMODES = ['Cash', 'UPI', 'Card', 'Net Banking', 'Cheque', 'Other'];
const PAYMENT_STATUSES = ['Unbilled', 'Paid', 'Partial', 'Due'];

function emptyItem() {
  return { service_id: null, service_name: '', qty: 1, amount: '', discount: '', total: 0 };
}
function computeItem(item) {
  const amount   = parseFloat(item.amount) || 0;
  const qty      = parseInt(item.qty) || 1;
  const discount = parseFloat(item.discount) || 0;
  return { ...item, qty, total: Math.max(0, amount * qty - discount) };
}
function calcAge(dob) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}
function fmtDate(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Service name autocomplete ─────────────────────────────────────────────────
function ServiceInput({ value, onChange, onSelect }) {
  const [query,   setQuery]   = useState(value || '');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (query.length < 1) { setResults([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      try {
        const rows = await api.get(`/services?search=${encodeURIComponent(query)}&is_active=true`);
        setResults(rows); setOpen(rows.length > 0);
      } catch { setOpen(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className={styles.serviceInputWrap} ref={ref}>
      <input className={styles.serviceInput} value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); }}
        placeholder="Start typing to add a service…" />
      {open && (
        <ul className={styles.serviceDropdown}>
          {results.map(r => (
            <li key={r.id} className={styles.serviceOption}
              onMouseDown={() => {
                setQuery(r.name); setOpen(false);
                onSelect({ id: r.id, name: r.name, price: parseFloat(r.price) || 0 });
              }}>
              <span>{r.name}</span>
              <span className={styles.serviceOptPrice}>₹{parseFloat(r.price).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Receipt document (printed / shown in post-receipt view) ───────────────────
function ReceiptDocument({ receipt, appt, user, rxImages = {} }) {
  const gender = appt?.patient_gender === 'M' ? 'Male' : appt?.patient_gender === 'F' ? 'Female' : (appt?.patient_gender || '');
  const age    = calcAge(appt?.patient_dob);
  const patientMeta = [
    gender,
    age ? `${age} years` : null,
  ].filter(Boolean).join(' | ');

  const items = receipt.items || [];

  return (
    <div className={styles.rxDoc} id="receipt-print-area">
      {/* Clinic header */}
      {rxImages.headerImg ? (
        <div className={styles.rxImgBlock}>
          <img src={rxImages.headerImg} alt="Header" className={styles.rxImg} />
        </div>
      ) : (
        <div className={styles.rxHeader}>
          <div className={styles.rxHeaderLeft}>
            <div className={styles.rxClinicName}>{user?.clinic_name || 'Clinic'}</div>
            <div className={styles.rxClinicAddress}>{user?.clinic_address || ''}</div>
          </div>
          <div className={styles.rxHeaderRight}>Dr. {user?.name || user?.email || ''}</div>
        </div>
      )}

      {/* Receipt meta row */}
      <div className={styles.rxMetaRow}>
        <span className={styles.rxMetaLeft}>
          <strong>Receipt No:</strong> {receipt.id}
        </span>
        <span className={styles.rxMetaRight}>
          <strong>Visit Date:</strong> {fmtDate(receipt.created_at || new Date())}
        </span>
      </div>

      {/* Billed to */}
      <div className={styles.rxBilledTo}>
        <strong>Billed To:</strong>{' '}
        {receipt.patient_name}{patientMeta && ` (${patientMeta})`}
        {receipt.phone && ` | ${receipt.phone}`}
        {receipt.uhid && ` | ${receipt.uhid}`}
      </div>

      {/* Service table */}
      <table className={styles.rxTable}>
        <thead>
          <tr>
            <th className={styles.rxThNum}>S.No</th>
            <th className={styles.rxThService}>Service</th>
            <th className={styles.rxThNum}>Qty</th>
            <th className={styles.rxThAmt}>Amount</th>
            <th className={styles.rxThAmt}>Discount</th>
            <th className={styles.rxThAmt}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td className={styles.rxTdNum}>{String(i + 1).padStart(2, '0')}</td>
              <td className={styles.rxTdService}>{item.service_name}</td>
              <td className={styles.rxTdNum}>{String(item.qty || 1).padStart(2, '0')}</td>
              <td className={styles.rxTdAmt}>Rs. {parseFloat(item.amount || 0).toFixed(0)}</td>
              <td className={styles.rxTdAmt}>{parseFloat(item.discount || 0) > 0 ? `Rs. ${parseFloat(item.discount).toFixed(0)}` : '0'}</td>
              <td className={styles.rxTdAmt}>Rs. {parseFloat(item.total || 0).toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className={styles.rxTotals}>
        <div className={styles.rxTotalRow}>
          <span>Sub Total</span>
          <span>{parseFloat(receipt.total_amount || 0).toFixed(0)}</span>
        </div>
        <div className={styles.rxTotalRow}>
          <span>Total Discount</span>
          <span>{parseFloat(receipt.total_discount || 0).toFixed(0)}</span>
        </div>
        <div className={`${styles.rxTotalRow} ${styles.rxGrandTotal}`}>
          <span>Grand Total</span>
          <span>Rs. {parseFloat(receipt.grand_total || 0).toFixed(0)}</span>
        </div>
        <div className={styles.rxTotalRow}>
          <span>● Paid Via {receipt.paymode || 'Cash'}</span>
          <span>Rs. {parseFloat(receipt.amount_paid || 0).toFixed(0)}</span>
        </div>
      </div>

      {/* Footer */}
      {rxImages.footerImg ? (
        <div className={styles.rxImgBlock}>
          <img src={rxImages.footerImg} alt="Footer" className={styles.rxImg} />
        </div>
      ) : (
        <div className={styles.rxFooter}>{user?.clinic_name || ''}</div>
      )}
    </div>
  );
}

// ── Post-receipt success view ─────────────────────────────────────────────────
function ReceiptCreatedView({ receipt, appt, user, rxImages, onEdit, onNewReceipt, onDone }) {
  const grandTotal = parseFloat(receipt.grand_total || 0);

  const actions = [
    {
      icon: <Send size={18} />,
      label: 'Send',
      sub: 'Via SMS and Whatsapp',
      onClick: () => {},
    },
    {
      icon: <Printer size={18} />,
      label: 'Print',
      sub: 'View and print the receipt',
      onClick: () => window.print(),
    },
    {
      icon: <Download size={18} />,
      label: 'Download',
      sub: 'Get a PDF version of the receipt',
      onClick: () => window.print(),
    },
    {
      icon: <MessageCircle size={18} />,
      label: 'Send on WhatsApp',
      sub: 'Send from your own WhatsApp',
      onClick: () => {},
    },
  ];

  return (
    <>
      <div className={styles.createdBody}>
        {/* Left panel */}
        <div className={styles.createdLeft}>
          <div className={styles.createdBanner}>
            <CheckCircle size={20} className={styles.createdCheck} strokeWidth={2.5} />
            <span>Receipt for <strong>₹ {grandTotal.toFixed(0)}</strong> created successfully</span>
          </div>

          <div className={styles.actionList}>
            {actions.map((a, i) => (
              <button key={i} className={styles.actionItem} onClick={a.onClick}>
                <span className={styles.actionIcon}>{a.icon}</span>
                <span className={styles.actionText}>
                  <span className={styles.actionLabel}>{a.label}</span>
                  <span className={styles.actionSub}>{a.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel — receipt document */}
        <div className={styles.createdRight}>
          <ReceiptDocument receipt={receipt} appt={appt} user={user} rxImages={rxImages} />
        </div>
      </div>

      {/* Footer */}
      <div className={styles.createdFooter}>
        <div className={styles.createdFooterLeft}>
          <button className={styles.btnOutline} onClick={onEdit}><Pencil size={13} /> Edit</button>
          <button className={styles.btnOutline} onClick={onNewReceipt}>New Receipt</button>
        </div>
        <button className={styles.btnDone} onClick={onDone}>Done</button>
      </div>
    </>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function CreateReceiptModal({ appt, user, rxImages = {}, onClose, onSaved }) {
  const [rows,          setRows]          = useState([emptyItem(), emptyItem()]);
  const [addlDiscount,  setAddlDiscount]  = useState('');
  const [paymode,       setPaymode]       = useState('Cash');
  const [amountPaid,    setAmountPaid]    = useState('');
  const [paymentId,     setPaymentId]     = useState('');
  const [paymentStatus, setPaymentStatus] = useState('Unbilled');
  const [remarks,       setRemarks]       = useState('');
  const [phone,         setPhone]         = useState(appt?.patient_mobile || '');
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');
  const [savedReceipt,  setSavedReceipt]  = useState(null);

  // derived totals
  const computedRows  = rows.map(computeItem);
  const totalAmount   = computedRows.reduce((s, r) => s + (parseFloat(r.amount) || 0) * (r.qty || 1), 0);
  const lineDiscount  = computedRows.reduce((s, r) => s + (parseFloat(r.discount) || 0), 0);
  const addlDiscAmt   = parseFloat(addlDiscount) || 0;
  const totalDiscount = lineDiscount + addlDiscAmt;
  const grandTotal    = Math.max(0, totalAmount - totalDiscount);

  const updateRow = (idx, patch) => setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  const addRow    = () => setRows(rs => [...rs, emptyItem()]);
  const removeRow = (idx) => { if (rows.length > 1) setRows(rs => rs.filter((_, i) => i !== idx)); };

  const resetForm = () => {
    setRows([emptyItem(), emptyItem()]); setAddlDiscount(''); setPaymode('Cash');
    setAmountPaid(''); setPaymentId(''); setPaymentStatus('Unbilled');
    setRemarks(''); setPhone(appt?.patient_mobile || ''); setSavedReceipt(null);
  };

  const handleSave = async () => {
    const filledRows = computedRows.filter(r => r.service_name.trim());
    if (!filledRows.length) return setError('Add at least one service.');
    setSaving(true); setError('');
    try {
      const saved = await api.post('/receipts', {
        appointment_id:    appt.id,
        patient_name:      appt.patient_name,
        uhid:              appt.uhid || null,
        phone:             phone || appt.patient_mobile || null,
        payment_status:    paymentStatus.toLowerCase(),
        items:             filledRows.map(r => ({
          service_id:   r.service_id, service_name: r.service_name,
          qty:          r.qty, amount: parseFloat(r.amount) || 0,
          discount:     parseFloat(r.discount) || 0, total: r.total,
        })),
        additional_discount: addlDiscAmt,
        paymode, payment_id: paymentId || null,
        amount_paid: parseFloat(amountPaid) || 0,
        remarks:     remarks || null,
      });
      setSavedReceipt(saved);
      onSaved?.(saved);
      // Auto-send receipt to patient email if available
      const email = appt?.patient_email;
      if (email) {
        api.post('/email/receipt', {
          to: email, patient_name: appt.patient_name, receipt_id: saved.id,
        }).catch(() => {});
      }
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const fmt = (n) => `₹${(n || 0).toFixed(2)}`;

  // ── Post-receipt view ────────────────────────────────────────────────────
  if (savedReceipt) {
    return (
      <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={`${styles.modal} ${styles.modalWide}`}>
          <div className={styles.header}>
            <span>Receipt Created</span>
            <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
          </div>
          <ReceiptCreatedView
            receipt={savedReceipt}
            appt={appt}
            user={user}
            rxImages={rxImages}
            onEdit={resetForm}
            onNewReceipt={resetForm}
            onDone={onClose}
          />
        </div>
      </div>
    );
  }

  // ── Form view ────────────────────────────────────────────────────────────
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span>Create Receipt</span>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={styles.body}>
          {/* Patient info row */}
          <div className={styles.patientRow}>
            <div className={styles.field}>
              <label>Name <span className={styles.req}>*</span></label>
              <input className={styles.input} value={appt?.patient_name || ''} readOnly />
            </div>
            <div className={styles.field}>
              <label>UHID</label>
              <input className={`${styles.input} ${styles.inputMuted}`} value={appt?.uhid || ''} readOnly />
            </div>
            <div className={styles.field}>
              <label>Phone <span className={styles.req}>*</span></label>
              <div className={styles.phoneWrap}>
                <span className={styles.phoneCode}>+91</span>
                <input className={`${styles.input} ${styles.phoneInput}`}
                  value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="Enter phone number" />
              </div>
            </div>
            <div className={styles.field}>
              <label>Payment Status</label>
              <div className={styles.selectWrap}>
                <select className={styles.select} value={paymentStatus}
                  onChange={e => setPaymentStatus(e.target.value)}>
                  {PAYMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
                <ChevronDown size={13} className={styles.selectArrow} />
              </div>
            </div>
          </div>

          {/* Service table */}
          <div className={styles.tableWrap}>
            <div className={styles.tableHead}>
              <span className={styles.colService}>SERVICE</span>
              <span className={styles.colQty}>QTY</span>
              <span className={styles.colAmount}>AMOUNT</span>
              <span className={styles.colDiscount}>DISCOUNT</span>
              <span className={styles.colTotal}>TOTAL</span>
              <span className={styles.colDel}></span>
            </div>
            <div style={{ padding: '8px 0 4px', textAlign: 'right' }}>
              <a
                href="/settings?tab=services"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--color-primary)', textDecoration: 'none' }}
              >
                + Add services from Settings
              </a>
            </div>

            {rows.map((row, idx) => (
              <div key={idx} className={styles.tableRow}>
                <div className={styles.colService}>
                  <ServiceInput value={row.service_name}
                    onChange={v => updateRow(idx, { service_name: v, service_id: null })}
                    onSelect={s => updateRow(idx, { service_id: s.id, service_name: s.name, amount: s.price })} />
                </div>
                <div className={styles.colQty}>
                  <input className={styles.cellInput} type="number" min="1" value={row.qty}
                    onChange={e => updateRow(idx, { qty: e.target.value })} />
                </div>
                <div className={styles.colAmount}>
                  <div className={styles.amountCell}>
                    <span className={styles.rupee}>₹</span>
                    <input className={styles.cellInput} type="number" min="0" step="0.01"
                      value={row.amount} onChange={e => updateRow(idx, { amount: e.target.value })} placeholder="0" />
                  </div>
                </div>
                <div className={styles.colDiscount}>
                  <input className={`${styles.cellInput} ${!row.discount ? styles.cellInputMuted : ''}`}
                    type="number" min="0" step="0.01" value={row.discount}
                    onChange={e => updateRow(idx, { discount: e.target.value })}
                    placeholder="Not Applicable" />
                </div>
                <div className={styles.colTotal}>
                  <span className={styles.rupee}>₹</span>
                  <span className={styles.totalVal}>{computeItem(row).total.toFixed(2)}</span>
                </div>
                <div className={styles.colDel}>
                  <button className={styles.delBtn} onClick={() => removeRow(idx)} disabled={rows.length === 1}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button className={styles.addRowBtn} onClick={addRow}>
              <Plus size={13} strokeWidth={2.5} /> Add another
            </button>
          </div>

          {/* Bottom section */}
          <div className={styles.bottomSection}>
            <div className={styles.payFields}>
              <div className={styles.payRow}>
                <label className={styles.payLabel}>ADDITIONAL<br />DISCOUNT:</label>
                <input className={`${styles.input} ${styles.payInput} ${!addlDiscount ? styles.inputMuted : ''}`}
                  value={addlDiscount} onChange={e => setAddlDiscount(e.target.value)}
                  type="number" min="0" step="0.01" placeholder="Not Applicable" />
              </div>
              <div className={styles.payRow}>
                <label className={styles.payLabel}>PAYMODE:</label>
                <div className={styles.selectWrap}>
                  <select className={`${styles.select} ${styles.paymodeSelect}`}
                    value={paymode} onChange={e => setPaymode(e.target.value)}>
                    {PAYMODES.map(m => <option key={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={13} className={styles.selectArrow} />
                </div>
                <input className={`${styles.input} ${styles.payInput}`}
                  type="number" min="0" step="0.01" value={amountPaid}
                  onChange={e => setAmountPaid(e.target.value)} placeholder="0" />
              </div>
              <div className={styles.payRow}>
                <label className={styles.payLabel}>PAYMENT ID:</label>
                <input className={`${styles.input} ${styles.payInputFull}`}
                  value={paymentId} onChange={e => setPaymentId(e.target.value)}
                  placeholder="Enter Payment ID (Optional)" />
              </div>
            </div>
            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Total Amount:</span>
                <span className={styles.summaryVal}>{fmt(totalAmount)}</span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Total Discount:</span>
                <span className={`${styles.summaryVal} ${styles.summaryDiscount}`}>- {fmt(totalDiscount)}</span>
              </div>
              <div className={`${styles.summaryRow} ${styles.summaryIndent}`}>
                <span className={styles.summaryLabel}>Line item discount:</span>
                <span className={`${styles.summaryVal} ${styles.summaryDiscount}`}>- {fmt(lineDiscount)}</span>
              </div>
              <div className={`${styles.summaryRow} ${styles.summaryIndent}`}>
                <span className={styles.summaryLabel}>Additional Discount:</span>
                <span className={`${styles.summaryVal} ${styles.summaryDiscount}`}>- {fmt(addlDiscAmt)}</span>
              </div>
              <div className={`${styles.summaryRow} ${styles.summaryGrand}`}>
                <span className={styles.summaryLabel}>Grand Total:</span>
                <span className={styles.summaryVal}>{fmt(grandTotal)}</span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Amount Paid:</span>
                <span className={styles.summaryVal}>{fmt(parseFloat(amountPaid) || 0)}</span>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div className={styles.remarksRow}>
            <label className={styles.remarksLabel}>Remarks</label>
            <textarea className={styles.remarksInput} rows={2} value={remarks}
              onChange={e => setRemarks(e.target.value)} placeholder="Optional remarks…" />
          </div>

          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Create Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}
