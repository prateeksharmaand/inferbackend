import { useState, useRef, useCallback } from 'react';
import {
  X, Upload, Download, FileSpreadsheet, Check, AlertCircle,
  CheckCircle2, UploadCloud, RefreshCw, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import s from './BulkUploadModal.module.css';

const STEP = { UPLOAD: 'upload', PREVIEW: 'preview', DONE: 'done' };

function TemplateCard() {
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/emr/services/bulk-template', {
        headers: { Authorization: `Bearer ${localStorage.getItem('emr_token')}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'services_template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className={s.templateCard}>
      <div className={s.templateLeft}>
        <FileSpreadsheet size={22} className={s.templateIcon} />
        <div>
          <div className={s.templateTitle}>Don't have the correct format?</div>
          <div className={s.templateSub}>Download our sample template and fill in your service data before uploading.</div>
        </div>
      </div>
      <button className={s.templateBtn} onClick={download} disabled={downloading}>
        <Download size={13} /> {downloading ? 'Downloading…' : 'Download Template'}
      </button>
    </div>
  );
}

function DropZone({ onFile }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const handle = (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) { toast.error('Only .xlsx or .xls files are supported'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('File must be under 10 MB'); return; }
    onFile(file);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDrag(false);
    handle(e.dataTransfer.files[0]);
  }, []);
  const onDragOver  = (e) => { e.preventDefault(); setDrag(true); };
  const onDragLeave = () => setDrag(false);

  return (
    <div
      className={`${s.dropZone} ${drag ? s.dropZoneDrag : ''}`}
      onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => handle(e.target.files[0])} />
      <UploadCloud size={36} className={s.dropIcon} />
      <div className={s.dropTitle}>Drag & drop your Excel file here</div>
      <div className={s.dropSub}>or <span className={s.dropBrowse}>browse file</span></div>
      <div className={s.dropHint}>.xlsx / .xls · max 10 MB</div>
    </div>
  );
}

function PreviewTable({ preview }) {
  const validRows   = preview.filter(r => r.ok);
  const invalidRows = preview.filter(r => !r.ok);
  return (
    <div className={s.preview}>
      <div className={s.previewStats}>
        <span className={s.statOk}><CheckCircle2 size={14} /> {validRows.length} ready to import</span>
        {invalidRows.length > 0 && <span className={s.statErr}><AlertCircle size={14} /> {invalidRows.length} with errors</span>}
      </div>
      <div className={s.previewTable}>
        <div className={s.previewHead}>
          <span>Row</span><span>Service Name</span><span>Price</span><span>Status</span><span>Result</span>
        </div>
        <div className={s.previewBody}>
          {preview.map((r, i) => (
            <div key={i} className={`${s.previewRow} ${r.ok ? s.previewRowOk : s.previewRowErr}`}>
              <span className={s.previewCell}>{r.row}</span>
              <span className={s.previewCell}>{r.name || '—'}</span>
              <span className={s.previewCell}>{r.ok ? `₹${Number(r.price).toLocaleString('en-IN')}` : '—'}</span>
              <span className={s.previewCell}>{r.status || '—'}</span>
              <span className={s.previewCell}>
                {r.ok
                  ? <span className={s.okBadge}><Check size={11} /> Valid</span>
                  : <span className={s.errBadge} title={r.error}><AlertCircle size={11} /> {r.error}</span>
                }
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DoneScreen({ result, onViewServices, onUploadMore }) {
  const hasErrors = result.failed > 0;
  const downloadErrors = () => {
    const rows = [['Row', 'Error']];
    result.errors.forEach(e => rows.push([e.row, e.message]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'bulk_upload_errors.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className={s.done}>
      <div className={s.doneIcon}><CheckCircle2 size={40} /></div>
      <h3 className={s.doneTitle}>Services Imported Successfully</h3>
      <p className={s.doneSub}>{result.imported} service{result.imported !== 1 ? 's' : ''} added successfully.</p>
      {hasErrors && (
        <div className={s.doneErrorBox}>
          <AlertCircle size={15} />
          <span>{result.failed} row{result.failed !== 1 ? 's' : ''} failed — </span>
          <button className={s.doneErrLink} onClick={downloadErrors}>Download Error Report</button>
        </div>
      )}
      <div className={s.doneBtns}>
        <button className={s.btnSecondary} onClick={onUploadMore}><RefreshCw size={13} /> Upload More</button>
        <button className={s.btnPrimary} onClick={onViewServices}><Eye size={13} /> View Services</button>
      </div>
    </div>
  );
}

export default function BulkUploadModal({ onClose, onImported }) {
  const [step,       setStep]       = useState(STEP.UPLOAD);
  const [file,       setFile]       = useState(null);
  const [preview,    setPreview]    = useState([]);
  const [uploading,  setUploading]  = useState(false);
  const [importing,  setImporting]  = useState(false);
  const [result,     setResult]     = useState(null);

  const handleFile = async (f) => {
    setFile(f);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/emr/services/bulk-upload?preview=1', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('emr_token')}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setPreview(data.preview || []);
      setStep(STEP.PREVIEW);
    } catch (err) {
      toast.error(err.message);
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/emr/services/bulk-upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('emr_token')}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setResult(data);
      setStep(STEP.DONE);
      onImported?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => { setStep(STEP.UPLOAD); setFile(null); setPreview([]); setResult(null); };

  const validCount = preview.filter(r => r.ok).length;

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>

        {/* Header */}
        <div className={s.header}>
          <div className={s.headerLeft}>
            <FileSpreadsheet size={18} className={s.headerIcon} />
            <div>
              <div className={s.headerTitle}>Bulk Upload Services</div>
              <div className={s.headerSub}>Upload an Excel file to create multiple services at once.</div>
            </div>
          </div>
          <button className={s.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        {/* Step indicators */}
        <div className={s.steps}>
          {[['1', 'Upload'], ['2', 'Preview'], ['3', 'Done']].map(([n, label], i) => {
            const stepKeys = [STEP.UPLOAD, STEP.PREVIEW, STEP.DONE];
            const active   = step === stepKeys[i];
            const done     = stepKeys.indexOf(step) > i;
            return (
              <div key={n} className={`${s.step} ${active ? s.stepActive : ''} ${done ? s.stepDone : ''}`}>
                <div className={s.stepDot}>{done ? <Check size={10} strokeWidth={3} /> : n}</div>
                <span className={s.stepLabel}>{label}</span>
                {i < 2 && <div className={s.stepLine} />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className={s.body}>
          {step === STEP.UPLOAD && (
            <>
              <TemplateCard />
              {uploading
                ? <div className={s.uploading}><div className={s.spinner} /><span>Reading file…</span></div>
                : <DropZone onFile={handleFile} />
              }
            </>
          )}

          {step === STEP.PREVIEW && (
            <PreviewTable preview={preview} />
          )}

          {step === STEP.DONE && result && (
            <DoneScreen
              result={result}
              onViewServices={onClose}
              onUploadMore={reset}
            />
          )}
        </div>

        {/* Footer */}
        {step !== STEP.DONE && (
          <div className={s.footer}>
            {step === STEP.UPLOAD && (
              <button className={s.btnCancel} onClick={onClose}>Cancel</button>
            )}
            {step === STEP.PREVIEW && (
              <>
                <button className={s.btnCancel} onClick={reset}>← Change File</button>
                <div className={s.footerRight}>
                  <span className={s.footerHint}>{validCount} service{validCount !== 1 ? 's' : ''} will be imported</span>
                  <button className={s.btnPrimary} onClick={handleImport} disabled={importing || validCount === 0}>
                    {importing ? <><div className={s.spinnerSm} /> Importing…</> : <><Check size={13} /> Import {validCount} Services</>}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
