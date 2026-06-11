/**
 * Infer — Page Transition & Scroll Animation Engine
 * Uses a fixed overlay for consistent enter/exit fades.
 * Body is never animated directly — avoids flash-of-content issues.
 */
(function () {
  'use strict';

  const ENTER_MS = 380;   // overlay fade-out on page enter
  const EXIT_MS  = 280;   // overlay fade-in on page exit, then navigate

  /* ── Inject styles ─────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    html { scroll-behavior: smooth; }

    /* ── Transition overlay ── */
    #page-overlay {
      position: fixed; inset: 0; z-index: 99998;
      background: #F5F4FF;
      opacity: 1;
      pointer-events: none;
      transition: opacity ${ENTER_MS}ms cubic-bezier(.4,0,.2,1);
    }
    #page-overlay.fade-out { opacity: 0; }
    #page-overlay.fade-in  { opacity: 1 !important; transition: opacity ${EXIT_MS}ms cubic-bezier(.4,0,.2,1) !important; }

    /* ── Scroll reveal ── */
    .reveal {
      opacity: 0; transform: translateY(24px);
      transition: opacity .55s cubic-bezier(.4,0,.2,1),
                  transform .55s cubic-bezier(.4,0,.2,1);
    }
    .reveal.visible            { opacity: 1; transform: translateY(0); }
    .reveal-delay-1.visible    { transition-delay: .08s; }
    .reveal-delay-2.visible    { transition-delay: .16s; }
    .reveal-delay-3.visible    { transition-delay: .26s; }
    .reveal-delay-4.visible    { transition-delay: .36s; }

    .reveal-left  { opacity:0; transform:translateX(-28px); transition: opacity .55s cubic-bezier(.4,0,.2,1), transform .55s cubic-bezier(.4,0,.2,1); }
    .reveal-right { opacity:0; transform:translateX(28px);  transition: opacity .55s cubic-bezier(.4,0,.2,1), transform .55s cubic-bezier(.4,0,.2,1); }
    .reveal-left.visible, .reveal-right.visible { opacity:1; transform:translateX(0); }

    /* ── Card hover ── */
    .feature-card, .product-card {
      transition: transform .2s cubic-bezier(.4,0,.2,1),
                  box-shadow .2s cubic-bezier(.4,0,.2,1) !important;
    }
    .feature-card:hover, .product-card:hover { transform: translateY(-4px) !important; }

    /* ── Button feedback ── */
    .btn:active, .launch-btn:active { transform: scale(.97) !important; transition: transform .08s !important; }

    /* ── Nav underline ── */
    .nav-link { position: relative; }
    .nav-link::after {
      content:''; position:absolute; bottom:2px; left:12px; right:12px;
      height:2px; border-radius:2px; background:var(--primary,#7B6EF6);
      transform:scaleX(0); transform-origin:left;
      transition:transform .18s cubic-bezier(.4,0,.2,1);
    }
    .nav-link:hover::after { transform:scaleX(1); }
  `;
  document.head.appendChild(style);

  /* ── Create overlay ────────────────────────────────────────────────── */
  const overlay = document.createElement('div');
  overlay.id = 'page-overlay';
  // Insert as first child of body (or append if body not ready)
  if (document.body) {
    document.body.insertBefore(overlay, document.body.firstChild);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.insertBefore(overlay, document.body.firstChild);
    });
  }

  /* ── Page enter — fade overlay out ────────────────────────────────── */
  function enterPage() {
    // Double rAF ensures the browser has painted with opacity:1 first
    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay.classList.add('fade-out');
    }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enterPage);
  } else {
    enterPage();
  }

  /* ── Scroll reveal ─────────────────────────────────────────────────── */
  function initReveal() {
    const els = document.querySelectorAll(
      '.reveal, .reveal-left, .reveal-right'
    );
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    els.forEach(el => io.observe(el));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReveal);
  } else {
    initReveal();
  }

  /* ── Page exit — fade overlay in, then navigate ────────────────────── */
  document.addEventListener('click', function (e) {
    const link = e.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // Skip external, hash, mailto, tel, new tab
    if (
      href.startsWith('http') || href.startsWith('//') ||
      href.startsWith('#')    || href.startsWith('mailto') ||
      href.startsWith('tel')  || link.target === '_blank' ||
      link.hasAttribute('data-no-transition')
    ) return;

    // Skip same-page hash links
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    if (href.includes('#') && (href.startsWith('#') || href.split('#')[0] === currentPage)) return;

    e.preventDefault();
    const dest = href;

    // Fade overlay in
    overlay.classList.remove('fade-out');
    overlay.classList.add('fade-in');

    setTimeout(() => { window.location.href = dest; }, EXIT_MS + 20);
  });

})();
