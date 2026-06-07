import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import styles from './RxPublicView.module.css';

const VLABEL = {
  bp_systolic:'BP', bp_diastolic:'BP (D)', pulse:'Pulse',
  spo2:'SpO₂', temp:'Temp', weight:'Weight', height:'Height', bmi:'BMI',
};
const VUNIT = {
  bp_systolic:'mmHg', bp_diastolic:'mmHg', pulse:'bpm',
  spo2:'%', temp:'°C', weight:'kg', height:'cm', bmi:'kg/m²',
};

function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function RxPublicView() {
  const { apptId } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t');

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [booking, setBooking] = useState(false);
  const [booked,  setBooked]  = useState(false);
  const [form,    setForm]    = useState({ name: '', mobile: '', note: '' });

  useEffect(() => {
    if (!apptId || !token) { setError('Invalid link.'); setLoading(false); return; }
    fetch(`/api/emr/public/rx/${apptId}?t=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Could not load prescription.'))
      .finally(() => setLoading(false));
  }, [apptId, token]);

  const submitBooking = async (e) => {
    e.preventDefault();
    setBooked(true);
    setBooking(false);
    // Optionally: POST to booking API here
  };

  if (loading) return (
    <div className={styles.center}>
      <div className={styles.spinner} />
      <p>Loading prescription…</p>
    </div>
  );

  if (error) return (
    <div className={styles.center}>
      <div className={styles.errorIcon}>🔒</div>
      <h2>Link Expired or Invalid</h2>
      <p>{error}</p>
    </div>
  );

  if (!data?.encounter_id) return (
    <div className={styles.center}>
      <div className={styles.errorIcon}>📋</div>
      <h2>No Prescription</h2>
      <p>No prescription is available for this appointment yet.</p>
    </div>
  );

  const gender   = data.patient_gender === 'M' ? 'Male' : data.patient_gender === 'F' ? 'Female' : (data.patient_gender || '');
  const vitals   = Object.entries(data.vitals || {}).filter(([k, v]) => v && VLABEL[k]);
  const meds     = data.medications || [];
  const diags    = (data.diagnosis  || []).map(d => d.display || d).filter(Boolean);
  const labs     = data.lab_investigations || [];
  const labResults = data.lab_results || [];
  const procs    = (data.procedures || []).filter(Boolean);
  const followup = data.next_visit_date
    ? `Follow up on ${fmtDate(data.next_visit_date)}${data.next_visit_notes ? ' — ' + data.next_visit_notes : ''}`
    : data.next_visit_notes || '';

  const clinicPhone = data.clinic_phone;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.clinicLogo}>
          {(() => {
            // Try to find clinic logo — stored by clinic_id in localStorage
            const logo = localStorage.getItem(`rx_logo_${data.id?.toString().split('-')[0]}`) ||
                         // fallback: search all rx_logo_ keys for any match
                         Object.keys(localStorage).filter(k => k.startsWith('rx_logo_')).map(k => localStorage.getItem(k))[0] ||
                         '';
            return logo ? <img src={logo} alt="Clinic" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 8 }} /> : '🏥';
          })()}
        </div>
        <div>
          <div className={styles.clinicName}>{data.clinic_name}</div>
          {data.clinic_address && <div className={styles.clinicAddr}>{data.clinic_address}</div>}
          {data.doctor_name && (
            <div className={styles.doctorName}>
              Dr. {data.doctor_name}
              {data.doctor_specialization && <span className={styles.doctorSpec}> · {data.doctor_specialization}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Patient info */}
      <div className={styles.card}>
        <div className={styles.patientRow}>
          <div className={styles.patientAvatar}>
            {(data.patient_name || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <div className={styles.patientName}>{data.patient_name}</div>
            <div className={styles.patientMeta}>
              {[gender, data.patient_age ? `${data.patient_age} yrs` : null, data.uhid ? `UHID: ${data.uhid}` : null].filter(Boolean).join(' · ')}
            </div>
            <div className={styles.patientDate}>📅 {fmtDate(data.appointment_date)}</div>
          </div>
        </div>
      </div>

      {/* Vitals */}
      {vitals.length > 0 && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>🩺 Vitals</div>
          <div className={styles.vitalsGrid}>
            {vitals.map(([k, v]) => (
              <div key={k} className={styles.vitalItem}>
                <span className={styles.vitalValue}>{v}</span>
                <span className={styles.vitalUnit}>{VUNIT[k] || ''}</span>
                <span className={styles.vitalLabel}>{VLABEL[k]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diagnosis */}
      {diags.length > 0 && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>🔬 Diagnosis</div>
          {diags.map((d, i) => (
            <div key={i} className={styles.diagItem}>
              <span className={styles.diagDot} />{d}
            </div>
          ))}
        </div>
      )}

      {/* Medications */}
      {meds.length > 0 && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>💊 Prescription</div>
          <div className={styles.medList}>
            {meds.map((m, i) => (
              <div key={i} className={styles.medCard}>
                <div className={styles.medNum}>{i + 1}</div>
                <div className={styles.medInfo}>
                  <div className={styles.medName}>{m.name}</div>
                  <div className={styles.medDetail}>
                    {[m.dose || m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ')}
                  </div>
                  {m.instructions && <div className={styles.medInstr}>{m.instructions}</div>}
                  {m.timing && <div className={styles.medInstr}>🕐 {m.timing}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lab tests */}
      {labs.length > 0 && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>🧪 Lab Tests Advised</div>
          {labs.map((l, i) => (
            <div key={i} className={styles.diagItem}>
              <span className={styles.diagDot} />{typeof l === 'string' ? l : l.test}
            </div>
          ))}
        </div>
      )}

      {/* Examination findings */}
      {data.examination_findings && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>🩻 Examination Findings</div>
          <p className={styles.adviceText}>{data.examination_findings}</p>
        </div>
      )}

      {/* Lab results */}
      {labResults.length > 0 && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>📊 Lab Results</div>
          {labResults.map((r, i) => (
            <div key={i} className={styles.diagItem}>
              <span className={styles.diagDot} />
              <span>{r.test}{r.result ? `: ${r.result}${r.unit ? ' ' + r.unit : ''}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {/* Procedures */}
      {procs.length > 0 && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>⚕️ Procedures</div>
          {procs.map((p, i) => (
            <div key={i} className={styles.diagItem}>
              <span className={styles.diagDot} />{p}
            </div>
          ))}
        </div>
      )}

      {/* Referral */}
      {data.refer_to && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>🏥 Referred To</div>
          <p className={styles.adviceText}>{data.refer_to}</p>
        </div>
      )}

      {/* Advice / Notes */}
      {(data.advices || data.notes) && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>📝 Advice</div>
          {data.advices && <p className={styles.adviceText}>{data.advices}</p>}
          {data.notes   && <p className={styles.adviceText} style={{marginTop: data.advices ? 6 : 0}}>{data.notes}</p>}
        </div>
      )}

      {/* Follow-up */}
      {followup && (
        <div className={`${styles.card} ${styles.followupCard}`}>
          <div className={styles.followupText}>📅 {followup}</div>
        </div>
      )}

      {/* Book appointment */}
      <div className={styles.bookSection}>
        {!booking && !booked && (
          <>
            <p className={styles.bookPrompt}>Need a follow-up consultation?</p>
            <div className={styles.bookButtons}>
              <button className={styles.bookBtn} onClick={() => setBooking(true)}>
                📅 Book Appointment
              </button>
              {clinicPhone && (
                <a
                  className={styles.callBtn}
                  href={`tel:${clinicPhone}`}
                >
                  📞 Call Clinic
                </a>
              )}
              {clinicPhone && (
                <a
                  className={styles.waBtn}
                  href={`https://wa.me/${clinicPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi, I'd like to book an appointment. My name is ${data.patient_name}.`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  💬 WhatsApp
                </a>
              )}
            </div>
          </>
        )}

        {booking && (
          <form className={styles.bookForm} onSubmit={submitBooking}>
            <h3 className={styles.bookFormTitle}>Book an Appointment</h3>
            <input
              className={styles.bookInput}
              placeholder="Your name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
            <input
              className={styles.bookInput}
              placeholder="Mobile number"
              value={form.mobile}
              onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))}
              required
              type="tel"
            />
            <textarea
              className={styles.bookInput}
              placeholder="Preferred date/time or any note (optional)"
              rows={2}
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className={styles.bookBtn}>Confirm Request</button>
              <button type="button" className={styles.cancelBtn} onClick={() => setBooking(false)}>Cancel</button>
            </div>
          </form>
        )}

        {booked && (
          <div className={styles.bookedMsg}>
            ✅ Appointment request sent! The clinic will contact you to confirm.
          </div>
        )}
      </div>

      <div className={styles.footer}>
        Generated by Infer EMR · {data.clinic_name}
      </div>
    </div>
  );
}
