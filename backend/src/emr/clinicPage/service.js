/**
 * Clinic public pages: https://inferapp.online/c/<slug>
 *
 * The page is a static HTML file written into the public website's folder (CLINIC_PAGES_DIR,
 * mounted into the API container), so it is fast, works without JavaScript and is indexable.
 * The inferapp.online web server already serves "<path>.html" for "/c/<slug>".
 *
 * Pages are (re)generated when a clinic is created, when its page settings are saved, at startup
 * and every 10 minutes (so new doctors / services appear without anyone pressing a button).
 * A file is only rewritten when its content changed. Unpublished clinics have no file.
 */
const fs = require('fs');
const path = require('path');
const { renderClinicPage } = require('./render');

const PAGES_DIR = process.env.CLINIC_PAGES_DIR || '/srv/clinic-pages';
const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://inferapp.online').replace(/\/+$/, '');
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

const pageUrl = slug => `${SITE_URL}/c/${slug}`;

function slugify(name) {
  return String(name || 'clinic').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'clinic';
}

/** Give the clinic a unique slug if it has none. */
async function ensureSlug(db, clinic) {
  if (clinic.slug) return clinic.slug;
  const base = slugify(clinic.name);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 55)}-${i + 1}`;
    const { rowCount } = await db.query(
      `UPDATE emr_clinics SET slug = $2 WHERE id = $1 AND slug IS NULL
         AND NOT EXISTS (SELECT 1 FROM emr_clinics WHERE slug = $2)`, [clinic.id, candidate]);
    if (rowCount) return candidate;
    const { rows: [c] } = await db.query(`SELECT slug FROM emr_clinics WHERE id = $1`, [clinic.id]);
    if (c?.slug) return c.slug;
  }
  throw new Error('Could not allocate a page address');
}

async function loadPageData(db, clinicId) {
  const { rows: [clinic] } = await db.query(
    `SELECT id, name, address, phone, email, slug, status, public_page, public_published FROM emr_clinics WHERE id = $1`, [clinicId]);
  if (!clinic) return null;
  const { rows: doctors } = await db.query(
    `SELECT name, designation AS specialization, department AS qualification
       FROM emr_clinic_staff WHERE clinic_id = $1 AND role = 'doctor' AND is_active = true ORDER BY id`, [clinicId]);
  const { rows: services } = await db.query(
    `SELECT name, price FROM emr_services WHERE clinic_id = $1 AND is_active = true ORDER BY id LIMIT 60`, [clinicId]);
  return { clinic, profile: clinic.public_page || {}, doctors, services };
}

function render(data) {
  return renderClinicPage({ ...data, pageUrl: pageUrl(data.clinic.slug), siteUrl: SITE_URL });
}

function canWrite() {
  try { fs.accessSync(PAGES_DIR, fs.constants.W_OK); return true; } catch { return false; }
}

function writeFileIfChanged(file, html) {
  try { if (fs.readFileSync(file, 'utf8') === html) return false; } catch { /* new file */ }
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, html, { mode: 0o644 });
  fs.renameSync(tmp, file);
  return true;
}

function removePage(slug) {
  if (!slug || !SLUG_RE.test(slug)) return;
  try { fs.unlinkSync(path.join(PAGES_DIR, `${slug}.html`)); } catch { /* already gone */ }
}

/** Generate (or remove) one clinic's page. Returns { slug, url, published, written }. */
async function publishClinicPage(db, clinicId, { logger } = {}) {
  const data = await loadPageData(db, clinicId);
  if (!data) return null;
  data.clinic.slug = await ensureSlug(db, data.clinic);
  const live = data.clinic.public_published && data.clinic.status !== 'suspended';
  const out = { slug: data.clinic.slug, url: pageUrl(data.clinic.slug), published: live, written: false };
  if (!canWrite()) { logger?.warn?.(`Clinic pages: ${PAGES_DIR} is not writable; page for clinic ${clinicId} not written`); return out; }
  if (!live) { removePage(data.clinic.slug); return out; }
  out.written = writeFileIfChanged(path.join(PAGES_DIR, `${data.clinic.slug}.html`), render(data));
  return out;
}

async function publishAll(pool, logger) {
  try {
    const { rows } = await pool.query(`SELECT id FROM emr_clinics ORDER BY id`);
    let written = 0;
    for (const { id } of rows) {
      try { if ((await publishClinicPage(pool, id, { logger }))?.written) written += 1; }
      catch (e) { logger.error(`Clinic page failed for clinic ${id}`, { error: e.message }); }
    }
    if (written) logger.info(`Clinic pages: updated ${written} page(s)`);
  } catch (e) {
    logger.error('Clinic pages: refresh failed', { error: e.message });
  }
}

/** Startup + every 10 minutes. */
function startClinicPages(pool, logger) {
  publishAll(pool, logger);
  const t = setInterval(() => publishAll(pool, logger), 10 * 60 * 1000);
  t.unref?.();
}

// ── Validation of what a clinic may put on its page ─────────────────────────
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const str = (v, max) => String(v ?? '').trim().slice(0, max);

function cleanProfile(p = {}) {
  const errors = [];
  const out = {
    tagline: str(p.tagline, 160),
    about: str(p.about, 3000),
    city: str(p.city, 60),
    specialties: (Array.isArray(p.specialties) ? p.specialties : String(p.specialties || '').split(','))
      .map(s => str(s, 40)).filter(Boolean).slice(0, 12),
    whatsapp: str(p.whatsapp, 20).replace(/[^\d+]/g, ''),
    map_link: str(p.map_link, 500),
    google_review_link: str(p.google_review_link, 500),
    show_doctors: p.show_doctors !== false,
    show_services: p.show_services !== false,
    show_prices: !!p.show_prices,
    logo: p.logo ? String(p.logo) : '',
    timings: {},
  };
  for (const k of ['map_link', 'google_review_link']) {
    if (out[k] && !/^https:\/\/\S+$/i.test(out[k])) errors.push(`${k === 'map_link' ? 'Map link' : 'Google review link'} must start with https://`);
  }
  if (out.whatsapp && out.whatsapp.replace(/\D/g, '').length < 10) errors.push('WhatsApp number must have at least 10 digits');
  if (out.logo) {
    if (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(out.logo)) errors.push('Logo must be a PNG, JPG or WebP image');
    else if (out.logo.length > 400000) errors.push('Logo is too large (keep it under 300 KB)');
  }
  for (const d of DAY_KEYS) {
    const day = p.timings?.[d] || {};
    const slots = (Array.isArray(day.slots) ? day.slots : []).slice(0, 3)
      .map(s => ({ open: str(s?.open, 5), close: str(s?.close, 5) }))
      .filter(s => s.open || s.close);
    for (const s of slots) {
      if (!TIME_RE.test(s.open) || !TIME_RE.test(s.close)) errors.push(`${d}: times must be HH:MM`);
      else if (s.open >= s.close) errors.push(`${d}: closing time must be after opening time`);
    }
    out.timings[d] = { closed: !!day.closed, slots };
  }
  return { profile: out, errors };
}

module.exports = {
  slugify, ensureSlug, loadPageData, render, publishClinicPage, publishAll, startClinicPages,
  removePage, cleanProfile, pageUrl, SLUG_RE, PAGES_DIR,
};
