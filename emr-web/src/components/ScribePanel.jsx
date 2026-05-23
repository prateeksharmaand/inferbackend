import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Sparkles, X, CheckCheck, Loader, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import styles from './ScribePanel.module.css';

const SEGMENT_MS = 8000; // record in 8-second segments for real-time feel

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

async function sendChunk(blob) {
  const form = new FormData();
  form.append('audio_file', blob, 'chunk.webm');
  const BASE = '/api/emr';
  const token = localStorage.getItem('emr_token');
  const res = await fetch(`${BASE}/scribe/transcribe`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) return '';
  const data = await res.json();
  return data.text || '';
}

export default function ScribePanel({ set, setVital, onClose }) {
  const [status,     setStatus]     = useState('idle');   // idle | recording | extracting | done | error
  const [transcript, setTranscript] = useState('');
  const [cleaned,    setCleaned]    = useState('');
  const [soap,       setSoap]       = useState(null);
  const [errMsg,     setErrMsg]     = useState('');
  const [elapsed,    setElapsed]    = useState(0);

  const streamRef    = useRef(null);
  const recordingRef = useRef(false);
  const transcriptRef= useRef('');
  const timerRef     = useRef(null);
  const txAreaRef    = useRef(null);

  // keep transcriptRef in sync for async loop
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  // auto-scroll transcript
  useEffect(() => {
    if (txAreaRef.current) txAreaRef.current.scrollTop = txAreaRef.current.scrollHeight;
  }, [transcript]);

  // elapsed timer
  useEffect(() => {
    if (status === 'recording') {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      if (status === 'idle') setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [status]);

  const startRecording = useCallback(async () => {
    setErrMsg(''); setSoap(null); setTranscript(''); setCleaned(''); setElapsed(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      recordingRef.current = true;
      setStatus('recording');

      // recording loop — each segment is an independent decodable webm
      (async () => {
        while (recordingRef.current) {
          const blob = await recordSegment(streamRef.current, SEGMENT_MS);
          if (!recordingRef.current) break;
          if (blob.size < 500) continue;
          try {
            const text = await sendChunk(blob);
            if (text) setTranscript(t => t ? t + ' ' + text : text);
          } catch { /* ignore individual chunk errors */ }
        }
      })();
    } catch (err) {
      setErrMsg('Microphone access denied. Please allow microphone and retry.');
      setStatus('error');
    }
  }, []);

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
      const data = await api.post('/scribe/soap', { transcript: tx });
      setCleaned(data.cleaned || '');
      setSoap(data.soap || data);
      setStatus('done');
    } catch (err) {
      setErrMsg('SOAP extraction failed: ' + err.message);
      setStatus('error');
    }
  }, []);

  const applyToInferPad = useCallback(() => {
    if (!soap) return;

    if (soap.chief_complaint)     set('notes', soap.chief_complaint);
    if (soap.symptoms?.length)    set('symptoms', soap.symptoms.map(s => ({
      name: s.name, since: s.since || '', severity: s.severity || '', code: '',
    })));
    if (soap.diagnosis?.length)   set('diagnosis', soap.diagnosis.map(d => ({
      display: d.display, code: d.code || '', system: d.system || 'http://snomed.info/sct', status: 'active',
    })));
    if (soap.medications?.length) set('medications', soap.medications.map(m => ({
      name: m.name, dose: m.dose || '', frequency: m.frequency || '',
      duration: m.duration || '', instructions: m.instructions || '', timing: '',
    })));
    if (soap.lab_investigations?.length) set('lab_investigations',
      soap.lab_investigations.map(l => ({ test: l.test, remarks: l.remarks || '' })));
    if (soap.examination_findings) set('examination_findings', soap.examination_findings);
    if (soap.advices)              set('advices', soap.advices);
    if (soap.refer_to)             set('refer_to', soap.refer_to);
    if (soap.next_visit_date)      set('next_visit_date', soap.next_visit_date);

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

    onClose();
  }, [soap, set, setVital, onClose]);

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Mic size={16} className={styles.headerIcon} />
          <span>Medical Scribe</span>
          {status === 'recording' && (
            <span className={styles.timer}>{fmt(elapsed)}</span>
          )}
        </div>
        <button className={styles.closeBtn} onClick={() => { stopRecording(); onClose(); }}>
          <X size={16} />
        </button>
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        {status !== 'recording' ? (
          <button
            className={styles.btnRecord}
            onClick={startRecording}
            disabled={status === 'extracting'}
          >
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

      {/* Recording indicator */}
      {status === 'recording' && (
        <div className={styles.recordingBar}>
          <span className={styles.recDot} />
          <span>Recording — transcribing every {SEGMENT_MS / 1000}s</span>
        </div>
      )}

      {/* Error */}
      {errMsg && (
        <div className={styles.error}>
          <AlertCircle size={13} /> {errMsg}
        </div>
      )}

      {/* Live transcript */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Live Transcript</div>
        <div className={styles.transcriptBox} ref={txAreaRef}>
          {transcript || <span className={styles.placeholder}>Transcript will appear here as you speak…</span>}
        </div>
      </div>

      {/* Cleaned transcript (after LLM grammar fix + abbreviation expansion) */}
      {cleaned && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Cleaned Transcript</div>
          <div className={styles.transcriptBox}>
            {cleaned}
          </div>
        </div>
      )}

      {/* SOAP Notes */}
      {soap && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Extracted SOAP</div>
          <div className={styles.soapBox}>
            {soap.chief_complaint && <SoapRow label="Chief Complaint" value={soap.chief_complaint} />}
            {soap.symptoms?.length > 0 && (
              <SoapRow label="Symptoms" value={soap.symptoms.map(s => `${s.name}${s.severity ? ` (${s.severity})` : ''}${s.since ? `, since ${s.since}` : ''}`).join(' · ')} />
            )}
            {soap.diagnosis?.length > 0 && (
              <SoapRow label="Diagnosis" value={soap.diagnosis.map(d => d.display).join(' · ')} />
            )}
            {soap.medications?.length > 0 && (
              <SoapRow label="Medications" value={soap.medications.map(m => `${m.name}${m.dose ? ` ${m.dose}` : ''}${m.frequency ? `, ${m.frequency}` : ''}${m.duration ? ` × ${m.duration}` : ''}`).join(' · ')} />
            )}
            {soap.lab_investigations?.length > 0 && (
              <SoapRow label="Labs" value={soap.lab_investigations.map(l => l.test).join(', ')} />
            )}
            {soap.examination_findings && <SoapRow label="Examination" value={soap.examination_findings} />}
            {soap.advices && <SoapRow label="Advice" value={soap.advices} />}
            {soap.refer_to && <SoapRow label="Referral" value={soap.refer_to} />}
            {soap.next_visit_date && <SoapRow label="Follow-up" value={soap.next_visit_date} />}
            {soap.vitals && Object.values(soap.vitals).some(Boolean) && (
              <SoapRow label="Vitals" value={
                Object.entries(soap.vitals)
                  .filter(([, v]) => v)
                  .map(([k, v]) => `${k.replace(/_/g,' ')}: ${v}`)
                  .join(', ')
              } />
            )}
          </div>

          <button className={styles.btnApply} onClick={applyToInferPad}>
            <CheckCheck size={14} /> Apply to InferPad
          </button>
        </div>
      )}
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
