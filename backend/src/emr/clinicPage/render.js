/**
 * Renders a clinic's public one-page website as a self-contained HTML document, in the visual
 * style of https://inferapp.online (Poppins, purple gradient, frosted navbar, rounded cards,
 * dark footer). Every value from the database is HTML-escaped.
 */
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const DAYS = [
  ['mon', 'Monday', 'Mo'], ['tue', 'Tuesday', 'Tu'], ['wed', 'Wednesday', 'We'], ['thu', 'Thursday', 'Th'],
  ['fri', 'Friday', 'Fr'], ['sat', 'Saturday', 'Sa'], ['sun', 'Sunday', 'Su'],
];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function fmtTime(t) {
  if (!TIME_RE.test(t || '')) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

/** Normalised opening hours: [{ key, label, closed, slots: [{open, close}] }] */
function hoursOf(timings) {
  return DAYS.map(([key, label]) => {
    const d = timings?.[key] || {};
    const slots = (Array.isArray(d.slots) ? d.slots : [{ open: d.open, close: d.close }])
      .filter(s => TIME_RE.test(s?.open || '') && TIME_RE.test(s?.close || ''));
    return { key, label, closed: !!d.closed || !slots.length, slots };
  });
}

const digits = v => String(v || '').replace(/\D/g, '');
function telHref(phone) { const d = digits(phone); return d.length >= 10 ? `tel:+${d.length === 10 ? '91' + d : d}` : null; }
function waHref(num, clinicName) {
  const d = digits(num);
  if (d.length < 10) return null;
  const text = `Hello ${clinicName}, I would like to book an appointment.`;
  return `https://wa.me/${d.length === 10 ? '91' + d : d}?text=${encodeURIComponent(text)}`;
}
function mapHref(profile, address) {
  if (/^https:\/\/\S+$/i.test(profile.map_link || '')) return profile.map_link;
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}
const safeHttps = u => (/^https:\/\/\S+$/i.test(String(u || '').trim()) ? String(u).trim() : null);
const safeImg = u => (/^data:image\/(png|jpe?g|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(u || '') ? u : safeHttps(u));

const ICON = {
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
};
const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

function renderClinicPage({ clinic, profile = {}, doctors = [], services = [], pageUrl, siteUrl = 'https://inferapp.online' }) {
  const name = clinic.name || 'Clinic';
  const address = (profile.address || clinic.address || '').trim();
  const phone = (profile.phone || clinic.phone || '').trim();
  const email = (profile.email || clinic.email || '').trim();
  const city = (profile.city || '').trim();
  const tagline = (profile.tagline || '').trim();
  const about = (profile.about || '').trim();
  const specialties = (Array.isArray(profile.specialties) ? profile.specialties : []).map(s => String(s).trim()).filter(Boolean).slice(0, 12);
  const tel = telHref(phone);
  const wa = waHref(profile.whatsapp || phone, name);
  const map = mapHref(profile, address);
  const review = safeHttps(profile.google_review_link);
  const logo = safeImg(profile.logo);
  const hours = hoursOf(profile.timings);
  const hasHours = hours.some(h => !h.closed);
  const showDoctors = profile.show_doctors !== false && doctors.length > 0;
  const showServices = profile.show_services !== false && services.length > 0;
  const showPrices = !!profile.show_prices;
  const description = tagline || about.slice(0, 155) || `${name}${city ? ` in ${city}` : ''} — clinic timings, doctors, services and contact details.`;
  const initial = esc(name.trim()[0]?.toUpperCase() || 'C');
  const primaryCta = wa
    ? `<a class="btn btn-primary" href="${esc(wa)}" target="_blank" rel="noopener">${icon('chat')} Book on WhatsApp</a>`
    : tel ? `<a class="btn btn-primary" href="${esc(tel)}">${icon('phone')} Call to book</a>` : '';

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'MedicalClinic', name, url: pageUrl,
    ...(description ? { description } : {}),
    ...(phone ? { telephone: phone } : {}), ...(email ? { email } : {}),
    ...(address ? { address: { '@type': 'PostalAddress', streetAddress: address, ...(city ? { addressLocality: city } : {}), addressCountry: 'IN' } } : {}),
    ...(specialties.length ? { medicalSpecialty: specialties } : {}),
    ...(hasHours ? { openingHoursSpecification: hours.filter(h => !h.closed).flatMap(h => h.slots.map(s => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.label, opens: s.open, closes: s.close }))) } : {}),
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(name)}${city ? ` — ${esc(city)}` : ''} | Timings, Doctors &amp; Contact</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(name)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta name="theme-color" content="#5A4BD1">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='16' fill='#7B6EF6'/><text x='32' y='43' font-family='Arial' font-size='32' font-weight='700' text-anchor='middle' fill='#fff'>${initial}</text></svg>`)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
<style>
  :root {
    --primary:#7B6EF6; --primary-dark:#5A4BD1; --primary-light:#EEEAFF; --secondary:#9C8FFA; --accent:#B8AEFB;
    --bg:#F5F4FF; --surface:#FFFFFF; --surface-var:#F8F7FF; --text-primary:#1C1B1F; --text-secondary:#49454F;
    --text-hint:#6E6A75; --border:#CAC4D0; --divider:#E7E0EC; --grad-start:#3A2ED4; --grad-mid:#6657E8; --grad-end:#9C8FFA;
    --shadow-sm:0 2px 8px rgba(123,110,246,0.08); --shadow-md:0 4px 20px rgba(123,110,246,0.12); --shadow-lg:0 8px 40px rgba(123,110,246,0.18);
    --radius-md:12px; --radius-lg:16px; --radius-xl:24px;
  }
  *,*::before,*::after { box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  body { margin:0; font-family:'Poppins',system-ui,sans-serif; background:var(--bg); color:var(--text-primary); line-height:1.6; -webkit-font-smoothing:antialiased; }
  a { color:inherit; text-decoration:none; }
  img { max-width:100%; display:block; }
  .container { max-width:1160px; margin:0 auto; padding:0 24px; }
  .btn { display:inline-flex; align-items:center; gap:8px; padding:13px 24px; border-radius:var(--radius-lg); font-family:inherit; font-size:15px; font-weight:600; cursor:pointer; border:none; transition:all .22s ease; min-height:46px; }
  .btn-primary { background:linear-gradient(135deg,var(--secondary),var(--primary)); color:#fff; box-shadow:0 6px 24px rgba(123,110,246,.35); }
  .btn-primary:hover { transform:translateY(-2px); box-shadow:0 10px 32px rgba(123,110,246,.45); }
  .btn-white { background:#fff; color:var(--primary-dark); box-shadow:0 6px 24px rgba(20,10,80,.18); }
  .btn-white:hover { transform:translateY(-2px); }
  .btn-glass { background:rgba(255,255,255,.14); color:#fff; border:1.5px solid rgba(255,255,255,.4); }
  .btn-glass:hover { background:rgba(255,255,255,.24); }
  .btn-outline { background:transparent; color:var(--primary-dark); border:1.5px solid var(--primary); }
  .btn-outline:hover { background:var(--primary-light); }
  .btn-sm { padding:9px 16px; font-size:13px; min-height:40px; border-radius:12px; }
  /* Navbar */
  .navbar { position:sticky; top:0; z-index:50; background:rgba(245,244,255,.88); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border-bottom:1px solid rgba(202,196,208,.4); }
  .navbar-inner { display:flex; align-items:center; gap:12px; height:68px; }
  .navbar-logo { display:flex; align-items:center; gap:10px; font-size:17px; font-weight:700; min-width:0; }
  .navbar-logo span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .logo-tile { width:38px; height:38px; flex-shrink:0; border-radius:11px; background:linear-gradient(135deg,var(--secondary),var(--primary)); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:800; font-size:17px; box-shadow:0 4px 12px rgba(123,110,246,.3); overflow:hidden; }
  .logo-tile img { width:100%; height:100%; object-fit:contain; background:#fff; }
  .nav-links { display:flex; gap:22px; margin-left:auto; font-size:14px; font-weight:500; color:var(--text-secondary); }
  .nav-links a:hover { color:var(--primary-dark); }
  .navbar-actions { display:flex; gap:8px; margin-left:16px; }
  /* Hero */
  .hero { background:linear-gradient(135deg,var(--grad-start) 0%,var(--grad-mid) 55%,var(--grad-end) 100%); color:#fff; position:relative; overflow:hidden; padding:72px 0 88px; }
  .hero::before,.hero::after { content:''; position:absolute; border-radius:50%; background:rgba(255,255,255,.07); pointer-events:none; }
  .hero::before { width:520px; height:520px; right:-160px; top:-200px; }
  .hero::after { width:340px; height:340px; left:-120px; bottom:-180px; }
  .hero-grid { position:relative; display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,1fr); gap:40px; align-items:center; }
  .eyebrow { display:inline-flex; align-items:center; gap:8px; font-size:13px; font-weight:600; letter-spacing:.3px; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.25); padding:6px 14px; border-radius:999px; }
  .hero h1 { font-size:clamp(32px,5vw,54px); line-height:1.12; letter-spacing:-1px; margin:18px 0 14px; font-weight:800; text-wrap:balance; }
  .hero p.lead { font-size:clamp(15px,1.8vw,18px); color:rgba(255,255,255,.88); margin:0 0 22px; max-width:560px; text-wrap:pretty; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:28px; }
  .chip { font-size:13px; font-weight:500; background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.28); padding:6px 14px; border-radius:999px; }
  .hero-actions { display:flex; flex-wrap:wrap; gap:12px; }
  .info-card { background:rgba(255,255,255,.98); color:var(--text-primary); border-radius:var(--radius-xl); padding:26px; box-shadow:var(--shadow-lg); }
  .info-row { display:flex; gap:14px; align-items:flex-start; padding:14px 0; border-bottom:1px solid var(--divider); }
  .info-row:last-child { border-bottom:none; padding-bottom:0; }
  .info-row:first-child { padding-top:0; }
  .info-ico { width:40px; height:40px; flex-shrink:0; border-radius:12px; background:var(--primary-light); color:var(--primary-dark); display:flex; align-items:center; justify-content:center; }
  .info-label { font-size:12px; font-weight:600; color:var(--text-hint); text-transform:uppercase; letter-spacing:.6px; }
  .info-value { font-size:15px; font-weight:500; word-break:break-word; }
  .info-value a:hover { color:var(--primary-dark); text-decoration:underline; }
  .open-badge { display:inline-block; font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; margin-left:6px; vertical-align:middle; }
  .open-badge.on { background:#DCFCE7; color:#166534; } .open-badge.off { background:#FEE2E2; color:#991B1B; }
  /* Sections */
  section.block { padding:72px 0; }
  section.block.alt { background:var(--surface); }
  .section-label { display:inline-block; font-size:12px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:var(--primary); background:var(--primary-light); padding:5px 12px; border-radius:999px; margin-bottom:12px; }
  .section-title { font-size:clamp(26px,3.6vw,38px); font-weight:700; line-height:1.25; letter-spacing:-.5px; margin:0 0 12px; }
  .section-sub { color:var(--text-secondary); margin:0 0 36px; max-width:640px; }
  .about-text { font-size:16px; color:var(--text-secondary); white-space:pre-line; max-width:820px; margin:0; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:18px; }
  .card { background:var(--surface); border-radius:var(--radius-xl); box-shadow:var(--shadow-sm); border:1px solid rgba(202,196,208,.35); padding:22px; transition:transform .2s, box-shadow .2s; }
  .card:hover { transform:translateY(-3px); box-shadow:var(--shadow-md); }
  section.block.alt .card { background:var(--surface-var); }
  .doc-head { display:flex; gap:14px; align-items:center; }
  .avatar { width:52px; height:52px; border-radius:16px; background:linear-gradient(135deg,var(--secondary),var(--primary)); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:19px; flex-shrink:0; }
  .doc-name { font-weight:600; font-size:16px; }
  .doc-meta { font-size:13px; color:var(--text-secondary); }
  .svc { display:flex; justify-content:space-between; gap:12px; align-items:center; }
  .svc-name { display:flex; gap:10px; align-items:center; font-weight:500; font-size:14px; }
  .svc-name svg { color:var(--primary); flex-shrink:0; }
  .svc-price { font-weight:700; color:var(--primary-dark); white-space:nowrap; font-size:14px; }
  .two-col { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; }
  table.hours { width:100%; border-collapse:collapse; font-size:15px; }
  table.hours td { padding:11px 4px; border-bottom:1px solid var(--divider); }
  table.hours tr:last-child td { border-bottom:none; }
  table.hours td:last-child { text-align:right; font-weight:500; }
  table.hours tr.today td { color:var(--primary-dark); font-weight:700; }
  .closed { color:var(--text-hint); }
  .contact-list { display:flex; flex-direction:column; gap:4px; }
  .cta-band { background:linear-gradient(135deg,var(--grad-start),var(--grad-mid) 60%,var(--grad-end)); color:#fff; border-radius:var(--radius-xl); padding:40px; display:flex; flex-wrap:wrap; gap:20px; align-items:center; justify-content:space-between; box-shadow:var(--shadow-lg); }
  .cta-band h2 { margin:0 0 6px; font-size:clamp(22px,3vw,30px); }
  .cta-band p { margin:0; color:rgba(255,255,255,.85); }
  /* Footer */
  footer { background:#0E0B1E; color:rgba(255,255,255,.6); padding:52px 0 26px; font-size:13px; }
  .footer-grid { display:grid; grid-template-columns:2fr 1fr 1fr; gap:36px; margin-bottom:36px; }
  .footer-logo { display:flex; align-items:center; gap:10px; font-size:17px; font-weight:700; color:#fff; margin-bottom:12px; }
  .footer-col-title { font-size:13px; font-weight:700; color:#fff; margin-bottom:12px; }
  .footer-links { display:flex; flex-direction:column; gap:8px; }
  .footer-links a:hover, .powered a:hover { color:var(--accent); }
  .footer-bottom { border-top:1px solid rgba(255,255,255,.08); padding-top:22px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px; font-size:12px; }
  .powered { display:inline-flex; align-items:center; gap:6px; }
  .powered b { color:#fff; }
  .sticky-cta { display:none; }
  @media (max-width:900px) {
    .hero-grid, .two-col { grid-template-columns:1fr; }
    .nav-links { display:none; }
    .navbar-actions { margin-left:auto; }
    .footer-grid { grid-template-columns:1fr 1fr; }
  }
  @media (max-width:600px) {
    .container { padding:0 16px; }
    .hero { padding:48px 0 60px; }
    section.block { padding:52px 0; }
    .navbar-actions .btn-outline { display:none; }
    .footer-grid { grid-template-columns:1fr; }
    .cta-band { padding:28px 22px; }
    .hero-actions .btn { flex:1 1 auto; justify-content:center; }
    .sticky-cta { display:flex; position:fixed; left:12px; right:12px; bottom:12px; z-index:60; gap:8px; }
    .sticky-cta .btn { flex:1; justify-content:center; }
    body { padding-bottom:78px; }
  }
</style>
</head>
<body>
<header class="navbar">
  <div class="container navbar-inner">
    <a href="#top" class="navbar-logo" aria-label="${esc(name)} home">
      <div class="logo-tile">${logo ? `<img src="${esc(logo)}" alt="">` : initial}</div>
      <span>${esc(name)}</span>
    </a>
    <nav class="nav-links" aria-label="Sections">
      ${about ? '<a href="#about">About</a>' : ''}
      ${showDoctors ? '<a href="#doctors">Doctors</a>' : ''}
      ${showServices ? '<a href="#services">Services</a>' : ''}
      <a href="#contact">Timings &amp; Contact</a>
    </nav>
    <div class="navbar-actions">
      ${tel ? `<a class="btn btn-outline btn-sm" href="${esc(tel)}">${icon('phone', 16)} Call</a>` : ''}
      ${wa ? `<a class="btn btn-primary btn-sm" href="${esc(wa)}" target="_blank" rel="noopener">${icon('chat', 16)} Book</a>` : ''}
    </div>
  </div>
</header>

<main id="top">
<section class="hero">
  <div class="container hero-grid">
    <div>
      <span class="eyebrow">${icon('heart', 15)} ${esc(specialties[0] || 'Clinic')}${city ? ` · ${esc(city)}` : ''}</span>
      <h1>${esc(name)}</h1>
      ${tagline ? `<p class="lead">${esc(tagline)}</p>` : ''}
      ${specialties.length ? `<div class="chips">${specialties.map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div>` : ''}
      <div class="hero-actions">
        ${wa ? `<a class="btn btn-white" href="${esc(wa)}" target="_blank" rel="noopener">${icon('chat')} Book on WhatsApp</a>` : ''}
        ${tel ? `<a class="btn ${wa ? 'btn-glass' : 'btn-white'}" href="${esc(tel)}">${icon('phone')} Call ${esc(phone)}</a>` : ''}
        ${map ? `<a class="btn btn-glass" href="${esc(map)}" target="_blank" rel="noopener">${icon('pin')} Directions</a>` : ''}
      </div>
    </div>
    <div class="info-card">
      ${address ? `<div class="info-row"><div class="info-ico">${icon('pin')}</div><div><div class="info-label">Address</div><div class="info-value">${map ? `<a href="${esc(map)}" target="_blank" rel="noopener">${esc(address)}</a>` : esc(address)}</div></div></div>` : ''}
      ${phone ? `<div class="info-row"><div class="info-ico">${icon('phone')}</div><div><div class="info-label">Phone</div><div class="info-value">${tel ? `<a href="${esc(tel)}">${esc(phone)}</a>` : esc(phone)}</div></div></div>` : ''}
      ${hasHours ? `<div class="info-row"><div class="info-ico">${icon('clock')}</div><div><div class="info-label">Today <span class="open-badge" id="open-badge" hidden></span></div><div class="info-value" id="today-hours">See timings below</div></div></div>` : ''}
      ${email ? `<div class="info-row"><div class="info-ico">${icon('mail')}</div><div><div class="info-label">Email</div><div class="info-value"><a href="mailto:${esc(email)}">${esc(email)}</a></div></div></div>` : ''}
    </div>
  </div>
</section>

${about ? `<section class="block alt" id="about">
  <div class="container">
    <span class="section-label">About us</span>
    <h2 class="section-title">Welcome to ${esc(name)}</h2>
    <p class="about-text">${esc(about)}</p>
  </div>
</section>` : ''}

${showDoctors ? `<section class="block" id="doctors">
  <div class="container">
    <span class="section-label">Our doctors</span>
    <h2 class="section-title">Meet the team</h2>
    <p class="section-sub">Experienced doctors who take the time to listen.</p>
    <div class="grid">
      ${doctors.map(d => `<div class="card"><div class="doc-head"><div class="avatar">${esc((d.name || '?').replace(/^dr\.?\s*/i, '').trim()[0]?.toUpperCase() || 'D')}</div><div>
        <div class="doc-name">${esc(d.name)}</div>
        ${d.specialization ? `<div class="doc-meta">${esc(d.specialization)}</div>` : ''}
        ${d.qualification ? `<div class="doc-meta">${esc(d.qualification)}</div>` : ''}
      </div></div></div>`).join('')}
    </div>
  </div>
</section>` : ''}

${showServices ? `<section class="block ${showDoctors ? 'alt' : ''}" id="services">
  <div class="container">
    <span class="section-label">Services</span>
    <h2 class="section-title">What we offer</h2>
    <p class="section-sub">Consultations, tests and procedures available at the clinic${showPrices ? '. Prices are indicative and may vary.' : '.'}</p>
    <div class="grid">
      ${services.map(s => `<div class="card svc"><span class="svc-name">${icon('check', 16)}${esc(s.name)}</span>${showPrices && Number(s.price) > 0 ? `<span class="svc-price">₹${Number(s.price).toLocaleString('en-IN')}</span>` : ''}</div>`).join('')}
    </div>
  </div>
</section>` : ''}

<section class="block" id="contact">
  <div class="container">
    <span class="section-label">Visit us</span>
    <h2 class="section-title">Timings &amp; contact</h2>
    <div class="two-col" style="margin-top:28px">
      <div class="card">
        <h3 style="margin:0 0 10px;font-size:18px">Clinic timings</h3>
        ${hasHours ? `<table class="hours"><tbody>${hours.map(h => `<tr data-day="${h.key}"><td>${h.label}</td><td>${h.closed ? '<span class="closed">Closed</span>' : h.slots.map(s => `${fmtTime(s.open)} – ${fmtTime(s.close)}`).join(', ')}</td></tr>`).join('')}</tbody></table>`
          : `<p class="closed" style="margin:0">Please call the clinic for timings.</p>`}
      </div>
      <div class="card">
        <h3 style="margin:0 0 10px;font-size:18px">Get in touch</h3>
        <div class="contact-list">
          ${address ? `<div class="info-row"><div class="info-ico">${icon('pin')}</div><div><div class="info-label">Address</div><div class="info-value">${esc(address)}</div></div></div>` : ''}
          ${phone ? `<div class="info-row"><div class="info-ico">${icon('phone')}</div><div><div class="info-label">Phone</div><div class="info-value">${tel ? `<a href="${esc(tel)}">${esc(phone)}</a>` : esc(phone)}</div></div></div>` : ''}
          ${email ? `<div class="info-row"><div class="info-ico">${icon('mail')}</div><div><div class="info-label">Email</div><div class="info-value"><a href="mailto:${esc(email)}">${esc(email)}</a></div></div></div>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:18px">
          ${primaryCta}
          ${map ? `<a class="btn btn-outline" href="${esc(map)}" target="_blank" rel="noopener">${icon('pin')} Get directions</a>` : ''}
        </div>
      </div>
    </div>
  </div>
</section>

${review ? `<section class="block" style="padding-top:0">
  <div class="container">
    <div class="cta-band">
      <div><h2>Visited us recently?</h2><p>Your review helps other patients find good care.</p></div>
      <a class="btn btn-white" href="${esc(review)}" target="_blank" rel="noopener">${icon('star')} Write a Google review</a>
    </div>
  </div>
</section>` : ''}
</main>

<footer>
  <div class="container">
    <div class="footer-grid">
      <div>
        <div class="footer-logo"><div class="logo-tile" style="width:34px;height:34px;border-radius:9px;font-size:15px">${logo ? `<img src="${esc(logo)}" alt="">` : initial}</div>${esc(name)}</div>
        ${address ? `<p style="margin:0;max-width:300px;line-height:1.7">${esc(address)}</p>` : ''}
      </div>
      <div>
        <div class="footer-col-title">Contact</div>
        <div class="footer-links">
          ${phone ? `<a href="${esc(tel || '#contact')}">${esc(phone)}</a>` : ''}
          ${email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : ''}
          ${map ? `<a href="${esc(map)}" target="_blank" rel="noopener">Directions</a>` : ''}
        </div>
      </div>
      <div>
        <div class="footer-col-title">On this page</div>
        <div class="footer-links">
          ${about ? '<a href="#about">About</a>' : ''}
          ${showDoctors ? '<a href="#doctors">Doctors</a>' : ''}
          ${showServices ? '<a href="#services">Services</a>' : ''}
          <a href="#contact">Timings &amp; contact</a>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} ${esc(name)}. For emergencies call 112.</span>
      <a class="powered" href="${esc(siteUrl)}" target="_blank" rel="noopener">Powered by <b>Infer Health</b></a>
    </div>
  </div>
</footer>

${primaryCta || tel ? `<div class="sticky-cta">${wa ? `<a class="btn btn-primary" href="${esc(wa)}" target="_blank" rel="noopener">${icon('chat')} WhatsApp</a>` : ''}${tel ? `<a class="btn btn-white" style="border:1.5px solid var(--primary)" href="${esc(tel)}">${icon('phone')} Call</a>` : ''}</div>` : ''}

${hasHours ? `<script>
(function () {
  var hours = ${JSON.stringify(hours.map(h => ({ k: h.key, c: h.closed, s: h.slots }))).replace(/</g, '\\u003c')};
  var keys = ['sun','mon','tue','wed','thu','fri','sat'];
  var now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  var key = keys[now.getDay()], mins = now.getHours() * 60 + now.getMinutes();
  var today = hours.filter(function (h) { return h.k === key; })[0];
  var fmt = function (t) { var p = t.split(':'), h = +p[0], ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + p[1] + ' ' + ap; };
  var row = document.querySelector('tr[data-day="' + key + '"]'); if (row) row.className = 'today';
  var el = document.getElementById('today-hours'), badge = document.getElementById('open-badge');
  if (!today || today.c) { el.textContent = 'Closed today'; badge.textContent = 'Closed'; badge.className = 'open-badge off'; badge.hidden = false; return; }
  el.textContent = today.s.map(function (s) { return fmt(s.open) + ' – ' + fmt(s.close); }).join(', ');
  var open = today.s.some(function (s) { var a = s.open.split(':'), b = s.close.split(':'); return mins >= a[0]*60 + +a[1] && mins < b[0]*60 + +b[1]; });
  badge.textContent = open ? 'Open now' : 'Closed now'; badge.className = 'open-badge ' + (open ? 'on' : 'off'); badge.hidden = false;
})();
</script>` : ''}
</body>
</html>`;
}

module.exports = { renderClinicPage, hoursOf, esc, DAYS };
