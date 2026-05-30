import { useState } from 'react';
import { X, ArrowLeft, Printer, ChevronRight } from 'lucide-react';
import { CERT_TEMPLATES, CONSENT_TEMPLATES } from '../data/medicalDocTemplates';
import s from './MedicalDocModal.module.css';

// ── Template tile ─────────────────────────────────────────────────────────────
function Tile({ tmpl, onClick }) {
  const isCustom = tmpl.freeform;
  return (
    <button className={s.tile} onClick={onClick}>
      <div className={s.tileIcon}
        style={{ background: isCustom ? '#f1f5f9' : tmpl.color, color: isCustom ? '#64748b' : tmpl.textColor }}>
        {tmpl.icon || tmpl.initials || tmpl.name[0]}
      </div>
      <div className={s.tileName}>{tmpl.name}</div>
    </button>
  );
}

// ── Document editor ───────────────────────────────────────────────────────────
function DocEditor({ tmpl, patient, doctor, clinic, headerImg, footerImg, onBack }) {
  const initFields = {};
  tmpl.fields.forEach(f => { initFields[f.key] = f.default || ''; });
  const [fields,   setFields]   = useState(initFields);
  const [previewing, setPreviewing] = useState(false);
  const set = (k, v) => setFields(p => ({ ...p, [k]: v }));

  const patientData = {
    name:   patient?.patient_name || '—',
    age:    patient?.patient_age  || (patient?.patient_dob ? Math.floor((Date.now() - new Date(patient.patient_dob)) / (365.25 * 24 * 60 * 60 * 1000)) + ' yrs' : ''),
    gender: patient?.patient_gender === 'M' ? 'Male' : patient?.patient_gender === 'F' ? 'Female' : '',
    uhid:   patient?.uhid || '',
    mobile: patient?.patient_mobile || '',
  };
  const doctorData = { name: doctor?.name || '', specialization: doctor?.specialization || '' };

  const docHtml = tmpl.generate(fields, patientData, doctorData, clinic);

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=700,height=900');
    win.document.write(`<!DOCTYPE html><html><head><title>${tmpl.name}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; font-size: 13px; color: #1e293b; }
        * { box-sizing: border-box; }
        .page { padding: 30px 40px; max-width: 720px; margin: auto; }
        p { margin: 6px 0; line-height: 1.6; }
        ol { margin: 6px 0; padding-left: 20px; line-height: 1.8; }
        li { margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; }
        @media print { body { padding: 0; } }
      </style>
    </head><body><div class="page">
      ${headerImg ? `<div style="text-align:center;margin-bottom:16px;"><img src="${headerImg}" style="max-width:100%;max-height:100px;object-fit:contain;" /></div>` : `<div style="text-align:center;margin-bottom:12px;"><div style="font-size:18px;font-weight:800;">${clinic?.clinic_name || ''}</div>${clinic?.clinic_address ? `<div style="font-size:11px;color:#64748b;">${clinic.clinic_address}</div>` : ''}</div>`}
      ${docHtml}
      ${footerImg ? `<div style="text-align:center;margin-top:24px;"><img src="${footerImg}" style="max-width:100%;max-height:80px;object-fit:contain;" /></div>` : ''}
    </div></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  return (
    <div className={s.editorWrap}>
      {/* Editor top bar */}
      <div className={s.editorBar}>
        <button className={s.backBtn} onClick={onBack}><ArrowLeft size={15} /> Back</button>
        <span className={s.editorTitle}>{tmpl.name}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={s.previewBtn} onClick={() => setPreviewing(v => !v)}>
            {previewing ? 'Edit' : 'Preview'}
          </button>
          <button className={s.printBtn} onClick={handlePrint}>
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      <div className={s.editorBody}>
        {/* Left: form */}
        {!previewing && (
          <div className={s.formPane}>
            <div className={s.patientBadge}>
              <span className={s.pbName}>{patientData.name}</span>
              {patientData.age    && <span className={s.pbMeta}>{patientData.age}</span>}
              {patientData.gender && <span className={s.pbMeta}>{patientData.gender}</span>}
              {patientData.uhid   && <span className={s.pbMeta}>UHID: {patientData.uhid}</span>}
            </div>

            {tmpl.fields.map(field => (
              <div key={field.key} className={s.formField}>
                <label className={s.fieldLabel}>{field.label}</label>
                {field.type === 'textarea' ? (
                  <textarea className={s.fieldInput} rows={field.rows || 3}
                    value={fields[field.key]} placeholder={field.placeholder || ''}
                    onChange={e => set(field.key, e.target.value)} />
                ) : field.type === 'select' ? (
                  <select className={s.fieldInput} value={fields[field.key]}
                    onChange={e => set(field.key, e.target.value)}>
                    <option value="">— Select —</option>
                    {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input className={s.fieldInput} type={field.type || 'text'}
                    value={fields[field.key]} placeholder={field.placeholder || ''}
                    onChange={e => set(field.key, e.target.value)} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Right: live preview */}
        <div className={s.previewPane} style={previewing ? { width: '100%' } : {}}>
          {/* Clinic header in preview */}
          <div className={s.docPage}>
            {headerImg
              ? <div className={s.previewHeader}><img src={headerImg} alt="header" className={s.previewHeaderImg} /></div>
              : <div className={s.previewClinic}>
                  <div className={s.previewClinicName}>{clinic?.clinic_name || 'Clinic'}</div>
                  {clinic?.clinic_address && <div className={s.previewClinicSub}>{clinic.clinic_address}</div>}
                </div>
            }
            <div className={s.docContent} dangerouslySetInnerHTML={{ __html: docHtml }} />
            {footerImg && <div className={s.previewFooter}><img src={footerImg} alt="footer" className={s.previewFooterImg} /></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function MedicalDocModal({ appt, user, onClose }) {
  const [selected, setSelected] = useState(null);

  const cid       = user?.clinic_id || 'default';
  const headerImg = localStorage.getItem(`rx_header_${cid}`) || '';
  const footerImg = localStorage.getItem(`rx_footer_${cid}`) || '';
  const clinic    = { clinic_name: user?.clinic_name, clinic_address: user?.clinic_address };
  const doctor    = { name: user?.name, specialization: user?.specialization };

  if (selected) return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <button className={s.topClose} onClick={onClose}><X size={15} /></button>
        <DocEditor
          tmpl={selected} patient={appt} doctor={doctor} clinic={clinic}
          headerImg={headerImg} footerImg={footerImg}
          onBack={() => setSelected(null)}
        />
      </div>
    </div>
  );

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        {/* Header */}
        <div className={s.modalHead}>
          <div>
            <div className={s.modalTitle}>Create a medical document</div>
            {appt?.patient_name && <div className={s.modalSub}>for {appt.patient_name}</div>}
          </div>
          <button className={s.topClose} onClick={onClose}><X size={15} /></button>
        </div>

        <div className={s.modalBody}>
          {/* Certificates */}
          <div className={s.section}>
            <div className={s.sectionLabel}>Select a medical certificate template</div>
            <div className={s.tilesGrid}>
              {CERT_TEMPLATES.map(t => <Tile key={t.id} tmpl={t} onClick={() => setSelected(t)} />)}
            </div>
          </div>

          {/* Consent forms */}
          <div className={s.section}>
            <div className={s.sectionLabel}>Select a consent form template</div>
            <div className={s.tilesGrid}>
              {CONSENT_TEMPLATES.map(t => <Tile key={t.id} tmpl={t} onClick={() => setSelected(t)} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
