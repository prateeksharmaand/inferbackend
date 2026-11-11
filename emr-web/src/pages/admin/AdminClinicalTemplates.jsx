/**
 * Super Admin → Clinical Templates: the system speciality templates every clinic inherits.
 * Edit a draft, publish a new version (existing consultations keep their snapshot), or create a
 * new speciality template.
 */
import { useEffect, useState } from 'react';
import { Pencil, Plus, Upload, X, History } from 'lucide-react';
import { ctAdminApi } from '../../api/clinicalTemplates';
import TemplateEditor from '../../components/clinicalTemplates/TemplateEditor';
import s from '../settings/ClinicalTemplateBuilder.module.css';

const errText = e => (e?.data?.errors?.length ? `${e.message}: ${e.data.errors.slice(0, 3).map(x => x.message).join('; ')}` : e?.message || 'Something went wrong');

export default function AdminClinicalTemplates() {
  const [list, setList] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState(null);

  const load = async () => {
    const [l, c] = await Promise.all([ctAdminApi.list(), catalog ? Promise.resolve(catalog) : ctAdminApi.catalog()]);
    setList(l.templates); setCatalog(c);
  };
  useEffect(() => { load().catch(e => setMsg(errText(e))); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openEdit = async t => {
    setBusy(true); setMsg('');
    try {
      const full = await ctAdminApi.get(t.id);
      setEditor({ t, definition: (full.draft || full.published).definition, hasDraft: !!full.draft, versionNo: full.published.version_no });
    } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };
  const create = async () => {
    const name = window.prompt('Name of the new speciality template (e.g. "Rheumatology")');
    if (!name) return;
    const key = window.prompt('Speciality key (lower-case, e.g. rheumatology)', name.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
    if (!key) return;
    const from = window.prompt(`Start from which existing template? (${list.map(x => x.specialty_key).join(', ')})`, 'general');
    const src = list.find(x => x.specialty_key === from);
    try {
      const t = await ctAdminApi.create({ name, specialty_key: key, from_template_id: src?.id });
      await load(); openEdit(t);
    } catch (e) { setMsg(errText(e)); }
  };

  if (editor) {
    const { t } = editor;
    const save = async (def, done) => {
      setBusy(true); setMsg('');
      try { await ctAdminApi.saveDraft(t.id, def); setEditor(e => ({ ...e, hasDraft: true })); setMsg('Draft saved. Publish to roll it out to clinics.'); done(); }
      catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
    };
    const publish = async () => {
      const notes = window.prompt('What changed in this version?', '');
      if (notes === null) return;
      setBusy(true);
      try { const v = await ctAdminApi.publish(t.id, notes); setEditor(e => ({ ...e, hasDraft: false, versionNo: v.versionNo })); setMsg(`Published version ${v.versionNo}. New consultations use it; saved ones keep their snapshot.`); }
      catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
    };
    return (
      <div className={s.page} style={{ padding: 24 }}>
        <div className={s.editorHead}>
          <button type="button" className={s.btnGhost} onClick={() => { setEditor(null); load(); }}><X size={14} /> Close</button>
          <div>
            <h3 className={s.title}>{t.name} <span className={s.tplMeta}>(system · {t.specialty_key})</span></h3>
            <p className={s.sub}>Published version {editor.versionNo}{editor.hasDraft ? ' · unpublished draft in progress' : ''}. Clinic customisations are kept across versions.</p>
          </div>
        </div>
        {msg && <p className={s.banner} role="status">{msg}</p>}
        <TemplateEditor key={t.id} definition={editor.definition} mode="template" catalog={catalog} saving={busy} onSave={save} saveLabel="Save draft"
          extraActions={<button type="button" className={s.btnPrimaryAlt} disabled={busy || !editor.hasDraft} onClick={publish}><Upload size={14} /> Publish</button>} />
      </div>
    );
  }

  return (
    <div className={s.page} style={{ padding: 24 }}>
      <div className={s.head}>
        <div>
          <h3 className={s.title}>Clinical Templates</h3>
          <p className={s.sub}>System speciality templates. Clinics customise on top of these; publishing a new version never changes saved consultations.</p>
        </div>
        <button type="button" className={s.btnPrimaryAlt} onClick={create}><Plus size={14} /> New speciality template</button>
      </div>
      {msg && <p className={s.banner} role="status">{msg}</p>}
      {!list ? <p className={s.sub}>Loading…</p> : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>Template</th><th>Speciality key</th><th>Version</th><th>Actions</th></tr></thead>
            <tbody>
              {list.map(t => (
                <tr key={t.id}>
                  <td className={s.tplName}>{t.name}</td>
                  <td>{t.specialty_key}</td>
                  <td>v{t.published_version_no}{t.draft_version_no ? <span className={s.draftBadge}>draft</span> : null}</td>
                  <td className={s.actions}>
                    <button type="button" className={s.btnGhost} disabled={busy} onClick={() => openEdit(t)}><Pencil size={13} /> Edit</button>
                    <button type="button" className={s.iconBtn} aria-label={`History of ${t.name}`} title="History"
                      onClick={async () => { try { setHistory({ t, versions: await ctAdminApi.versions(t.id), audit: await ctAdminApi.audit(t.id) }); } catch (e) { setMsg(errText(e)); } }}>
                      <History size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {history && (
        <div className={s.overlay} role="dialog" aria-modal="true" aria-labelledby="ahist" onMouseDown={e => e.target === e.currentTarget && setHistory(null)}>
          <div className={s.dialog}>
            <div className={s.dialogHead}><h3 id="ahist">{history.t.name} — history</h3>
              <button type="button" className={s.iconBtn} onClick={() => setHistory(null)} aria-label="Close"><X size={16} /></button></div>
            <ul className={s.list}>{history.versions.map(v => <li key={v.id}>v{v.version_no} · {v.status}{v.notes ? ` — ${v.notes}` : ''}</li>)}</ul>
            <ul className={s.list}>{history.audit.map(a => <li key={a.id}>{new Date(a.created_at).toLocaleString('en-IN')} · {a.action.replace(/_/g, ' ')}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}
