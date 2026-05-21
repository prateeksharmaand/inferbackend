import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Download, Trash2, Plus, Loader, FolderOpen,
         Search, X, Tag, StickyNote, FileText, Eye } from 'lucide-react';
import styles from './MedicalRecordsTab.module.css';

const PREDEFINED_TAGS = [
  'Lab Report', 'Blood Report', 'X-Ray', 'MRI', 'CT Scan',
  'ECG', 'USG', 'Prescription', 'Discharge Summary', 'OPD Report', 'Other',
];

function getToken() { return localStorage.getItem('emr_token'); }

function formatSize(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function TypeBadge({ mime }) {
  if (mime?.startsWith('image/')) return <span className={`${styles.badge} ${styles.badgeImg}`}>IMG</span>;
  if (mime === 'application/pdf')  return <span className={`${styles.badge} ${styles.badgePdf}`}>PDF</span>;
  return <span className={`${styles.badge} ${styles.badgeDoc}`}>DOC</span>;
}

// ── Inline tag editor ─────────────────────────────────────────────────────────
function TagEditor({ tags, onChange, disabled }) {
  const [open, setOpen]   = useState(false);
  const [input, setInput] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const addTag = (t) => {
    const v = t.trim();
    if (!v || tags.includes(v)) { setInput(''); return; }
    onChange([...tags, v]);
    setInput('');
  };
  const removeTag = (t) => onChange(tags.filter(x => x !== t));
  const suggestions = PREDEFINED_TAGS.filter(
    t => !tags.includes(t) && (!input || t.toLowerCase().includes(input.toLowerCase()))
  );

  return (
    <div className={styles.tagLine} ref={ref}>
      {tags.map(t => (
        <span key={t} className={styles.tagChip}>
          {t}
          {!disabled && (
            <button
              className={styles.tagChipX}
              onClick={e => { e.stopPropagation(); removeTag(t); }}
            >×</button>
          )}
        </span>
      ))}
      {!disabled && (
        open ? (
          <div className={styles.tagPicker} onClick={e => e.stopPropagation()}>
            <input
              autoFocus
              className={styles.tagPickerInput}
              placeholder="Type or pick…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.preventDefault(); addTag(input); }
                if (e.key === 'Escape') setOpen(false);
              }}
            />
            {suggestions.length > 0 && (
              <div className={styles.tagPickerSuggs}>
                {suggestions.map(t => (
                  <button key={t} className={styles.tagSugg} onClick={() => addTag(t)}>{t}</button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button className={styles.tagAddBtn} onClick={e => { e.stopPropagation(); setOpen(true); }}>
            <Tag size={10} strokeWidth={2.5} /> Tag
          </button>
        )
      )}
    </div>
  );
}

// ── Document viewer modal ─────────────────────────────────────────────────────
function DocViewerModal({ doc, onClose }) {
  const isImage = doc.mime_type?.startsWith('image/');
  const isPdf   = doc.mime_type === 'application/pdf';
  const url     = `/uploads/${doc.file_path}`;

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className={styles.viewerOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.viewerModal}>
        <div className={styles.viewerToolbar}>
          <span className={styles.viewerTitle}>{doc.original_name}</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <a href={url} target="_blank" rel="noreferrer" download className={styles.viewerDlBtn}>
              <Download size={13} strokeWidth={2} /> Download
            </a>
            <button className={styles.viewerClose} onClick={onClose}><X size={15} /></button>
          </div>
        </div>
        <div className={styles.viewerBody}>
          {isImage && <img src={url} alt={doc.original_name} className={styles.viewerImg} />}
          {isPdf   && <iframe src={url} title={doc.original_name} className={styles.viewerIframe} />}
          {!isImage && !isPdf && (
            <div className={styles.viewerFallback}>
              <FileText size={52} strokeWidth={1} className={styles.viewerFallbackIcon} />
              <p className={styles.viewerFallbackText}>Preview not available for this file type.</p>
              <a href={url} download className={styles.viewerDownloadBtn}>
                <Download size={14} /> Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Single document row ───────────────────────────────────────────────────────
function DocRow({ doc, onView, onDelete, onTagsChange, onNotesChange, readOnly }) {
  const [notesOpen,   setNotesOpen]   = useState(false);
  const [localNotes,  setLocalNotes]  = useState(doc.notes || '');
  const tags = doc.tags || [];

  const saveNotes = () => {
    if (localNotes === (doc.notes || '')) return;
    onNotesChange && onNotesChange(doc.id, localNotes);
  };

  return (
    <div className={styles.row}>
      {/* Clickable main area */}
      <div className={styles.rowMain} onClick={() => onView && onView(doc)}>
        <TypeBadge mime={doc.mime_type} />
        <div className={styles.info}>
          <span className={styles.name}>{doc.original_name}</span>
          <div className={styles.rowMeta}>
            <span className={styles.meta}>{formatSize(doc.file_size)} · {formatDate(doc.created_at)}</span>
            {doc.appointment_date && (
              <span className={styles.visitDate}>Visit {formatDate(doc.appointment_date)}</span>
            )}
          </div>
          <TagEditor
            tags={tags}
            onChange={newTags => onTagsChange && onTagsChange(doc.id, newTags)}
            disabled={readOnly}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className={styles.acts}>
        <button
          className={`${styles.actBtn} ${notesOpen ? styles.actBtnActive : ''} ${doc.notes ? styles.actBtnHasNote : ''}`}
          title={doc.notes ? 'View / edit notes' : 'Add notes'}
          onClick={e => { e.stopPropagation(); setNotesOpen(v => !v); }}
        >
          <StickyNote size={14} />
        </button>
        <button
          className={styles.actBtn}
          title="View"
          onClick={e => { e.stopPropagation(); onView && onView(doc); }}
        >
          <Eye size={14} />
        </button>
        <a
          href={`/uploads/${doc.file_path}`}
          target="_blank" rel="noreferrer"
          className={styles.actBtn}
          title="Download"
          onClick={e => e.stopPropagation()}
        >
          <Download size={14} />
        </a>
        {!readOnly && (
          <button
            className={`${styles.actBtn} ${styles.actDel}`}
            title="Delete"
            onClick={e => { e.stopPropagation(); onDelete && onDelete(doc.id); }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Inline notes panel */}
      {notesOpen && (
        <div className={styles.notesPanel}>
          <textarea
            className={styles.notesInput}
            rows={3}
            placeholder={readOnly ? 'No notes.' : 'Add doctor notes for this record…'}
            value={localNotes}
            readOnly={readOnly}
            onChange={e => !readOnly && setLocalNotes(e.target.value)}
            onBlur={saveNotes}
          />
          {!readOnly && (
            <button
              className={styles.notesSave}
              onClick={() => { saveNotes(); setNotesOpen(false); }}
            >Save</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MedicalRecordsTab({ apptId, patientMobile }) {
  const [docs,        setDocs]        = useState([]);
  const [historyDocs, setHistoryDocs] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [uploading,   setUploading]   = useState(false);
  const [showUpload,  setShowUpload]  = useState(false);
  const [dragOver,    setDragOver]    = useState(false);
  const [error,       setError]       = useState('');
  const [search,      setSearch]      = useState('');
  const [activeTag,   setActiveTag]   = useState('');
  const [uploadTags,  setUploadTags]  = useState([]);
  const [viewDoc,     setViewDoc]     = useState(null);
  const inputRef = useRef(null);

  const load = useCallback(() => {
    if (!apptId || apptId === 'new') { setLoading(false); return; }
    const headers = { Authorization: `Bearer ${getToken()}` };
    Promise.all([
      fetch(`/api/emr/appointments/${apptId}/documents`, { headers }).then(r => r.json()),
      patientMobile
        ? fetch(`/api/emr/appointments/${apptId}/patient-documents`, { headers }).then(r => r.json())
        : Promise.resolve([]),
    ])
      .then(([cur, hist]) => {
        setDocs(Array.isArray(cur)  ? cur  : []);
        setHistoryDocs(Array.isArray(hist) ? hist : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apptId, patientMobile]);

  useEffect(() => { load(); }, [load]);

  const uploadFile = async (file) => {
    setError(''); setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tags', JSON.stringify(uploadTags));
    try {
      const res = await fetch(`/api/emr/appointments/${apptId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setDocs(prev => [data, ...prev]);
      setShowUpload(false);
      setUploadTags([]);
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

  const patchDoc = async (docId, body) => {
    await fetch(`/api/emr/appointments/${apptId}/documents/${docId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  const handleTagsChange = (docId, newTags) => {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, tags: newTags } : d));
    patchDoc(docId, { tags: newTags });
  };

  const handleNotesChange = (docId, notes) => {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, notes } : d));
    patchDoc(docId, { notes });
  };

  // Collect unique tags across all records for filter bar
  const allTags = [...new Set([...docs, ...historyDocs].flatMap(d => d.tags || []))];

  const filterList = (list) => list.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || d.original_name.toLowerCase().includes(q)
      || (d.tags || []).some(t => t.toLowerCase().includes(q))
      || (d.notes || '').toLowerCase().includes(q);
    const matchTag = !activeTag || (d.tags || []).includes(activeTag);
    return matchSearch && matchTag;
  });

  const filteredDocs    = filterList(docs);
  const filteredHistory = filterList(historyDocs);
  const hasAnyDocs      = docs.length > 0 || historyDocs.length > 0;

  return (
    <div className={styles.wrap}>
      {/* ── Header ── */}
      <div className={styles.topbar}>
        <h3 className={styles.title}>Medical Records</h3>
        {apptId !== 'new' && (
          <button className={styles.addBtn} onClick={() => setShowUpload(v => !v)}>
            <Plus size={14} strokeWidth={2.5} />
            Add Record
          </button>
        )}
      </div>

      {/* ── Search ── */}
      {hasAnyDocs && (
        <div className={styles.searchRow}>
          <Search size={14} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Search by name, tag, or notes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.searchClear} onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* ── Tag filter bar ── */}
      {allTags.length > 0 && (
        <div className={styles.tagFilters}>
          <button
            className={`${styles.tagFilter} ${!activeTag ? styles.tagFilterActive : ''}`}
            onClick={() => setActiveTag('')}
          >All</button>
          {allTags.map(t => (
            <button
              key={t}
              className={`${styles.tagFilter} ${activeTag === t ? styles.tagFilterActive : ''}`}
              onClick={() => setActiveTag(v => v === t ? '' : t)}
            >{t}</button>
          ))}
        </div>
      )}

      {/* ── Upload zone ── */}
      {showUpload && (
        <div className={styles.uploadSection}>
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
          {/* Tag picker for upload */}
          <div className={styles.uploadTagRow}>
            <span className={styles.uploadTagLabel}><Tag size={12} /> Tags for this record:</span>
            <div className={styles.uploadTagPills}>
              {PREDEFINED_TAGS.map(t => (
                <button
                  key={t}
                  className={`${styles.uploadTagPill} ${uploadTags.includes(t) ? styles.uploadTagPillOn : ''}`}
                  onClick={() => setUploadTags(prev =>
                    prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
                  )}
                >{t}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
      {loading && <p className={styles.hint}>Loading…</p>}

      {/* ── Empty state ── */}
      {!loading && !hasAnyDocs && !showUpload && (
        <div className={styles.empty}>
          <FolderOpen size={40} strokeWidth={1} className={styles.emptyIcon} />
          <p className={styles.emptyText}>No medical records yet for this appointment.</p>
          <button className={styles.addBtnEmpty} onClick={() => setShowUpload(true)}>
            <Plus size={13} strokeWidth={2.5} /> Upload First Record
          </button>
        </div>
      )}

      {/* ── This Visit ── */}
      {!loading && filteredDocs.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>This Visit</span>
            <span className={styles.sectionCount}>{filteredDocs.length}</span>
          </div>
          {filteredDocs.map(doc => (
            <DocRow
              key={doc.id}
              doc={doc}
              onView={setViewDoc}
              onDelete={handleDelete}
              onTagsChange={handleTagsChange}
              onNotesChange={handleNotesChange}
            />
          ))}
        </div>
      )}

      {/* ── Previous Visits ── */}
      {!loading && filteredHistory.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>Previous Visits</span>
            <span className={styles.sectionCount}>{filteredHistory.length}</span>
          </div>
          {filteredHistory.map(doc => (
            <DocRow
              key={`h-${doc.id}`}
              doc={doc}
              onView={setViewDoc}
              readOnly
            />
          ))}
        </div>
      )}

      {/* ── No results ── */}
      {!loading && hasAnyDocs && filteredDocs.length === 0 && filteredHistory.length === 0 && (
        <p className={styles.hint}>No records match your search or filter.</p>
      )}

      {/* ── Viewer modal ── */}
      {viewDoc && <DocViewerModal doc={viewDoc} onClose={() => setViewDoc(null)} />}
    </div>
  );
}
