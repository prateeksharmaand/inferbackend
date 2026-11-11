/**
 * /api/emr/clinic-page — the clinic's public page settings (Settings → Clinic Website).
 *   GET    /clinic-page          settings + public URL (any staff)
 *   PUT    /clinic-page          save details and publish (clinic admin)
 *   POST   /clinic-page/preview  render unsaved settings as HTML (clinic admin)
 */
const express = require('express');
const { pool } = require('../../config/database');
const svc = require('./service');

const router = express.Router();

async function canManage(req) {
  if (req.emrUser.role === 'admin') return true;
  const { rows: [r] } = await pool.query(`SELECT permissions FROM staff_roles WHERE clinic_id = $1 AND slug = $2`, [req.emrUser.clinic_id, req.emrUser.role]);
  const { rows: [s] } = await pool.query(`SELECT permissions FROM emr_clinic_staff WHERE id = $1`, [req.emrUser.id]);
  const p = { ...(r?.permissions || {}), ...(s?.permissions || {}) };
  return !!(p.all || p['settings.clinic']);
}

const str = (v, max) => (v === undefined ? undefined : String(v ?? '').trim().slice(0, max));

router.get('/clinic-page', async (req, res) => {
  const cid = req.emrUser.clinic_id;
  const { rows: [c] } = await pool.query(`SELECT id, name, slug FROM emr_clinics WHERE id = $1`, [cid]);
  if (!c.slug) c.slug = await svc.ensureSlug(pool, c);
  const data = await svc.loadPageData(pool, cid);
  res.json({
    slug: c.slug, url: svc.pageUrl(c.slug), published: data.clinic.public_published,
    suspended: data.clinic.status === 'suspended',
    clinic: { name: data.clinic.name, address: data.clinic.address || '', phone: data.clinic.phone || '', email: data.clinic.email || '' },
    profile: data.profile, doctors: data.doctors, services_count: data.services.length,
    can_manage: await canManage(req),
  });
});

router.put('/clinic-page', async (req, res) => {
  if (!(await canManage(req))) return res.status(403).json({ error: 'Only clinic admins can change the clinic website' });
  const cid = req.emrUser.clinic_id;
  const body = req.body || {};
  const { profile, errors } = svc.cleanProfile(body.profile || {});
  const slug = body.slug === undefined ? undefined : String(body.slug).trim().toLowerCase();
  if (slug !== undefined && !svc.SLUG_RE.test(slug)) errors.push('Web address may use lower-case letters, numbers and hyphens (2–60 characters)');
  const email = str(body.clinic?.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email address is not valid');
  if (errors.length) return res.status(422).json({ error: errors[0], errors });

  const { rows: [before] } = await pool.query(`SELECT slug FROM emr_clinics WHERE id = $1`, [cid]);
  try {
    await pool.query(
      `UPDATE emr_clinics SET public_page = $2,
              public_published = COALESCE($3, public_published),
              slug = COALESCE($4, slug),
              address = COALESCE($5, address), phone = COALESCE($6, phone), email = COALESCE($7, email)
        WHERE id = $1`,
      [cid, JSON.stringify(profile), typeof body.published === 'boolean' ? body.published : null, slug || null,
        str(body.clinic?.address, 500) ?? null, str(body.clinic?.phone, 30) ?? null, email ?? null]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That web address is already taken — try another' });
    throw e;
  }
  if (slug && before?.slug && slug !== before.slug) svc.removePage(before.slug);   // old address stops working
  const out = await svc.publishClinicPage(pool, cid);
  res.json({ ...out, saved: true });
});

router.post('/clinic-page/preview', async (req, res) => {
  if (!(await canManage(req))) return res.status(403).json({ error: 'Not allowed' });
  const data = await svc.loadPageData(pool, req.emrUser.clinic_id);
  const { profile } = svc.cleanProfile(req.body?.profile || {});
  const c = req.body?.clinic || {};
  data.clinic = { ...data.clinic, address: c.address ?? data.clinic.address, phone: c.phone ?? data.clinic.phone, email: c.email ?? data.clinic.email,
    slug: data.clinic.slug || svc.slugify(data.clinic.name) };
  res.json({ html: svc.render({ ...data, profile }) });
});

module.exports = router;
