/**
 * Settings → Clinic Website: the clinic's public one-page site at https://inferapp.online/c/<slug>.
 * It is created automatically for every clinic; here the clinic shares it (link, WhatsApp, QR)
 * and, as admin, edits what it shows, previews and publishes it.
 */
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, ExternalLink, Eye, Globe, MessageCircle, Download, Upload, Trash2, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/client';
import s from './ClinicWebsiteSettings.module.css';

const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const emptyDay = () => ({ closed: false, slots: [{ open: '09:00', close: '13:00' }, { open: '17:00', close: '20:00' }] });

/** Resize an uploaded logo to max 256px so the page stays light. */
function resizeImage(file, max = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function ClinicWebsiteSettings() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);       // { slug, published, clinic:{}, profile:{} }
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [dirty, setDirty] = useState(false);
  const qrRef = useRef(null);

  const load = () => api.get('/clinic-page').then(d => {
    setData(d);
    const p = d.profile || {};
    const timings = {};
    DAYS.forEach(([k]) => { timings[k] = p.timings?.[k] ? { closed: !!p.timings[k].closed, slots: p.timings[k].slots?.length ? p.timings[k].slots : [] } : emptyDay(); });
    setForm({
      slug: d.slug, published: d.published, clinic: { ...d.clinic },
      profile: {
        tagline: p.tagline || '', about: p.about || '', city: p.city || '', whatsapp: p.whatsapp || '',
        specialties: (p.specialties || []).join(', '), map_link: p.map_link || '', google_review_link: p.google_review_link || '',
        show_doctors: p.show_doctors !== false, show_services: p.show_services !== false, show_prices: !!p.show_prices,
        logo: p.logo || '', timings,
      },
    });
    setDirty(false);
  }).catch(e => toast.error(e.message));
  useEffect(() => { load(); }, []);

  if (!data || !form) return <div className={s.page}><p className={s.muted}>Loading clinic website…</p></div>;
  const canEdit = data.can_manage;
  const url = data.url;
  const setP = (k, v) => { setForm(f => ({ ...f, profile: { ...f.profile, [k]: v } })); setDirty(true); };
  const setC = (k, v) => { setForm(f => ({ ...f, clinic: { ...f.clinic, [k]: v } })); setDirty(true); };
  const setDay = (k, day) => setP('timings', { ...form.profile.timings, [k]: day });

  const payload = () => ({
    slug: form.slug, published: form.published, clinic: form.clinic,
    profile: { ...form.profile, specialties: form.profile.specialties.split(',').map(x => x.trim()).filter(Boolean) },
  });
  const save = async () => {
    setSaving(true);
    try {
      const out = await api.put('/clinic-page', payload());
      toast.success(out.published ? 'Saved — your clinic website is updated' : 'Saved — the website is unpublished');
      window.dispatchEvent(new Event('clinic-branding:changed'));   // sidebar shows the new logo / name
      await load();
    } catch (e) { toast.error(e.data?.errors?.join(' · ') || e.message); }
    finally { setSaving(false); }
  };
  const showPreview = async () => {
    try { const r = await api.post('/clinic-page/preview', payload()); setPreview(r.html); }
    catch (e) { toast.error(e.message); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch { window.prompt('Copy this link', url); } };
  const shareWa = () => window.open(`https://wa.me/?text=${encodeURIComponent(`Visit ${data.clinic.name}: ${url}`)}`, '_blank', 'noopener');
  const downloadQr = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${form.slug}-qr.svg`; a.click();
  };
  const onLogo = async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return toast.error('Choose a PNG, JPG or WebP image');
    try { setP('logo', await resizeImage(f)); } catch { toast.error('Could not read that image'); }
  };
  const copyMondayToAll = () => {
    const mon = form.profile.timings.mon;
    const t = {}; DAYS.forEach(([k]) => { t[k] = k === 'sun' ? form.profile.timings.sun : JSON.parse(JSON.stringify(mon)); });
    setP('timings', t);
  };
  const live = data.published && !data.suspended;
  const dis = !canEdit;

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div>
          <h3 className={s.title}><Globe size={18} /> Clinic Website</h3>
          <p className={s.muted}>A one-page website for {data.clinic.name}, created automatically. Share it with patients and on Google, Instagram or WhatsApp.</p>
        </div>
        <span className={live ? s.badgeOn : s.badgeOff}>{data.suspended ? 'Offline (clinic suspended)' : live ? 'Live' : 'Unpublished'}</span>
      </div>

      <section className={s.shareCard}>
        <div className={s.shareMain}>
          <span className={s.label}>Your website</span>
          <a className={s.url} href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https:\/\//, '')}</a>
          <div className={s.actions}>
            <button type="button" className={s.btn} onClick={copy}><Copy size={14} /> Copy link</button>
            <a className={s.btn} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open</a>
            <button type="button" className={s.btn} onClick={shareWa}><MessageCircle size={14} /> Share on WhatsApp</button>
          </div>
          {!live && <p className={s.warn}>The link shows the Infer home page until the website is published.</p>}
        </div>
        <div className={s.qr} ref={qrRef}>
          <QRCodeSVG value={url} size={112} level="M" />
          <button type="button" className={s.linkBtn} onClick={downloadQr}><Download size={12} /> Download QR</button>
        </div>
      </section>

      {!canEdit && <p className={s.muted}>Only your clinic admin can change what the website shows.</p>}

      <fieldset className={s.card} disabled={dis}>
        <legend>Publishing</legend>
        <label className={s.toggle}><input type="checkbox" checked={form.published} onChange={e => { setForm(f => ({ ...f, published: e.target.checked })); setDirty(true); }} /> Website is published</label>
        <label className={s.field}><span>Web address</span>
          <div className={s.prefixed}><span>inferapp.online/c/</span>
            <input value={form.slug} onChange={e => { setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })); setDirty(true); }} aria-label="Web address" />
          </div>
          <small className={s.muted}>Changing it breaks links you already shared.</small>
        </label>
      </fieldset>

      <fieldset className={s.card} disabled={dis}>
        <legend>Clinic details</legend>
        <div className={s.grid}>
          <label className={`${s.field} ${s.span2}`}><span>Address</span><input value={form.clinic.address} onChange={e => setC('address', e.target.value)} placeholder="Street, area, city, PIN" /></label>
          <label className={s.field}><span>City</span><input value={form.profile.city} onChange={e => setP('city', e.target.value)} placeholder="e.g. Gorakhpur" /></label>
          <label className={s.field}><span>Phone</span><input value={form.clinic.phone} onChange={e => setC('phone', e.target.value)} inputMode="tel" /></label>
          <label className={s.field}><span>WhatsApp for bookings</span><input value={form.profile.whatsapp} onChange={e => setP('whatsapp', e.target.value)} inputMode="tel" placeholder="Same as phone if empty" /></label>
          <label className={s.field}><span>Email</span><input type="email" value={form.clinic.email} onChange={e => setC('email', e.target.value)} /></label>
          <label className={`${s.field} ${s.span2}`}><span>Google Maps link (optional)</span><input value={form.profile.map_link} onChange={e => setP('map_link', e.target.value)} placeholder="https://maps.app.goo.gl/…" /></label>
          <label className={`${s.field} ${s.span2}`}><span>Google review link (optional)</span><input value={form.profile.google_review_link} onChange={e => setP('google_review_link', e.target.value)} placeholder="https://g.page/r/…/review" /></label>
        </div>
      </fieldset>

      <fieldset className={s.card} disabled={dis}>
        <legend>About the clinic</legend>
        <div className={s.grid}>
          <label className={`${s.field} ${s.span2}`}><span>Tagline</span><input value={form.profile.tagline} maxLength={160} onChange={e => setP('tagline', e.target.value)} placeholder="e.g. Family medicine and diabetes care in Gorakhpur" /></label>
          <label className={`${s.field} ${s.span2}`}><span>Specialities (comma separated)</span><input value={form.profile.specialties} onChange={e => setP('specialties', e.target.value)} placeholder="General Medicine, Diabetes, Hypertension" /></label>
          <label className={`${s.field} ${s.span2}`}><span>About</span><textarea rows={5} maxLength={3000} value={form.profile.about} onChange={e => setP('about', e.target.value)} placeholder="Who you are, your experience, facilities, languages spoken…" /></label>
          <div className={`${s.field} ${s.span2}`}>
            <span>Logo</span>
            <div className={s.logoRow}>
              <div className={s.logoBox}>{form.profile.logo ? <img src={form.profile.logo} alt="Clinic logo" /> : <span>{(data.clinic.name || 'C')[0]}</span>}</div>
              <label className={s.btn}><Upload size={14} /> Upload<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onLogo} /></label>
              {form.profile.logo && <button type="button" className={s.btn} onClick={() => setP('logo', '')}><Trash2 size={14} /> Remove</button>}
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className={s.card} disabled={dis}>
        <legend>Timings</legend>
        <div className={s.days}>
          {DAYS.map(([k, label]) => {
            const day = form.profile.timings[k];
            return (
              <div key={k} className={s.dayRow}>
                <span className={s.dayName}>{label}</span>
                <label className={s.toggle}><input type="checkbox" checked={!day.closed} onChange={e => setDay(k, { ...day, closed: !e.target.checked })} /> Open</label>
                {!day.closed && [0, 1].map(i => (
                  <span key={i} className={s.slot}>
                    <input type="time" aria-label={`${label} session ${i + 1} opens`} value={day.slots[i]?.open || ''}
                      onChange={e => { const sl = [...day.slots]; sl[i] = { ...(sl[i] || {}), open: e.target.value }; setDay(k, { ...day, slots: sl }); }} />
                    –
                    <input type="time" aria-label={`${label} session ${i + 1} closes`} value={day.slots[i]?.close || ''}
                      onChange={e => { const sl = [...day.slots]; sl[i] = { ...(sl[i] || {}), close: e.target.value }; setDay(k, { ...day, slots: sl }); }} />
                  </span>
                ))}
              </div>
            );
          })}
        </div>
        <p className={s.muted}>Leave the second session empty if the clinic has one sitting. <button type="button" className={s.linkBtn} onClick={copyMondayToAll}>Copy Monday to Mon–Sat</button></p>
      </fieldset>

      <fieldset className={s.card} disabled={dis}>
        <legend>What to show</legend>
        <label className={s.toggle}><input type="checkbox" checked={form.profile.show_doctors} onChange={e => setP('show_doctors', e.target.checked)} /> Doctors ({data.doctors.length}, from Staff &amp; Access)</label>
        <label className={s.toggle}><input type="checkbox" checked={form.profile.show_services} onChange={e => setP('show_services', e.target.checked)} /> Services ({data.services_count}, from Settings → Services)</label>
        <label className={s.toggle}><input type="checkbox" checked={form.profile.show_prices} disabled={!form.profile.show_services} onChange={e => setP('show_prices', e.target.checked)} /> Show service prices</label>
      </fieldset>

      {canEdit && (
        <div className={s.footer}>
          <button type="button" className={s.btn} onClick={showPreview}><Eye size={14} /> Preview</button>
          <button type="button" className={s.btnPrimary} onClick={save} disabled={saving || !dirty}><Check size={14} /> {saving ? 'Saving…' : 'Save & publish'}</button>
        </div>
      )}

      {preview && (
        <div className={s.overlay} role="dialog" aria-modal="true" aria-label="Website preview" onMouseDown={e => e.target === e.currentTarget && setPreview(null)}>
          <div className={s.previewBox}>
            <div className={s.previewHead}><span>Preview — not saved yet</span><button type="button" className={s.iconBtn} onClick={() => setPreview(null)} aria-label="Close preview"><X size={16} /></button></div>
            <iframe title="Clinic website preview" srcDoc={preview} sandbox="allow-scripts" className={s.frame} />
          </div>
        </div>
      )}
    </div>
  );
}
