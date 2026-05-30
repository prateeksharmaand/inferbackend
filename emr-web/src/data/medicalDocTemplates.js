// ── Medical Document Templates ────────────────────────────────────────────────
// type: 'certificate' | 'consent'
// fields: inputs the doctor fills before generating
// generate(fields, patient, doctor, clinic) → HTML string

export const TEMPLATES = [
  // ─── MEDICAL CERTIFICATES ──────────────────────────────────────────────────
  {
    id: 'make_cert', name: 'Make your own', type: 'certificate',
    color: '#e2e8f0', textColor: '#64748b', icon: '✏️', freeform: true,
    fields: [
      { key: 'title',   label: 'Document Title', type: 'text',     placeholder: 'Medical Certificate' },
      { key: 'content', label: 'Content',         type: 'textarea', placeholder: 'Type document content here…', rows: 10 },
    ],
    generate: (f, p, d, c) => `
      <p style="text-align:center;font-size:16px;font-weight:700;text-decoration:underline;">${f.title || 'Medical Certificate'}</p>
      <p>${f.content || ''}</p>
    `,
  },
  {
    id: 'leave_illness', name: 'Leave after illness', type: 'certificate',
    color: '#8b5cf6', textColor: '#fff', initials: 'L',
    fields: [
      { key: 'diagnosis',  label: 'Diagnosis / Illness',   type: 'text',   placeholder: 'e.g. Acute Viral Fever' },
      { key: 'days',       label: 'Rest Period (days)',     type: 'number', placeholder: '3' },
      { key: 'from_date',  label: 'Rest From',             type: 'date'  },
      { key: 'to_date',    label: 'Rest To',               type: 'date'  },
      { key: 'remarks',    label: 'Additional Remarks',    type: 'textarea', placeholder: 'Patient should avoid strenuous activity…', rows: 3 },
    ],
    generate: (f, p, d, c) => `
      <p style="text-align:center;font-size:16px;font-weight:700;text-decoration:underline;">Medical Certificate — Leave after Illness</p>
      <p>To Whomsoever It May Concern,</p>
      <p>This is to certify that <b>${p.name}</b>${p.age ? ', aged ' + p.age + ' years' : ''}${p.gender ? ', ' + p.gender : ''}, has been under my medical care and treatment.</p>
      <p>Diagnosis: <b>${f.diagnosis || '—'}</b></p>
      <p>The patient has been advised complete bed rest and is unfit to attend work/school/college for a period of <b>${f.days || '—'} day(s)</b>${f.from_date ? ', from <b>' + fmtDate(f.from_date) + '</b>' : ''}${f.to_date ? ' to <b>' + fmtDate(f.to_date) + '</b>' : ''}.</p>
      ${f.remarks ? `<p>${f.remarks}</p>` : ''}
      <p>This certificate is issued on medical grounds.</p>
    `,
  },
  {
    id: 'fitness_adult', name: 'Fitness Adult', type: 'certificate',
    color: '#d97706', textColor: '#fff', initials: 'F',
    fields: [
      { key: 'purpose',    label: 'Purpose of Fitness',    type: 'text',   placeholder: 'e.g. Employment / Gym / Sports' },
      { key: 'bp',         label: 'Blood Pressure',        type: 'text',   placeholder: '120/80 mmHg' },
      { key: 'pulse',      label: 'Pulse',                 type: 'text',   placeholder: '72 bpm' },
      { key: 'bmi',        label: 'BMI',                   type: 'text',   placeholder: '22.4 kg/m²' },
      { key: 'findings',   label: 'Clinical Findings',     type: 'textarea', placeholder: 'General examination: normal…', rows: 3 },
      { key: 'remarks',    label: 'Remarks',               type: 'textarea', placeholder: '', rows: 2 },
    ],
    generate: (f, p, d, c) => `
      <p style="text-align:center;font-size:16px;font-weight:700;text-decoration:underline;">Fitness Certificate</p>
      <p>To Whomsoever It May Concern,</p>
      <p>This is to certify that <b>${p.name}</b>${p.age ? ', aged ' + p.age + ' years' : ''}${p.gender ? ', ' + p.gender : ''}, was examined by me on <b>${today()}</b>.</p>
      <p><b>Purpose:</b> ${f.purpose || '—'}</p>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        ${f.bp    ? `<tr><td style="padding:4px;border:1px solid #e2e8f0;width:40%">Blood Pressure</td><td style="padding:4px;border:1px solid #e2e8f0;">${f.bp}</td></tr>` : ''}
        ${f.pulse ? `<tr><td style="padding:4px;border:1px solid #e2e8f0;">Pulse Rate</td><td style="padding:4px;border:1px solid #e2e8f0;">${f.pulse}</td></tr>` : ''}
        ${f.bmi   ? `<tr><td style="padding:4px;border:1px solid #e2e8f0;">BMI</td><td style="padding:4px;border:1px solid #e2e8f0;">${f.bmi}</td></tr>` : ''}
      </table>
      ${f.findings ? `<p><b>Clinical Findings:</b> ${f.findings}</p>` : ''}
      <p>Based on the clinical examination, <b>${p.name}</b> is found to be <b>medically fit</b>${f.purpose ? ' for ' + f.purpose : ''}.</p>
      ${f.remarks ? `<p>${f.remarks}</p>` : ''}
    `,
  },
  {
    id: 'travel_cert', name: 'Travel Certificate', type: 'certificate',
    color: '#16a34a', textColor: '#fff', initials: 'T',
    fields: [
      { key: 'destination', label: 'Destination',         type: 'text',   placeholder: 'e.g. Delhi / London' },
      { key: 'mode',        label: 'Mode of Travel',      type: 'select', options: ['Air', 'Road', 'Rail', 'Sea'] },
      { key: 'travel_date', label: 'Travel Date',         type: 'date' },
      { key: 'condition',   label: 'Medical Condition',   type: 'text',   placeholder: 'e.g. Stable, post-surgery' },
      { key: 'remarks',     label: 'Remarks / Precautions', type: 'textarea', placeholder: '', rows: 3 },
    ],
    generate: (f, p, d, c) => `
      <p style="text-align:center;font-size:16px;font-weight:700;text-decoration:underline;">Fitness to Travel Certificate</p>
      <p>To Whomsoever It May Concern,</p>
      <p>This is to certify that <b>${p.name}</b>${p.age ? ', aged ' + p.age + ' years' : ''}${p.gender ? ', ' + p.gender : ''}, is currently under my medical care.</p>
      <p>Medical Condition: <b>${f.condition || 'Stable'}</b></p>
      <p>The patient is medically fit to travel by <b>${f.mode || 'Air'}</b>${f.destination ? ' to <b>' + f.destination + '</b>' : ''}${f.travel_date ? ' on <b>' + fmtDate(f.travel_date) + '</b>' : ''}.</p>
      ${f.remarks ? `<p><b>Precautions / Remarks:</b> ${f.remarks}</p>` : ''}
      <p>This certificate is valid for the date of travel mentioned above.</p>
    `,
  },
  {
    id: 'echo_2d', name: '2D ECHO', type: 'certificate',
    color: '#dc2626', textColor: '#fff', initials: '2',
    fields: [
      { key: 'indication',  label: 'Indication',           type: 'text',     placeholder: 'e.g. Chest pain, Dyspnea' },
      { key: 'ef',          label: 'Ejection Fraction (%)',type: 'text',     placeholder: 'e.g. 60%' },
      { key: 'findings',    label: 'Echo Findings',        type: 'textarea', placeholder: 'LV size: normal, Wall motion: normal…', rows: 5 },
      { key: 'impression',  label: 'Impression',           type: 'textarea', placeholder: 'Normal 2D echo study.', rows: 2 },
    ],
    generate: (f, p, d, c) => `
      <p style="text-align:center;font-size:16px;font-weight:700;text-decoration:underline;">2D Echocardiography Report</p>
      <p><b>Patient:</b> ${p.name}${p.age ? ', ' + p.age + ' years' : ''}${p.gender ? ', ' + p.gender : ''}</p>
      <p><b>Date:</b> ${today()}</p>
      <p><b>Referring Doctor:</b> Dr. ${d.name || '—'}</p>
      <p><b>Indication:</b> ${f.indication || '—'}</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0;">
      ${f.ef ? `<p><b>Ejection Fraction:</b> ${f.ef}</p>` : ''}
      <p><b>Findings:</b></p>
      <p style="white-space:pre-line;">${f.findings || '—'}</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0;">
      <p><b>Impression:</b> ${f.impression || '—'}</p>
    `,
  },
  {
    id: 'preop_fitness', name: 'Pre-Op Medical Fitness Certificate', type: 'certificate',
    color: '#7c3aed', textColor: '#fff', initials: 'P',
    fields: [
      { key: 'surgery',     label: 'Planned Surgery / Procedure', type: 'text',     placeholder: 'e.g. Appendectomy, Knee replacement' },
      { key: 'surgeon',     label: 'Operating Surgeon',           type: 'text',     placeholder: 'Dr.' },
      { key: 'hospital',    label: 'Hospital',                    type: 'text',     placeholder: '' },
      { key: 'bp',          label: 'Blood Pressure',              type: 'text',     placeholder: '120/80 mmHg' },
      { key: 'pulse',       label: 'Pulse Rate',                  type: 'text',     placeholder: '72 bpm' },
      { key: 'spo2',        label: 'SpO₂',                       type: 'text',     placeholder: '98%' },
      { key: 'ecg',         label: 'ECG',                         type: 'text',     placeholder: 'Normal sinus rhythm' },
      { key: 'comorbid',    label: 'Co-morbidities',              type: 'textarea', placeholder: 'Type 2 DM (controlled), Hypertension (controlled)', rows: 2 },
      { key: 'risk',        label: 'Anaesthetic Risk',            type: 'select',   options: ['Low (ASA I)', 'Moderate (ASA II)', 'High (ASA III)', 'Very High (ASA IV)'] },
      { key: 'remarks',     label: 'Remarks',                     type: 'textarea', placeholder: '', rows: 2 },
    ],
    generate: (f, p, d, c) => `
      <p style="text-align:center;font-size:16px;font-weight:700;text-decoration:underline;">Pre-Operative Medical Fitness Certificate</p>
      <p>To Dr. ${f.surgeon || '—'}${f.hospital ? ', ' + f.hospital : ''},</p>
      <p>This is to certify that <b>${p.name}</b>${p.age ? ', aged ' + p.age + ' years' : ''}${p.gender ? ', ' + p.gender : ''}, has been examined by me on <b>${today()}</b> in preparation for the planned surgical procedure: <b>${f.surgery || '—'}</b>.</p>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        ${f.bp    ? `<tr><td style="padding:4px;border:1px solid #e2e8f0;width:40%">Blood Pressure</td><td style="padding:4px;border:1px solid #e2e8f0;">${f.bp}</td></tr>` : ''}
        ${f.pulse ? `<tr><td style="padding:4px;border:1px solid #e2e8f0;">Pulse Rate</td><td style="padding:4px;border:1px solid #e2e8f0;">${f.pulse}</td></tr>` : ''}
        ${f.spo2  ? `<tr><td style="padding:4px;border:1px solid #e2e8f0;">SpO₂</td><td style="padding:4px;border:1px solid #e2e8f0;">${f.spo2}</td></tr>` : ''}
        ${f.ecg   ? `<tr><td style="padding:4px;border:1px solid #e2e8f0;">ECG</td><td style="padding:4px;border:1px solid #e2e8f0;">${f.ecg}</td></tr>` : ''}
      </table>
      ${f.comorbid ? `<p><b>Co-morbidities:</b> ${f.comorbid}</p>` : ''}
      <p><b>Anaesthetic Risk:</b> ${f.risk || 'Low (ASA I)'}</p>
      <p>The patient is <b>medically fit</b> to undergo the above-mentioned surgical procedure under anaesthesia.</p>
      ${f.remarks ? `<p><b>Remarks:</b> ${f.remarks}</p>` : ''}
    `,
  },
  {
    id: 'discharge', name: 'Discharge Certificate', type: 'certificate',
    color: '#db2777', textColor: '#fff', initials: 'DC',
    fields: [
      { key: 'admission_date', label: 'Admission Date',   type: 'date' },
      { key: 'discharge_date', label: 'Discharge Date',   type: 'date' },
      { key: 'diagnosis',      label: 'Final Diagnosis',  type: 'textarea', placeholder: '', rows: 2 },
      { key: 'treatment',      label: 'Treatment Given',  type: 'textarea', placeholder: '', rows: 3 },
      { key: 'condition',      label: 'Condition at Discharge', type: 'select', options: ['Improved', 'Stable', 'Relieved', 'LAMA (Left Against Medical Advice)', 'Referred', 'Expired'] },
      { key: 'followup',       label: 'Follow-Up Advice', type: 'textarea', placeholder: 'Review after 1 week with reports.', rows: 2 },
    ],
    generate: (f, p, d, c) => `
      <p style="text-align:center;font-size:16px;font-weight:700;text-decoration:underline;">Discharge Certificate</p>
      <p><b>Patient:</b> ${p.name}${p.age ? ', ' + p.age + ' years' : ''}${p.gender ? ', ' + p.gender : ''}</p>
      ${p.uhid ? `<p><b>UHID:</b> ${p.uhid}</p>` : ''}
      <p><b>Attending Doctor:</b> Dr. ${d.name || '—'}${d.specialization ? ', ' + d.specialization : ''}</p>
      ${f.admission_date ? `<p><b>Admission Date:</b> ${fmtDate(f.admission_date)}</p>` : ''}
      ${f.discharge_date ? `<p><b>Discharge Date:</b> ${fmtDate(f.discharge_date)}</p>` : ''}
      <p><b>Final Diagnosis:</b> ${f.diagnosis || '—'}</p>
      ${f.treatment ? `<p><b>Treatment Given:</b> ${f.treatment}</p>` : ''}
      <p><b>Condition at Discharge:</b> ${f.condition || 'Improved'}</p>
      ${f.followup ? `<p><b>Follow-Up Advice:</b> ${f.followup}</p>` : ''}
      <p>This certificate is issued at the time of discharge for record and reference purposes.</p>
    `,
  },

  // ─── CONSENT FORMS ─────────────────────────────────────────────────────────
  {
    id: 'make_consent', name: 'Make your own', type: 'consent',
    color: '#e2e8f0', textColor: '#64748b', icon: '✏️', freeform: true,
    fields: [
      { key: 'title',   label: 'Consent Title',  type: 'text',     placeholder: 'Informed Consent for…' },
      { key: 'content', label: 'Consent Content',type: 'textarea', placeholder: 'I, the undersigned, hereby consent…', rows: 10 },
    ],
    generate: (f, p, d, c) => `
      <p style="text-align:center;font-size:16px;font-weight:700;text-decoration:underline;">${f.title || 'Consent Form'}</p>
      <p>${f.content || ''}</p>
      ${sigBlock(p, d)}
    `,
  },
  {
    id: 'hiv_consent', name: 'HIV Consent', type: 'consent',
    color: '#0891b2', textColor: '#fff', initials: 'H',
    fields: [
      { key: 'test_reason', label: 'Reason for Testing', type: 'text', placeholder: 'Pre-operative / Voluntary testing' },
    ],
    generate: (f, p, d, c) => `
      <p style="text-align:center;font-size:16px;font-weight:700;text-decoration:underline;">Informed Consent for HIV Testing</p>
      <p>I, <b>${p.name}</b>, hereby voluntarily consent to undergo HIV testing${f.test_reason ? ' for the purpose of: <b>' + f.test_reason + '</b>' : ''}.</p>
      <p>I understand the following:</p>
      <ol>
        <li>HIV testing is voluntary and I may refuse the test without affecting my medical care (except where testing is mandatory pre-operatively).</li>
        <li>My test results will be kept strictly confidential and shared only with authorised medical personnel directly involved in my care.</li>
        <li>I have been offered pre-test counselling and have had the opportunity to ask questions.</li>
        <li>A positive result does not mean I have AIDS; further testing and counselling will be provided.</li>
        <li>I understand the implications of a positive result and the importance of notifying sexual partners.</li>
        <li>I consent to post-test counselling being provided regardless of the result.</li>
      </ol>
      ${sigBlock(p, d)}
    `,
  },
  {
    id: 'prp_consent', name: 'PRP Consent', type: 'consent',
    color: '#7c3aed', textColor: '#fff', initials: 'PRP',
    fields: [
      { key: 'area',    label: 'Treatment Area',  type: 'text',   placeholder: 'e.g. Scalp / Face / Knee' },
      { key: 'sessions',label: 'No. of Sessions', type: 'number', placeholder: '3' },
    ],
    generate: (f, p, d, c) => `
      <p style="text-align:center;font-size:16px;font-weight:700;text-decoration:underline;">Informed Consent for PRP (Platelet-Rich Plasma) Treatment</p>
      <p>I, <b>${p.name}</b>, consent to undergo PRP therapy${f.area ? ' to the <b>' + f.area + '</b>' : ''}${f.sessions ? ', for <b>' + f.sessions + '</b> session(s)' : ''}, under the care of Dr. ${d.name || '—'}.</p>
      <p>I understand and acknowledge the following:</p>
      <ol>
        <li><b>Nature of procedure:</b> PRP involves drawing a small amount of my blood, processing it to concentrate platelets, and re-injecting it into the treatment area to promote healing and rejuvenation.</li>
        <li><b>Benefits:</b> Potential improvement in hair growth, skin texture, or tissue repair depending on the area treated.</li>
        <li><b>Risks and side effects:</b> Temporary swelling, bruising, redness, pain at injection site. Rarely, infection or nerve injury may occur.</li>
        <li><b>No guarantee:</b> Results vary and are not guaranteed.</li>
        <li><b>Alternative treatments:</b> I have been informed of alternative options and have chosen PRP treatment voluntarily.</li>
        <li>I confirm that I have disclosed all known medical conditions and medications to my doctor.</li>
      </ol>
      ${sigBlock(p, d)}
    `,
  },
  {
    id: 'lhr_consent', name: 'Laser Hair Reduction', type: 'consent',
    color: '#16a34a', textColor: '#fff', initials: 'LHR',
    fields: [
      { key: 'area',     label: 'Treatment Area',   type: 'text',   placeholder: 'e.g. Full legs / Underarms / Face' },
      { key: 'sessions', label: 'No. of Sessions',  type: 'number', placeholder: '6' },
      { key: 'skin_type',label: 'Skin Type (Fitzpatrick)', type: 'select', options: ['Type I', 'Type II', 'Type III', 'Type IV', 'Type V', 'Type VI'] },
    ],
    generate: (f, p, d, c) => `
      <p style="text-align:center;font-size:16px;font-weight:700;text-decoration:underline;">Informed Consent for Laser Hair Reduction</p>
      <p>I, <b>${p.name}</b>, hereby voluntarily consent to laser hair reduction treatment${f.area ? ' on <b>' + f.area + '</b>' : ''}${f.sessions ? ' for <b>' + f.sessions + '</b> session(s)' : ''}, performed by the team under Dr. ${d.name || '—'}.</p>
      <p><b>Skin Type:</b> Fitzpatrick ${f.skin_type || '—'}</p>
      <p>I understand the following:</p>
      <ol>
        <li><b>Mechanism:</b> Laser energy selectively targets melanin in hair follicles to reduce hair growth. Multiple sessions are required.</li>
        <li><b>Pre-treatment instructions:</b> I will shave the area 24 hours before. I will not wax or pluck for at least 4 weeks prior. I will avoid sun exposure and tanning for 4 weeks before and after.</li>
        <li><b>Possible side effects:</b> Temporary redness, swelling, pigmentation changes (more common in darker skin tones), blistering (rare), or scarring (very rare).</li>
        <li><b>Results:</b> Laser hair reduction provides significant reduction, not permanent removal in all cases. Results vary by individual and hair type.</li>
        <li>I have disclosed all medications (especially photosensitising drugs), skin conditions, and recent sun exposure.</li>
        <li>I am not pregnant, and I will inform the clinic if I become pregnant during the treatment course.</li>
      </ol>
      ${sigBlock(p, d)}
    `,
  },
  {
    id: 'chemical_peel', name: 'Chemical Peeling', type: 'consent',
    color: '#b45309', textColor: '#fff', initials: 'CP',
    fields: [
      { key: 'peel_type', label: 'Peel Type',     type: 'text',   placeholder: 'e.g. Glycolic 30%, Salicylic 20%, TCA 20%' },
      { key: 'area',      label: 'Treatment Area', type: 'text',   placeholder: 'e.g. Full face, Neck, Back' },
      { key: 'sessions',  label: 'No. of Sessions',type: 'number', placeholder: '4' },
    ],
    generate: (f, p, d, c) => `
      <p style="text-align:center;font-size:16px;font-weight:700;text-decoration:underline;">Informed Consent for Chemical Peeling</p>
      <p>I, <b>${p.name}</b>, hereby voluntarily consent to chemical peeling${f.peel_type ? ' using <b>' + f.peel_type + '</b>' : ''}${f.area ? ' on <b>' + f.area + '</b>' : ''}${f.sessions ? ' for <b>' + f.sessions + '</b> session(s)' : ''}, performed under the supervision of Dr. ${d.name || '—'}.</p>
      <p>I understand the following:</p>
      <ol>
        <li><b>Purpose:</b> Chemical peeling is used to improve skin texture, pigmentation, acne, fine lines, and other skin concerns by applying a chemical solution that causes controlled exfoliation.</li>
        <li><b>Procedure:</b> The chemical is applied to clean skin, left for a specified time, then neutralised. Mild stinging or warmth is normal during application.</li>
        <li><b>Post-peel care:</b> I will use sunscreen (SPF 30+), avoid sun exposure, not pick or peel the skin, and follow all post-procedure instructions given by my doctor.</li>
        <li><b>Expected effects:</b> Redness, peeling, and skin sensitivity for 5–10 days after each session.</li>
        <li><b>Possible risks:</b> Persistent redness, post-inflammatory hyperpigmentation (PIH), scarring (rare), infection (rare).</li>
        <li>I have disclosed all medications (especially retinoids, isotretinoin), skin conditions, allergies, and any recent procedures.</li>
        <li>I am not pregnant or breastfeeding.</li>
      </ol>
      ${sigBlock(p, d)}
    `,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() {
  const d = new Date();
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtDate(str) {
  if (!str) return '';
  return new Date(str + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
function sigBlock(p, d) {
  return `
    <br/>
    <table style="width:100%;margin-top:24px;">
      <tr>
        <td style="width:50%;vertical-align:bottom;padding:0 8px 0 0;">
          <div style="border-top:1px solid #333;padding-top:4px;font-size:11px;">
            Patient / Guardian Signature<br/>
            Name: ${p.name}<br/>
            Date: ${today()}
          </div>
        </td>
        <td style="width:50%;vertical-align:bottom;padding:0 0 0 8px;">
          <div style="border-top:1px solid #333;padding-top:4px;font-size:11px;">
            Doctor's Signature &amp; Stamp<br/>
            Dr. ${d.name || '—'}${d.specialization ? ', ' + d.specialization : ''}<br/>
            Date: ${today()}
          </div>
        </td>
      </tr>
    </table>
  `;
}

export const CERT_TEMPLATES    = TEMPLATES.filter(t => t.type === 'certificate');
export const CONSENT_TEMPLATES = TEMPLATES.filter(t => t.type === 'consent');
