/**
 * Infer — Page Transition & Scroll Animation Engine
 * Handles: page enter/exit fades, scroll reveals, link transitions
 */
(function () {
  'use strict';

  /* ── Page enter animation ──────────────────────────────────────────── */
  document.documentElement.style.setProperty('--page-opacity', '0');
  document.documentElement.style.setProperty('--page-translateY', '18px');

  const style = document.createElement('style');
  style.textContent = `
    html { scroll-behavior: smooth; }

    body {
      opacity: var(--page-opacity, 0);
      transform: translateY(var(--page-translateY, 18px));
      transition: opacity .5s cubic-bezier(.4,0,.2,1), transform .5s cubic-bezier(.4,0,.2,1);
    }
    body.page-visible {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
    body.page-exit {
      opacity: 0 !important;
      transform: translateY(-12px) !important;
      transition: opacity .3s ease, transform .3s ease !important;
      pointer-events: none;
    }

    /* ── Scroll reveal ── */
    .reveal {
      opacity: 0;
      transform: translateY(28px);
      transition: opacity .6s cubic-bezier(.4,0,.2,1), transform .6s cubic-bezier(.4,0,.2,1);
    }
    .reveal.visible { opacity: 1; transform: translateY(0); }
    .reveal-delay-1.visible { transition-delay: .1s; }
    .reveal-delay-2.visible { transition-delay: .2s; }
    .reveal-delay-3.visible { transition-delay: .32s; }
    .reveal-delay-4.visible { transition-delay: .44s; }

    /* ── Card hover lift ── */
    .feature-card, .product-card, .card, .inferpad-feat {
      transition: transform .22s cubic-bezier(.4,0,.2,1),
                  box-shadow .22s cubic-bezier(.4,0,.2,1) !important;
    }
    .feature-card:hover, .product-card:hover {
      transform: translateY(-5px) !important;
    }

    /* ── Button press ── */
    .btn:active, .btn-primary:active, .launch-btn:active {
      transform: scale(.97) !important;
      transition: transform .1s !important;
    }

    /* ── Smooth image reveal ── */
    img {
      transition: opacity .4s ease, transform .4s ease;
    }
    img.img-reveal {
      opacity: 0; transform: scale(.97);
    }
    img.img-reveal.visible {
      opacity: 1; transform: scale(1);
    }

    /* ── Section fade-in from side ── */
    .reveal-left  { opacity:0; transform: translateX(-32px); transition: opacity .6s cubic-bezier(.4,0,.2,1), transform .6s cubic-bezier(.4,0,.2,1); }
    .reveal-right { opacity:0; transform: translateX(32px);  transition: opacity .6s cubic-bezier(.4,0,.2,1), transform .6s cubic-bezier(.4,0,.2,1); }
    .reveal-left.visible, .reveal-right.visible { opacity:1; transform: translateX(0); }

    /* ── Nav link underline slide ── */
    .nav-link {
      position: relative;
    }
    .nav-link::after {
      content: '';
      position: absolute; bottom: 2px; left: 12px; right: 12px;
      height: 2px; border-radius: 2px;
      background: var(--primary, #7B6EF6);
      transform: scaleX(0); transform-origin: left;
      transition: transform .2s cubic-bezier(.4,0,.2,1);
    }
    .nav-link:hover::after { transform: scaleX(1); }

    /* ── Hero text stagger ── */
    .hero-stagger > * {
      opacity: 0; transform: translateY(20px);
      transition: opacity .6s cubic-bezier(.4,0,.2,1), transform .6s cubic-bezier(.4,0,.2,1);
    }
    .hero-stagger.visible > *:nth-child(1) { opacity:1; transform:translateY(0); transition-delay:.05s; }
    .hero-stagger.visible > *:nth-child(2) { opacity:1; transform:translateY(0); transition-delay:.15s; }
    .hero-stagger.visible > *:nth-child(3) { opacity:1; transform:translateY(0); transition-delay:.25s; }
    .hero-stagger.visible > *:nth-child(4) { opacity:1; transform:translateY(0); transition-delay:.35s; }
    .hero-stagger.visible > *:nth-child(5) { opacity:1; transform:translateY(0); transition-delay:.45s; }
  `;
  document.head.appendChild(style);

  /* ── Trigger page enter ───────────────────────────────────────────── */
  function enterPage() {
    requestAnimationFrame(() => {
      document.body.classList.add('page-visible');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(enterPage, 60));
  } else {
    setTimeout(enterPage, 60);
  }

  /* ── Scroll reveal observer ───────────────────────────────────────── */
  function initReveal() {
    const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, img.img-reveal, .hero-stagger');
    if (!els.length) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    els.forEach(el => io.observe(el));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReveal);
  } else {
    initReveal();
  }

  /* ── Page exit on internal link click ────────────────────────────── */
  document.addEventListener('click', function (e) {
    const link = e.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // Skip: external, hash-only, mailto, tel, target=_blank
    if (
      href.startsWith('http') ||
      href.startsWith('//') ||
      href.startsWith('#') ||
      href.startsWith('mailto') ||
      href.startsWith('tel') ||
      link.target === '_blank' ||
      link.hasAttribute('data-no-transition')
    ) return;

    // Same page with hash
    if (href.includes('#') && href.split('#')[0] === window.location.pathname.split('/').pop()) return;

    e.preventDefault();
    document.body.classList.add('page-exit');
    setTimeout(() => { window.location.href = href; }, 300);
  });

  /* ── Add img-reveal to all content images ─────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.browser-shell img, .hero img, section img').forEach(img => {
      img.classList.add('img-reveal');
    });
    // Re-run reveal for new elements
    initReveal();
  });

})();
