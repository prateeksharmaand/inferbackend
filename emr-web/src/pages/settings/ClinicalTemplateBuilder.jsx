/**
 * Settings → Clinical Templates (Clinical Template Builder).
 *
 * Clinic admins: choose which speciality templates the clinic offers (and the default), customise
 * any template for the clinic, create / duplicate / edit / publish the clinic's own templates, and
 * import the clinic's current InferPad settings. Doctors: "My preferences" for their consultations.
 *
 * Until a clinic offers at least one template, InferPad keeps working exactly as before
 * (settings stored in each browser).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Search, Upload, History, Archive, Sliders, X, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { ctApi } from '../../api/clinicalTemplates';
import TemplateEditor from '../../components/clinicalTemplates/TemplateEditor';
import { getSectionOrder, getDisabledSections, getPrintSections, getMandatoryFields } from './InferPadSettings';
import { getVitalsPrefs } from '../../components/InferPad';
import s from './ClinicalTemplateBuilder.module.css';

const errText = e => {
  const list = e?.data?.errors;
  if (Array.isArray(list) && list.length) return `${e.message}: ${list.slice(0, 3).map(x => x.message).join('; ')}`;
  return e?.message || 'Something went wrong';
};

/** Build a definition from a template + this browser's InferPad settings (one-time import). */
function definitionFromBrowserSettings(base, clinicId) {
  const d = JSON.parse(JSON.stringify(base));
  const order = getSectionOrder(clinicId);
  const disabled = new Set(getDisabledSections(clinicId));
  const print = new Set(getPrintSections(clinicId));
  const mandatory = new Set(getMandatoryFields(clinicId));
  const vitals = getVitalsPrefs(clinicId);
  d.sections.forEach(sec => {
    const i = order.indexOf(sec.key);
    sec.order = i === -1 ? 1000 + sec.order : i;
    if (sec.builtin) {
      sec.enabled = !disabled.has(sec.key);
      sec.print_enabled = print.has(sec.key) || !print.size;
      sec.required = mandatory.has(sec.key);
    }
    if (sec.key === 'vitals') {
      sec.fields.forEach(f => {
        if (f.storage !== 'core') return;
        const vi = vitals.indexOf(f.key);
        f.enabled = vi !== -1;
        f.order = vi === -1 ? 1000 + f.order : vi;
      });
    }
  });
  if (mandatory.has('vitals')) d.sections.find(x => x.key === 'vitals').required = true;
  return d;
}

export default function ClinicalTemplateBuilder() {
  const { user } = useAuth();
  const [tab, setTab] = useState('templates');
  const [data, setData] = useState(null);            // { templates, adopted, can_manage }
  const [config, setConfig] = useState(null);        // { selections, my_template_id }
  const [catalog, setCatalog] = useState(null);
  const [editor, setEditor] = useState(null);        // { mode, template, definition, ignored, draft }
  const [q, setQ] = useState('');
  const [spec, setSpec] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);

  const load = useCallback(async () => {
    const [list, cfg, cat] = await Promise.all([ctApi.list(), ctApi.config(), catalog ? Promise.resolve(catalog) : ctApi.catalog()]);
    setData(list); setConfig(cfg); setCatalog(cat);
  }, [catalog]);
  useEffect(() => { load().catch(e => toast.error(errText(e))); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const canManage = !!data?.can_manage;
  const selected = useMemo(() => new Map((config?.selections || []).map(x => [x.template_id, x])), [config]);
  const templates = (data?.templates || []).filter(t =>
    (!q || t.name.toLowerCase().includes(q.toLowerCase())) && (!spec || t.specialty_key === spec));
  const system = templates.filter(t => t.clinic_id === null);
  const mine = templates.filter(t => t.clinic_id !== null);

  const saveSelections = async next => {
    setBusy(true);
    try {
      const out = await ctApi.saveSelections(next);
      setConfig(c => ({ ...c, selections: out.selections, adopted: out.selections.length > 0 }));
      setData(d => ({ ...d, adopted: out.selections.length > 0 }));
      window.dispatchEvent(new Event('clinical-templates:changed'));
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const toggleOffered = (t, on) => {
    const list = [...selected.values()].filter(x => x.template_id !== t.id);
    if (on) list.push({ template_id: t.id, is_default: list.length === 0 });
    if (list.length && !list.some(x => x.is_default)) list[0].is_default = true;
    if (!on && !list.length && !window.confirm('With no templates offered, InferPad goes back to each browser’s own settings. Continue?')) return;
    saveSelections(list);
  };
  const makeDefault = t => saveSelections([...selected.values()].map(x => ({ template_id: x.template_id, is_default: x.template_id === t.id })));

  const openCustomise = async t => {
    setBusy(true);
    try {
      const c = await ctApi.clinicConfig(t.id);
      setEditor({ mode: 'clinic', template: t, definition: c.definition, ignored: c.ignored });
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const openEdit = async t => {
    setBusy(true);
    try {
      const full = await ctApi.get(t.id);
      setEditor({ mode: 'template', template: t, definition: (full.draft || full.published).definition, hasDraft: !!full.draft, versionNo: full.published.version_no });
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const duplicate = async t => {
    const name = window.prompt('Name for the copy', `${t.name} (${user?.clinic_name || 'clinic'})`);
    if (!name) return;
    try { await ctApi.duplicate(t.id, name); toast.success('Template copied — your clinic can now edit it freely'); await load(); }
    catch (e) { toast.error(errText(e)); }
  };
  const createNew = async () => {
    const name = window.prompt('Name of the new template (for example "Diabetes follow-up")');
    if (!name) return;
    const specialty = window.prompt(`Start from which speciality? (${(catalog?.specialties || []).map(x => x.key).join(', ')})`, 'general');
    if (!specialty) return;
    try { const t = await ctApi.create({ name, specialty_key: specialty.trim().toLowerCase() }); toast.success('Template created'); await load(); openEdit(t); }
    catch (e) { toast.error(errText(e)); }
  };
  const archive = async t => {
    if (!window.confirm(`Archive “${t.name}”? Doctors stop seeing it; saved consultations keep their data.`)) return;
    try { await ctApi.archive(t.id); await load(); } catch (e) { toast.error(errText(e)); }
  };
  const showHistory = async t => {
    try { const [versions, audit] = await Promise.all([ctApi.versions(t.id), ctApi.audit(t.id)]); setHistory({ t, versions, audit }); }
    catch (e) { toast.error(errText(e)); }
  };

  const importBrowserSettings = async () => {
    const general = (data?.templates || []).find(t => t.clinic_id === null && t.specialty_key === 'general');
    if (!general) return toast.error('General template not found');
    if (!window.confirm('Turn on clinical templates using the InferPad settings saved in this browser (section order, hidden, mandatory and printed sections, vitals)? Every computer in the clinic will then use them.')) return;
    setBusy(true);
    try {
      const base = await ctApi.clinicConfig(general.id);
      await ctApi.saveClinicConfig(general.id, definitionFromBrowserSettings(base.base, user?.clinic_id || 'default'));
      await ctApi.saveSelections([...[...selected.values()].filter(x => x.template_id !== general.id).map(x => ({ ...x, is_default: false })), { template_id: general.id, is_default: true }]);
      toast.success('Clinical templates are on — General template uses your current InferPad settings');
      await load();
      window.dispatchEvent(new Event('clinical-templates:changed'));
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };

  // ── Editor view ──
  if (editor) {
    const t = editor.template;
    const onSave = async (def, done) => {
      setBusy(true);
      try {
        if (editor.mode === 'clinic') {
          const out = await ctApi.saveClinicConfig(t.id, def);
          toast.success(out.ignored?.length ? `Saved — ${out.ignored.length} change(s) not allowed were skipped` : 'Saved for your clinic');
          setEditor(e => ({ ...e, ignored: out.ignored, definition: out.definition }));
        } else if (editor.mode === 'doctor') {
          const out = await ctApi.saveDoctorConfig('me', { template_id: t.id, definition: def });
          toast.success(out.ignored?.length ? `Saved — ${out.ignored.length} change(s) not allowed were skipped` : 'Your preferences are saved');
          setEditor(e => ({ ...e, ignored: out.ignored }));
        } else {
          await ctApi.saveDraft(t.id, def);
          toast.success('Draft saved. Publish to use it in consultations.');
          setEditor(e => ({ ...e, hasDraft: true }));
        }
        done();
        window.dispatchEvent(new Event('clinical-templates:changed'));
      } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
    };
    const publish = async () => {
      const notes = window.prompt('What changed in this version? (optional)', '');
      if (notes === null) return;
      setBusy(true);
      try { const v = await ctApi.publish(t.id, notes); toast.success(`Published version ${v.versionNo}`); setEditor(e => ({ ...e, hasDraft: false, versionNo: v.versionNo })); await load(); }
      catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
    };
    return (
      <div className={s.page}>
        <div className={s.editorHead}>
          <button type="button" className={s.btnGhost} onClick={() => { setEditor(null); load(); }}><X size={14} /> Close</button>
          <div>
            <h3 className={s.title}>{t.name}</h3>
            <p className={s.sub}>
              {editor.mode === 'clinic' && 'Clinic customisation — applies to every doctor in your clinic.'}
              {editor.mode === 'doctor' && 'My preferences — only your consultations.'}
              {editor.mode === 'template' && `Template editor — published version ${editor.versionNo || 1}${editor.hasDraft ? ', unpublished draft in progress' : ''}.`}
            </p>
          </div>
        </div>
        <TemplateEditor
          key={`${editor.mode}-${t.id}`}
          definition={editor.definition} mode={editor.mode} catalog={catalog} ignored={editor.ignored || []}
          saving={busy} onSave={onSave} saveLabel={editor.mode === 'template' ? 'Save draft' : 'Save'}
          extraActions={editor.mode === 'template' && (
            <button type="button" className={s.btnPrimaryAlt} disabled={busy || !editor.hasDraft} onClick={publish} title={editor.hasDraft ? 'Publish the draft' : 'Save a draft first'}>
              <Upload size={14} /> Publish
            </button>
          )}
        />
      </div>
    );
  }

  const myPrefs = async templateId => {
    setBusy(true);
    try {
      const c = await ctApi.doctorConfig('me', templateId);
      if (!c.adopted) { toast('Your clinic has not turned on clinical templates yet'); return; }
      setEditor({ mode: 'doctor', template: c.template, definition: c.definition, ignored: c.ignored });
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const setMyTemplate = async id => {
    try { await ctApi.saveDoctorConfig('me', { template_id: id || null }); setConfig(c => ({ ...c, my_template_id: id || null })); toast.success('Your consultation template is updated'); }
    catch (e) { toast.error(errText(e)); }
  };

  if (!data || !config) return <div className={s.page}><p className={s.sub}>Loading clinical templates…</p></div>;
  const offered = (data.templates || []).filter(t => selected.has(t.id));

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div>
          <h3 className={s.title}>Clinical Templates</h3>
          <p className={s.sub}>Choose the sections and fields doctors see in each consultation, per speciality. Changes apply without an app update.</p>
        </div>
        <div className={s.tabs} role="tablist">
          <button role="tab" aria-selected={tab === 'templates'} className={tab === 'templates' ? s.tabOn : s.tab} onClick={() => setTab('templates')}>Templates</button>
          <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? s.tabOn : s.tab} onClick={() => setTab('mine')}>My preferences</button>
        </div>
      </div>

      {!data.adopted && (
        <div className={s.banner}>
          <strong>Clinical templates are off for your clinic.</strong> InferPad uses the settings saved in each browser.
          {canManage
            ? <> Tick “Offered” on the templates your doctors should use, or start from your current setup:
                <button type="button" className={s.btnPrimaryAlt} disabled={busy} onClick={importBrowserSettings}><Upload size={14} /> Use my current InferPad settings</button></>
            : ' Ask your clinic admin to turn them on.'}
        </div>
      )}

      {tab === 'templates' && (
        <>
          <div className={s.filters}>
            <label className={s.searchBox}><Search size={14} aria-hidden="true" />
              <input placeholder="Search templates" value={q} onChange={e => setQ(e.target.value)} aria-label="Search templates" /></label>
            <select value={spec} onChange={e => setSpec(e.target.value)} aria-label="Filter by speciality" className={s.select}>
              <option value="">All specialities</option>
              {(catalog?.specialties || []).map(x => <option key={x.key} value={x.key}>{x.name}</option>)}
            </select>
            {canManage && <button type="button" className={s.btnGhost} onClick={createNew}><Plus size={14} /> New template</button>}
          </div>

          {[['Your clinic’s templates', mine], ['Infer speciality templates', system]].map(([heading, list]) => list.length > 0 && (
            <section key={heading} className={s.group}>
              <h4 className={s.groupTitle}>{heading}</h4>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>Template</th><th>Version</th>{canManage && <th>Offered</th>}{canManage && <th>Default</th>}<th>Actions</th></tr></thead>
                  <tbody>
                    {list.map(t => {
                      const sel = selected.get(t.id);
                      return (
                        <tr key={t.id}>
                          <td>
                            <div className={s.tplName}>{t.name}</div>
                            <div className={s.tplMeta}>{t.specialty_key}{t.clinic_override_count > 0 ? ` · customised (${t.clinic_override_count})` : ''}</div>
                          </td>
                          <td>v{t.published_version_no || '—'}{t.draft_version_no ? <span className={s.draftBadge}>draft</span> : null}</td>
                          {canManage && <td><input type="checkbox" checked={!!sel} disabled={busy} onChange={e => toggleOffered(t, e.target.checked)} aria-label={`Offer ${t.name}`} /></td>}
                          {canManage && <td>{sel && (sel.is_default
                            ? <span className={s.defaultBadge}><Star size={11} /> Default</span>
                            : <button type="button" className={s.linkBtn} disabled={busy} onClick={() => makeDefault(t)}>Make default</button>)}</td>}
                          <td className={s.actions}>
                            {canManage && <button type="button" className={s.btnGhost} onClick={() => openCustomise(t)} disabled={busy}><Sliders size={13} /> Customise</button>}
                            {canManage && t.clinic_id !== null && <button type="button" className={s.btnGhost} onClick={() => openEdit(t)} disabled={busy}><Pencil size={13} /> Edit</button>}
                            {canManage && <button type="button" className={s.iconBtn} onClick={() => duplicate(t)} aria-label={`Duplicate ${t.name}`} title="Duplicate"><Copy size={14} /></button>}
                            <button type="button" className={s.iconBtn} onClick={() => showHistory(t)} aria-label={`History of ${t.name}`} title="History"><History size={14} /></button>
                            {canManage && t.clinic_id !== null && <button type="button" className={s.iconBtn} onClick={() => archive(t)} aria-label={`Archive ${t.name}`} title="Archive"><Archive size={14} /></button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {!templates.length && <p className={s.sub}>No templates match.</p>}
        </>
      )}

      {tab === 'mine' && (
        <section className={s.group}>
          {!data.adopted ? <p className={s.sub}>Available once your clinic turns on clinical templates.</p> : (
            <>
              <label className={s.field}>
                <span>Template for my consultations</span>
                <select className={s.select} value={config.my_template_id || ''} onChange={e => setMyTemplate(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Clinic default</option>
                  {offered.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <p className={s.sub}>Personalise which sections you see, their order, default advice and notes, and add your own fields. Anything your clinic made required stays required.</p>
              <button type="button" className={s.btnPrimaryAlt} disabled={busy} onClick={() => myPrefs(config.my_template_id)}><Sliders size={14} /> Edit my preferences</button>
            </>
          )}
        </section>
      )}

      {history && (
        <div className={s.overlay} role="dialog" aria-modal="true" aria-labelledby="hist-title" onMouseDown={e => e.target === e.currentTarget && setHistory(null)}>
          <div className={s.dialog}>
            <div className={s.dialogHead}><h3 id="hist-title">{history.t.name} — history</h3>
              <button type="button" className={s.iconBtn} onClick={() => setHistory(null)} aria-label="Close"><X size={16} /></button></div>
            <h4 className={s.groupTitle}>Versions</h4>
            <ul className={s.list}>{history.versions.map(v => (
              <li key={v.id}>v{v.version_no} · {v.status}{v.published_at ? ` · ${new Date(v.published_at).toLocaleDateString('en-IN')}` : ''}{v.notes ? ` — ${v.notes}` : ''}</li>))}</ul>
            <h4 className={s.groupTitle}>Changes</h4>
            <ul className={s.list}>{history.audit.length ? history.audit.map(a => (
              <li key={a.id}>{new Date(a.created_at).toLocaleString('en-IN')} · {a.action.replace(/_/g, ' ')}{a.staff_name ? ` · ${a.staff_name}` : ''}</li>)) : <li>No changes recorded yet.</li>}</ul>
          </div>
        </div>
      )}
    </div>
  );
}
