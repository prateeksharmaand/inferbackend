import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, ChevronDown } from 'lucide-react';
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

// Service name autocomplete input
function ServiceInput({ value, onChange, onSelect }) {
  const [query,    setQuery]   = useState(value || '');
  const [results,  setResults] = useState([]);
  const [open,     setOpen]    = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (query.length < 1) { setResults([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      try {
        const rows = await api.get(`/services?search=${encodeURIComponent(query)}&is_active=true`);
        setResults(rows);
        setOpen(rows.length > 0);
      } catch { setOpen(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={styles.serviceInputWrap} ref={ref}>
      <input
        className={styles.serviceInput}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); }}
        placeholder="Start typing to add a service…"
      />
      {open && (
        <ul className={styles.serviceDropdown}>
          {results.map(r => (
            <li key={r.id} className={styles.serviceOption}
              onMouseDown={() => {
                setQuery(r.name); setOpen(false);
                onSelect({ id: r.id, name: r.name, price: parseFloat(r.price) || 0 });
              }}
            >
              <span className={styles.serviceOptName}>{r.name}</span>
              <span className={styles.serviceOptPrice}>₹{parseFloat(r.price).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CreateReceiptModal({ appt, onClose, onSaved }) {
  const [rows, setRows] = useState([emptyItem(), emptyItem()]);
  const [addlDiscount,   setAddlDiscount]   = useState('');
  const [paymode,        setPaymode]        = useState('Cash');
  const [amountPaid,     setAmountPaid]     = useState('');
  const [paymentId,      setPaymentId]      = useState('');
  const [paymentStatus,  setPaymentStatus]  = useState('Unbilled');
  const [remarks,        setRemarks]        = useState('');
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');

  const [phone, setPhone] = useState(appt?.patient_mobile || '');

  // derived totals
  const computedRows  = rows.map(computeItem);
  const totalAmount   = computedRows.reduce((s, r) => s + (parseFloat(r.amount) || 0) * (r.qty || 1), 0);
  const lineDiscount  = computedRows.reduce((s, r) => s + (parseFloat(r.discount) || 0), 0);
  const addlDiscAmt   = parseFloat(addlDiscount) || 0;
  const totalDiscount = lineDiscount + addlDiscAmt;
  const grandTotal    = Math.max(0, totalAmount - totalDiscount);

  const updateRow = (idx, patch) => {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const addRow = () => setRows(rs => [...rs, emptyItem()]);

  const removeRow = (idx) => {
    if (rows.length === 1) return;
    setRows(rs => rs.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    const filledRows = computedRows.filter(r => r.service_name.trim());
    if (!filledRows.length) return setError('Add at least one service.');
    setSaving(true); setError('');
    try {
      const payload = {
        appointment_id:    appt.id,
        patient_name:      appt.patient_name,
        uhid:              appt.uhid || null,
        phone:             phone || appt.patient_mobile || null,
        payment_status:    paymentStatus.toLowerCase(),
        items:             filledRows.map(r => ({
          service_id:   r.service_id,
          service_name: r.service_name,
          qty:          r.qty,
          amount:       parseFloat(r.amount) || 0,
          discount:     parseFloat(r.discount) || 0,
          total:        r.total,
        })),
        additional_discount: addlDiscAmt,
        paymode,
        payment_id:     paymentId || null,
        amount_paid:    parseFloat(amountPaid) || 0,
        remarks:        remarks || null,
      };
      const saved = await api.post('/receipts', payload);
      onSaved?.(saved);
      onClose();
    } catch (err) { setError(err.message); setSaving(false); }
  };

  const fmt = (n) => `₹${(n || 0).toFixed(2)}`;

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>

        {/* Header */}
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
                <input
                  className={`${styles.input} ${styles.phoneInput}`}
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Enter phone number"
                />
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

            {rows.map((row, idx) => (
              <div key={idx} className={styles.tableRow}>
                <div className={styles.colService}>
                  <ServiceInput
                    value={row.service_name}
                    onChange={v => updateRow(idx, { service_name: v, service_id: null })}
                    onSelect={s => updateRow(idx, { service_id: s.id, service_name: s.name, amount: s.price })}
                  />
                </div>
                <div className={styles.colQty}>
                  <input className={styles.cellInput}
                    type="number" min="1" value={row.qty}
                    onChange={e => updateRow(idx, { qty: e.target.value })} />
                </div>
                <div className={styles.colAmount}>
                  <div className={styles.amountCell}>
                    <span className={styles.rupee}>₹</span>
                    <input className={styles.cellInput}
                      type="number" min="0" step="0.01" value={row.amount}
                      onChange={e => updateRow(idx, { amount: e.target.value })}
                      placeholder="0" />
                  </div>
                </div>
                <div className={styles.colDiscount}>
                  <input
                    className={`${styles.cellInput} ${!row.discount ? styles.cellInputMuted : ''}`}
                    type="number" min="0" step="0.01"
                    value={row.discount}
                    onChange={e => updateRow(idx, { discount: e.target.value })}
                    placeholder="Not Applicable"
                  />
                </div>
                <div className={styles.colTotal}>
                  <span className={styles.rupee}>₹</span>
                  <span className={styles.totalVal}>
                    {computeItem(row).total.toFixed(2)}
                  </span>
                </div>
                <div className={styles.colDel}>
                  <button className={styles.delBtn} onClick={() => removeRow(idx)}
                    disabled={rows.length === 1}>
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

            {/* Left: payment fields */}
            <div className={styles.payFields}>
              <div className={styles.payRow}>
                <label className={styles.payLabel}>ADDITIONAL<br />DISCOUNT:</label>
                <input
                  className={`${styles.input} ${styles.payInput} ${!addlDiscount ? styles.inputMuted : ''}`}
                  value={addlDiscount}
                  onChange={e => setAddlDiscount(e.target.value)}
                  type="number" min="0" step="0.01"
                  placeholder="Not Applicable"
                />
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
                <input
                  className={`${styles.input} ${styles.payInput}`}
                  type="number" min="0" step="0.01"
                  value={amountPaid}
                  onChange={e => setAmountPaid(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className={styles.payRow}>
                <label className={styles.payLabel}>PAYMENT ID:</label>
                <input
                  className={`${styles.input} ${styles.payInputFull}`}
                  value={paymentId}
                  onChange={e => setPaymentId(e.target.value)}
                  placeholder="Enter Payment ID (Optional)"
                />
              </div>
            </div>

            {/* Right: summary */}
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
            <textarea
              className={styles.remarksInput}
              rows={2}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Optional remarks…"
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}
        </div>

        {/* Footer */}
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
