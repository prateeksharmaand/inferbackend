import { useState, useEffect, useRef } from 'react';
import { Upload, Download, Trash2, Plus, Loader, FolderOpen } from 'lucide-react';
import styles from './MedicalRecordsTab.module.css';

function getToken() { return localStorage.getItem('emr_token'); }

function formatSize(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function TypeBadge({ mime }) {
  if (mime?.startsWith('image/')) return <span className={`${styles.badge} ${styles.badgeImg}`}>IMG</span>;
  if (mime === 'application/pdf')  return <span className={`${styles.badge} ${styles.badgePdf}`}>PDF</span>;
  return <span className={`${styles.badge} ${styles.badgeDoc}`}>DOC</span>;
}

function DocRow({ doc, onDelete }) {
  return (
    <div className={styles.row}>
      <TypeBadge mime={doc.mime_type} />
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
          className={`${styles.actBtn} ${styles.actDel}`}
          onClick={() => onDelete(doc.id)}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function MedicalRecordsTab({ apptId }) {
  const [docs,       setDocs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [dragOver,   setDragOver]   = useState(false);
  const [error,      setError]      = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!apptId || apptId === 'new') { setLoading(false); return; }
    fetch(`/api/emr/appointments/${apptId}/documents`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(rows => { setDocs(rows); setLoading(false); })
      .catch(() => setLoading(false));
  }, [apptId]);

  const uploadFile = async (file) => {
    setError(''); setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`/api/emr/appointments/${apptId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setDocs(prev => [data, ...prev]);
      setShowUpload(false);
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
    if (!window.confirm('Delete this record?')) return;
    await fetch(`/api/emr/appointments/${apptId}/documents/${docId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setDocs(prev => prev.filter(d => d.id !== docId));
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <h3 className={styles.title}>Medical Records</h3>
        <button className={styles.addBtn} onClick={() => setShowUpload(v => !v)}>
          <Plus size={14} strokeWidth={2.5} />
          Add Medical Record
        </button>
      </div>

      {showUpload && (
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
      )}

      {error && <p className={styles.error}>{error}</p>}

      {loading && <p className={styles.hint}>Loading records…</p>}

      {!loading && docs.length === 0 && !showUpload && (
        <div className={styles.empty}>
          <FolderOpen size={40} strokeWidth={1} className={styles.emptyIcon} />
          <p className={styles.emptyText}>No medical records yet for this appointment.</p>
          <button className={styles.addBtnEmpty} onClick={() => setShowUpload(true)}>
            <Plus size={13} strokeWidth={2.5} /> Upload First Record
          </button>
        </div>
      )}

      {!loading && docs.length > 0 && (
        <div className={styles.list}>
          <div className={styles.listHeader}>
            <span>{docs.length} record{docs.length !== 1 ? 's' : ''}</span>
          </div>
          {docs.map(doc => (
            <DocRow key={doc.id} doc={doc} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
