import { useState, useEffect, useRef } from 'react';
import { X, Printer } from 'lucide-react';
import { api } from '../api/client';
import s from './AppointmentSlipModal.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}
function fmtAge(dob) {
  if (!dob) return '';
  return Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000)) + ' yrs';
}

const PAY_COLOR = {
  paid:     { bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
  partial:  { bg: '#fffbeb', color: '#d97706', border: '#fcd34d' },
  due:      { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
  unbilled: { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
};

// ── Slip document (printed area) ──────────────────────────────────────────────
function SlipDoc({ appt, receipt, clinic, headerImg, footerImg }) {
  const pay = receipt?.payment_status || 'unbilled';
  const payStyle = PAY_COLOR[pay] || PAY_COLOR.unbilled;
  const items = receipt?.items || [];
  const now = new Date();
  const printTime = `${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div className={s.slipDoc} id="appt-slip-print">
      {/* Clinic header */}
      {headerImg ? (
        <div className={s.headerImgWrap}><img src={headerImg} alt="header" className={s.headerImg} /></div>
      ) : (
        <div className={s.clinicHeader}>
          <div className={s.clinicName}>{clinic?.clinic_name || 'Clinic'}</div>
          {clinic?.clinic_address && <div className={s.clinicAddr}>{clinic.clinic_address}</div>}
          {clinic?.clinic_phone   && <div className={s.clinicAddr}>{clinic.clinic_phone}</div>}
        </div>
      )}

      <div className={s.slipTitle}>APPOINTMENT SLIP</div>
      <hr className={s.hr} />

      {/* Token + Date row */}
      <div className={s.topRow}>
        {appt.token_number && (
          <div className={s.tokenBox}>
            <div className={s.tokenLabel}>TOKEN</div>
            <div className={s.tokenNumber}>#{appt.token_number}</div>
          </div>
        )}
        <div className={s.dateBox}>
          <div className={s.dateVal}>{fmtDate(appt.appointment_date)}</div>
          {appt.appointment_time && <div className={s.timeVal}>{fmtTime(appt.appointment_time)}</div>}
        </div>
        <div className={s.payBadge} style={{ background: payStyle.bg, color: payStyle.color, border: `1px solid ${payStyle.border}` }}>
          {pay.toUpperCase()}
        </div>
      </div>

      <hr className={s.hr} />

      {/* Patient info */}
      <div className={s.section}>
        <div className={s.sectionTitle}>PATIENT</div>
        <div className={s.patientGrid}>
          <div className={s.patRow}><span className={s.patLbl}>Name</span><span className={s.patVal}>{appt.patient_name}</span></div>
          {appt.uhid      && <div className={s.patRow}><span className={s.patLbl}>UHID</span><span className={s.patVal}>{appt.uhid}</span></div>}
          {appt.patient_mobile && <div className={s.patRow}><span className={s.patLbl}>Mobile</span><span className={s.patVal}>{appt.patient_mobile}</span></div>}
          {(appt.patient_gender || appt.patient_dob) && (
            <div className={s.patRow}>
              <span className={s.patLbl}>Age / Gender</span>
              <span className={s.patVal}>
                {[fmtAge(appt.patient_dob), appt.patient_gender === 'M' ? 'Male' : appt.patient_gender === 'F' ? 'Female' : ''].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}
          {appt.doctor_name && <div className={s.patRow}><span className={s.patLbl}>Doctor</span><span className={s.patVal}>Dr. {appt.doctor_name}</span></div>}
          {appt.visit_type  && <div className={s.patRow}><span className={s.patLbl}>Visit Type</span><span className={s.patVal}>{appt.visit_type}</span></div>}
        </div>
      </div>

      {/* Services */}
      {items.length > 0 && (
        <>
          <hr className={s.hr} />
          <div className={s.section}>
            <div className={s.sectionTitle}>SERVICES</div>
            <table className={s.servTable}>
              <thead>
                <tr><th>Service</th><th>Qty</th><th className={s.right}>Amount</th></tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.service_name}</td>
                    <td>{item.qty || 1}</td>
                    <td className={s.right}>₹{Number(item.total ?? item.amount ?? 0).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Totals */}
            <div className={s.totals}>
              {receipt?.total_discount > 0 && (
                <>
                  <div className={s.totalRow}><span>Sub Total</span><span>₹{Number(receipt.total_amount || 0).toFixed(0)}</span></div>
                  <div className={s.totalRow}><span>Discount</span><span>−₹{Number(receipt.total_discount || 0).toFixed(0)}</span></div>
                </>
              )}
              <div className={`${s.totalRow} ${s.grandTotal}`}>
                <span>Grand Total</span><span>₹{Number(receipt?.grand_total || 0).toFixed(0)}</span>
              </div>
              {receipt?.amount_paid > 0 && (
                <>
                  <div className={s.totalRow}><span>Amount Paid</span><span>₹{Number(receipt.amount_paid || 0).toFixed(0)}</span></div>
                  <div className={s.totalRow}><span>Balance</span><span>₹{Math.max(0, (receipt.grand_total || 0) - (receipt.amount_paid || 0)).toFixed(0)}</span></div>
                </>
              )}
              {receipt?.paymode && <div className={s.paymode}>Payment: {receipt.paymode}</div>}
            </div>
          </div>
        </>
      )}

      {/* Notes */}
      {appt.notes && (
        <>
          <hr className={s.hr} />
          <div className={s.section}>
            <div className={s.sectionTitle}>NOTES</div>
            <div className={s.notes}>{appt.notes}</div>
          </div>
        </>
      )}

      <hr className={s.hr} />
      <div className={s.footer}>
        <span>Printed: {printTime}</span>
        <span>Please show this slip at reception</span>
      </div>

      {footerImg && <div className={s.footerImgWrap}><img src={footerImg} alt="footer" className={s.footerImg} /></div>}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export default function AppointmentSlipModal({ appt, onClose }) {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);

  const cid       = appt?.clinic_id || 'default';
  const headerImg = localStorage.getItem(`rx_header_${cid}`) || '';
  const footerImg = localStorage.getItem(`rx_footer_${cid}`) || '';

  useEffect(() => {
    if (!appt?.id) { setLoading(false); return; }
    api.get(`/receipts?appointment_id=${appt.id}`)
      .then(rows => { setReceipt(rows?.[0] || null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [appt?.id]);

  const handlePrint = () => {
    const area = document.getElementById('appt-slip-print');
    if (!area) return;
    const win = window.open('', '_blank', 'width=500,height=700');
    win.document.write(`<html><head><title>Appointment Slip</title>
      <style>
        body { font-family: sans-serif; margin: 0; padding: 20px; font-size: 13px; }
        * { box-sizing: border-box; }
      </style>
    </head><body>${area.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        {/* Header */}
        <div className={s.modalHead}>
          <span className={s.modalTitle}>Appointment Slip</span>
          <div className={s.modalActions}>
            <button className={s.printBtn} onClick={handlePrint}>
              <Printer size={14} /> Print
            </button>
            <button className={s.closeBtn} onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        {/* Slip preview */}
        <div className={s.modalBody}>
          {loading ? (
            <div className={s.loading}>Loading…</div>
          ) : (
            <SlipDoc
              appt={appt}
              receipt={receipt}
              clinic={{ clinic_name: appt.clinic_name, clinic_address: appt.clinic_address, clinic_phone: appt.clinic_phone }}
              headerImg={headerImg}
              footerImg={footerImg}
            />
          )}
        </div>
      </div>
    </div>
  );
}
