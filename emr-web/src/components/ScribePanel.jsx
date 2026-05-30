import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Sparkles, X, CheckCheck, Loader, AlertCircle, Brain,
         Settings, ChevronDown, ChevronUp, Copy, Check, Minimize2, ChevronLeft } from 'lucide-react';
import { api } from '../api/client';
import ManageTemplatesModal from './ManageTemplatesModal';
import styles from './ScribePanel.module.css';

const SEGMENT_MS = 8000;

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'auto', label: 'Auto-detect' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mr', label: 'Marathi' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'pa', label: 'Punjabi' },
];

async function recordSegment(stream, ms) {
  return new Promise(resolve => {
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }));
    rec.start();
    setTimeout(() => rec.stop(), ms);
  });
}

async function sendChunk(blob, language = 'en', specialization = '', drugFormulary = '') {
  const form = new FormData();
  form.append('audio_file', blob, 'chunk.webm');
  form.append('language', language);
  if (specialization) form.append('specialization', specialization);
  if (drugFormulary)  form.append('drugFormulary', drugFormulary);
  const token = localStorage.getItem('emr_token');
  const res = await fetch('/api/emr/scribe/transcribe', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) return '';
  const data = await res.json();
  return data.text || '';
}

const DEFAULT_TEMPLATE_ID = 'infercare';

/**
 * standalone — no patient context; "Apply" becomes "Copy SOAP"
 * fullscreen — position: absolute filling its container (used in VoiceAI page)
 * onClose    — null in fullscreen mode (no X button)
 */
export default function ScribePanel({
  set, setVital, onClose,
  appt, pastNotes, user, form: rxForm,
  standalone = false,
  fullscreen  = false,
  minimized   = false,
  onMinimize  = () => {},
}) {
  const [status,         setStatus]         = useState('idle');
  const [transcript,     setTranscript]     = useState('');
  const [cleaned,        setCleaned]        = useState('');
  const [soap,           setSoap]           = useState(null);
  const [errMsg,         setErrMsg]         = useState('');
  const [elapsed,        setElapsed]        = useState(0);
  const [pending,        setPending]        = useState(0);
  const [language,       setLanguage]       = useState('en');
  const [templates,      setTemplates]      = useState({ predefined: [], custom: [] });
  const [templateId,     setTemplateId]     = useState(DEFAULT_TEMPLATE_ID);
  const [showManage,     setShowManage]     = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);  // auto-collapses when cleaned appears
  const [copied,         setCopied]         = useState(false);

  const streamRef     = useRef(null);
  const recordingRef  = useRef(false);
  const transcriptRef = useRef('');
  const timerRef      = useRef(null);
  const txAreaRef     = useRef(null);

  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  useEffect(() => {
    if (txAreaRef.current) txAreaRef.current.scrollTop = txAreaRef.current.scrollHeight;
  }, [transcript]);

  useEffect(() => {
    if (status === 'recording') {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      if (status === 'idle') setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [status]);

  // Auto-collapse live transcript when cleaned transcript appears
  useEffect(() => {
    if (cleaned) setShowTranscript(false);
  }, [cleaned]);

  useEffect(() => {
    api.get('/scribe/templates')
      .then(data => setTemplates(data))
      .catch(err => console.warn('[scribe] failed to load templates:', err.message));
  }, []);

  const allTemplates    = [...(templates.predefined || []), ...(templates.custom || [])];
  const selectedTemplate = allTemplates.find(t => t.id === templateId) || null;

  const buildContext = useCallback(() => {
    const ctx = {};
    if (appt) {
      ctx.patient = {
        name:            appt.patient_name   || null,
        age:             appt.patient_age    || null,
        gender:          appt.patient_gender === 'M' ? 'Male'
                       : appt.patient_gender === 'F' ? 'Female'
                       : null,
        medical_history: rxForm?.medical_history || [],
        medications:     rxForm?.medications     || [],
      };
    }
    if (pastNotes?.length) ctx.pastNotes = pastNotes.slice(0, 2);
    if (user?.specialization) ctx.specialization = user.specialization;
    if (user?.drug_formulary) ctx.drugFormulary  = user.drug_formulary;
    return ctx;
  }, [appt, pastNotes, user, rxForm]);

  const startRecording = useCallback(async () => {
    setErrMsg(''); setSoap(null); setTranscript(''); setCleaned('');
    setElapsed(0); setPending(0); setShowTranscript(true);
    const spec  = user?.specialization || '';
    const drugs = user?.drug_formulary  || '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      recordingRef.current = true;
      setStatus('recording');
      (async () => {
        while (recordingRef.current) {
          const blob = await recordSegment(streamRef.current, SEGMENT_MS);
          if (!recordingRef.current) break;
          if (blob.size < 500) continue;
          setPending(n => n + 1);
          sendChunk(blob, language, spec, drugs)
            .then(text => { if (text) setTranscript(t => t ? t + ' ' + text : text); })
            .catch(() => {})
            .finally(() => setPending(n => n - 1));
        }
      })();
    } catch {
      setErrMsg('Microphone access denied. Please allow microphone and retry.');
      setStatus('error');
    }
  }, [language, user]);

  const stopRecording = useCallback(() => {
    recordingRef.current = false;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setStatus('idle');
  }, []);

  const extractSOAP = useCallback(async () => {
    const tx = transcriptRef.current.trim();
    if (!tx) return;
    setStatus('extracting'); setErrMsg('');
    try {
      const context     = buildContext();
      const focusPrompt = selectedTemplate?.focus_prompt || '';
      const data = await api.post('/scribe/soap', { transcript: tx, context, focusPrompt });
      setCleaned(data.cleaned || '');
      setSoap(data.soap || data);
      setStatus('done');
    } catch (err) {
      setErrMsg('SOAP extraction failed: ' + err.message);
      setStatus('error');
    }
  }, [buildContext, selectedTemplate]);

  const applyToInferPad = useCallback(() => {
    if (!soap || !set) return;
    if (soap.chief_complaint)        set('notes', soap.chief_complaint);
    if (soap.past_medical_history?.length)
      set('medical_history', soap.past_medical_history.map(h => ({
        key: h.condition.toLowerCase().replace(/\s+/g, '_'),
        label: h.condition, condition: h.condition,
        since: h.since || '', frequency: '',
      })));
    if (soap.symptoms?.length)
      set('symptoms', soap.symptoms.map(s => ({
        name: s.name, since: s.since || '', severity: s.severity || '', code: '',
      })));
    if (soap.diagnosis?.length)
      set('diagnosis', soap.diagnosis.map(d => ({
        display: d.display, code: d.code || '',
        system: d.system || 'http://snomed.info/sct', status: 'active',
      })));
    if (soap.medications?.length)
      set('medications', soap.medications.map(m => ({
        name: m.name, dose: m.dose || '', frequency: m.frequency || '',
        duration: m.duration || '', instructions: m.instructions || '',
        timing: m.timing || '',
      })));
    if (soap.lab_investigations?.length)
      set('lab_investigations', soap.lab_investigations.map(l => ({
        test: l.test, remarks: l.remarks || '',
      })));
    if (soap.lab_results?.length)
      set('lab_results', soap.lab_results.map(r => ({
        test: r.test, result: r.result || '', unit: r.unit || '', range: r.range || '',
      })));
    if (soap.procedures?.length)      set('procedures', soap.procedures);
    if (soap.examination_findings)    set('examination_findings', soap.examination_findings);
    if (soap.notes)                   set('notes', soap.notes);
    if (soap.advices)                 set('advices', soap.advices);
    if (soap.refer_to)                set('refer_to', soap.refer_to);
    if (soap.next_visit_date)         set('next_visit_date', soap.next_visit_date);
    if (soap.next_visit_notes)        set('next_visit_notes', soap.next_visit_notes);
    if (soap.vitals) {
      const v = soap.vitals;
      if (v.bp_systolic)      setVital('bp_systolic',      String(v.bp_systolic));
      if (v.bp_diastolic)     setVital('bp_diastolic',     String(v.bp_diastolic));
      if (v.pulse)            setVital('pulse',            String(v.pulse));
      if (v.temp)             setVital('temp',             String(v.temp));
      if (v.spo2)             setVital('spo2',             String(v.spo2));
      if (v.respiratory_rate) setVital('respiratory_rate', String(v.respiratory_rate));
      if (v.height)           setVital('height',           String(v.height));
      if (v.weight)           setVital('weight',           String(v.weight));
    }
    onClose?.();
  }, [soap, set, setVital, onClose]);

  const copySOAP = useCallback(async () => {
    if (!soap) return;
    const lines = [];
    if (soap.chief_complaint)           lines.push(`Chief Complaint: ${soap.chief_complaint}`);
    if (soap.symptoms?.length)          lines.push(`Symptoms: ${soap.symptoms.map(s => s.name).join(', ')}`);
    if (soap.diagnosis?.length)         lines.push(`Diagnosis: ${soap.diagnosis.map(d => d.display).join(', ')}`);
    if (soap.medications?.length)       lines.push(`Medications:\n${soap.medications.map(m => `  - ${m.name} ${m.dose || ''} ${m.frequency || ''} ${m.duration || ''}`.trim()).join('\n')}`);
    if (soap.lab_investigations?.length) lines.push(`Lab Orders: ${soap.lab_investigations.map(l => l.test).join(', ')}`);
    if (soap.examination_findings)      lines.push(`Examination: ${soap.examination_findings}`);
    if (soap.notes)                     lines.push(`Notes: ${soap.notes}`);
    if (soap.advices)                   lines.push(`Advice: ${soap.advices}`);
    if (soap.refer_to)                  lines.push(`Referral: ${soap.refer_to}`);
    if (soap.next_visit_date)           lines.push(`Follow-up: ${soap.next_visit_date}`);
    await navigator.clipboard.writeText(lines.join('\n\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [soap]);

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  const isTranscribing = pending > 0;

  const panelClass = [
    styles.panel,
    fullscreen ? styles.panelFullscreen : '',
    minimized  ? styles.panelMinimized  : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={panelClass}>

      {/* ManageTemplatesModal overlays the whole panel */}
      {showManage && (
        <ManageTemplatesModal
          templates={templates}
          onClose={() => setShowManage(false)}
          onRefresh={() => api.get('/scribe/templates').then(setTemplates).catch(() => {})}
        />
      )}

      {/* Header */}
      {/* Minimized tab strip */}
      {minimized && (
        <button className={styles.minTab} onClick={() => onMinimize(false)}>
          <ChevronLeft size={14} />
          <Mic size={14} strokeWidth={1.8} />
          <span className={styles.minTabLabel}>Scribe</span>
          {status === 'recording' && <span className={styles.minTabRec}>●</span>}
        </button>
      )}

      {!minimized && <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Mic size={16} className={styles.headerIcon} />
          <span>{standalone ? 'Infer Voice AI' : 'Medical Scribe'}</span>
          {status === 'recording' && <span className={styles.timer}>{fmt(elapsed)}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button className={styles.minimizeBtn} onClick={() => onMinimize(true)} title="Minimize">
            <Minimize2 size={14} />
          </button>
          {onClose && (
            <button className={styles.closeBtn} onClick={() => { stopRecording(); onClose(); }}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>}

      {/* Controls + body — hidden when minimized */}
      {!minimized && <>
      <div className={styles.controls}>
        <div className={styles.controlsRow2}>
          <select
            className={styles.langSelect}
            value={language}
            onChange={e => setLanguage(e.target.value)}
            disabled={status === 'recording'}
          >
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>

          <div className={styles.templateRow}>
            <select
              className={styles.templateSelect}
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              disabled={status === 'recording' || status === 'extracting'}
            >
              {templates.predefined?.length > 0 && (
                <optgroup label="Predefined Templates">
                  {templates.predefined.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              )}
              {templates.custom?.length > 0 && (
                <optgroup label="My Templates">
                  {templates.custom.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              className={styles.btnManage}
              onClick={() => setShowManage(true)}
              title="Manage Templates"
            >
              <Settings size={13} />
            </button>
          </div>
        </div>

        {selectedTemplate?.description && (
          <p className={styles.templateDesc}>{selectedTemplate.description}</p>
        )}

        <div className={styles.controlRow}>
          {status !== 'recording' ? (
            <button className={styles.btnRecord} onClick={startRecording} disabled={status === 'extracting'}>
              <Mic size={15} /> Start Recording
            </button>
          ) : (
            <button className={`${styles.btnRecord} ${styles.btnStop}`} onClick={stopRecording}>
              <MicOff size={15} /> Stop Recording
            </button>
          )}
          <button
            className={styles.btnExtract}
            onClick={extractSOAP}
            disabled={!transcript.trim() || status === 'recording' || status === 'extracting'}
          >
            {status === 'extracting'
              ? <><Loader size={14} className={styles.spin} /> Extracting…</>
              : <><Sparkles size={14} /> Extract SOAP</>}
          </button>
        </div>
      </div>

      {/* Context badge (non-standalone only) */}
      {!standalone && (appt || pastNotes?.length > 0) && (
        <div className={styles.contextBar}>
          {appt && <span className={styles.contextChip}>{appt.patient_name}</span>}
          {pastNotes?.length > 0 && (
            <span className={styles.contextChip}>{pastNotes.length} past visit{pastNotes.length > 1 ? 's' : ''}</span>
          )}
          {user?.specialization && (
            <span className={styles.contextChip}>{user.specialization}</span>
          )}
        </div>
      )}

      {/* Recording bar */}
      {status === 'recording' && (
        <div className={styles.recordingBar}>
          <span className={styles.recDot} />
          <span>Recording — sending every {SEGMENT_MS / 1000}s</span>
        </div>
      )}

      {/* AI transcribing animation */}
      {isTranscribing && (
        <div className={styles.aiBar}>
          <Brain size={13} className={styles.aiBrainSpin} />
          <span className={styles.aiLabel}>AI transcribing</span>
          <span className={styles.aiDots}><span /><span /><span /></span>
          {pending > 1 && <span className={styles.aiBadge}>{pending}</span>}
        </div>
      )}

      {/* Error */}
      {errMsg && (
        <div className={styles.error}>
          <AlertCircle size={13} /> {errMsg}
        </div>
      )}

      {/* Scrollable content area */}
      <div className={styles.scrollArea}>

        {/* Live Transcript — collapses smoothly when cleaned appears */}
        <div className={`${styles.txSection} ${!showTranscript ? styles.txSectionHidden : ''}`}>
          <div className={styles.section}>
            <div className={styles.sectionLabelRow}>
              <span className={styles.sectionLabel}>Live Transcript</span>
              {transcript && (
                <button
                  className={styles.txToggle}
                  onClick={() => setShowTranscript(v => !v)}
                  title={showTranscript ? 'Collapse' : 'Expand'}
                >
                  {showTranscript ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}
            </div>
            <div className={styles.transcriptBox} ref={txAreaRef}>
              {transcript || <span className={styles.placeholder}>Transcript will appear here as you speak…</span>}
            </div>
          </div>
        </div>

        {/* Cleaned transcript */}
        {cleaned && (
          <div className={styles.section}>
            <div className={styles.sectionLabelRow}>
              <span className={styles.sectionLabel}>Cleaned Transcript</span>
              {!showTranscript && transcript && (
                <button
                  className={styles.txToggle}
                  onClick={() => setShowTranscript(true)}
                  title="Show live transcript"
                >
                  <ChevronDown size={12} /> Raw
                </button>
              )}
            </div>
            <div className={styles.transcriptBox}>{cleaned}</div>
          </div>
        )}

        {/* SOAP Notes */}
        {soap && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Extracted SOAP</div>
            <div className={styles.soapBox}>
              {soap.chief_complaint && <SoapRow label="Chief Complaint" value={soap.chief_complaint} />}
              {soap.past_medical_history?.length > 0 && (
                <SoapRow label="Past History" value={soap.past_medical_history.map(h =>
                  `${h.condition}${h.since ? ` (since ${h.since})` : ''}`
                ).join(' · ')} />
              )}
              {soap.symptoms?.length > 0 && (
                <SoapRow label="Symptoms" value={soap.symptoms.map(s =>
                  `${s.name}${s.severity ? ` (${s.severity})` : ''}${s.since ? `, since ${s.since}` : ''}`
                ).join(' · ')} />
              )}
              {soap.diagnosis?.length > 0 && (
                <SoapRow label="Diagnosis" value={soap.diagnosis.map(d => d.display).join(' · ')} />
              )}
              {soap.medications?.length > 0 && (
                <SoapRow label="Medications" value={soap.medications.map(m =>
                  `${m.name}${m.dose ? ` ${m.dose}` : ''}${m.frequency ? `, ${m.frequency}` : ''}${m.duration ? ` × ${m.duration}` : ''}`
                ).join(' · ')} />
              )}
              {soap.lab_investigations?.length > 0 && (
                <SoapRow label="Lab Orders" value={soap.lab_investigations.map(l => l.test).join(', ')} />
              )}
              {soap.lab_results?.length > 0 && (
                <SoapRow label="Lab Results" value={soap.lab_results.map(r =>
                  `${r.test}${r.result ? `: ${r.result}${r.unit ? ' ' + r.unit : ''}` : ''}`
                ).join(' · ')} />
              )}
              {soap.procedures?.length > 0 && (
                <SoapRow label="Procedures" value={soap.procedures.join(', ')} />
              )}
              {soap.vitals && Object.values(soap.vitals).some(Boolean) && (
                <SoapRow label="Vitals" value={
                  Object.entries(soap.vitals).filter(([, v]) => v)
                    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(', ')
                } />
              )}
              {soap.examination_findings && <SoapRow label="Examination" value={soap.examination_findings} />}
              {soap.notes && <SoapRow label="Notes" value={soap.notes} />}
              {soap.advices && <SoapRow label="Advice" value={soap.advices} />}
              {soap.refer_to && <SoapRow label="Referral" value={soap.refer_to} />}
              {soap.next_visit_date && (
                <SoapRow label="Follow-up" value={[soap.next_visit_date, soap.next_visit_notes].filter(Boolean).join(' · ')} />
              )}
            </div>

            {/* Action buttons */}
            <div className={styles.soapActions}>
              <button className={styles.btnCopy} onClick={copySOAP}>
                {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy SOAP</>}
              </button>
              {!standalone && (
                <button className={styles.btnApply} onClick={applyToInferPad}>
                  <CheckCheck size={14} /> Apply to InferPad
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      </>}
    </div>
  );
}

function SoapRow({ label, value }) {
  return (
    <div className={styles.soapRow}>
      <span className={styles.soapLabel}>{label}</span>
      <span className={styles.soapValue}>{value}</span>
    </div>
  );
}
