import { useState, useEffect, useRef } from 'react';
import { X, Upload, Download, Trash2, Loader } from 'lucide-react';
import styles from './MedicalDocumentsModal.module.css';

function getToken() { return localStorage.getItem('emr_token'); }

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function DocIcon({ mime }) {
  if (mime?.startsWith('image/')) return <span className={styles.typeImg}>IMG</span>;
  if (mime === 'application/pdf') return <span className={styles.typePdf}>PDF</span>;
  return <span className={styles.typeDoc}>DOC</span>;
}

export default function MedicalDocumentsModal({ appt, onClose }) {
  const [docs,      setDocs]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver,  setDragOver]  = useState(false);
  const [error,     setError]     = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    fetch(`/api/emr/appointments/${appt.id}/documents`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(rows => { setDocs(rows); setLoading(false); })
      .catch(() => setLoading(false));
  }, [appt.id]);

  const uploadFile = async (file) => {
    setError(''); setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`/api/emr/appointments/${appt.id}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setDocs(prev => [data, ...prev]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    await fetch(`/api/emr/appointments/${appt.id}/documents/${docId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setDocs(prev => prev.filter(d => d.id !== docId));
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Medical Documents</div>
            <div className={styles.sub}>{appt.patient_name}</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={styles.body}>
          {/* Drop zone */}
          <div
            className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''} ${uploading ? styles.dropZoneBusy : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && inputRef.current?.click()}
          >
            {uploading
              ? <><Loader size={20} className={styles.spin} /><span>Uploading…</span></>
              : (
                <>
                  <Upload size={22} className={styles.uploadIcon} />
                  <span className={styles.dropLabel}>Drop file or <u>click to browse</u></span>
                  <span className={styles.dropHint}>PDF, JPG, PNG, DOCX · max 20 MB</span>
                </>
              )
            }
            <input
              ref={inputRef} type="file"
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx"
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0]); e.target.value = ''; }}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          {/* List */}
          {loading && <p className={styles.empty}>Loading…</p>}
          {!loading && docs.length === 0 && (
            <p className={styles.empty}>No documents uploaded yet.</p>
          )}
          {!loading && docs.length > 0 && (
            <div className={styles.list}>
              {docs.map(doc => (
                <div key={doc.id} className={styles.row}>
                  <DocIcon mime={doc.mime_type} />
                  <div className={styles.info}>
                    <span className={styles.name}>{doc.original_name}</span>
                    <span className={styles.meta}>{formatSize(doc.file_size)} · {formatDate(doc.created_at)}</span>
                  </div>
                  <div className={styles.acts}>
                    <a
                      href={`/uploads/${doc.file_path}`}
                      target="_blank" rel="noreferrer"
                      className={styles.actBtn}
                      title="Open / Download"
                    >
                      <Download size={14} />
                    </a>
                    <button
                      className={`${styles.actBtn} ${styles.actBtnDel}`}
                      onClick={() => handleDelete(doc.id)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
