/* ============================================================
   BIC — Unified Navigation Controller
   ------------------------------------------------------------
   One smart-scrolling bar + one cinematic dual-overlay menu for
   every public page, doubling as the page-transition engine.

   Requires: <header class="bic-nav" data-nav-theme="…"> static
   markup in the page. Builds Overlay A (mask) + Overlay B (panel)
   itself and owns all of their choreography — everything slides
   in FROM THE LEFT:

     open     blank mask wipes in and covers the screen on its own →
              +340ms the panel wipes over it, items stagger in
     close    reverse sweep back out to the left
     navigate the blank mask wipes in again over the panel → route
              changes under cover → cover slides away TO THE RIGHT,
              revealing the destination page
     #anchor  close, then glide to the section (owned scroll — the
              native hash jump is unreliable right after scroll-lock)
   ============================================================ */
(function () {
  'use strict';

  /* ── Site map (single source for menu links) ─────────────── */
  var SITEMAP = [
    { href: '/index.html',     label: 'Home' },
    { href: '/programs.html',  label: 'Our Programs' },
    { href: '/news.html',      label: 'Updates' },
    { href: '/library.html',   label: 'Digital Library' },
    { href: '/academies.html', label: 'BIMA \u00b7 BIFA' },
    { href: '/contact.html',   label: 'Get In Touch' },
    /* The portal is a separate Next.js app proxied in by server.js under
       /portal — see PORTAL-INTEGRATION-PLAN.md. It renders in both the desktop
       bar and the overlay menu from this single list. */
    { href: '/portal',         label: 'Portal' }
  ];
  window.BIC_SITEMAP = SITEMAP;

  var FLAG = 'bic.menuNav';
  var MASK_MS = 560;
  var PANEL_DELAY = 340;
  var CLOSE_MS = 720;
  var COVER_MS = 440;
  var NAV_MS = 520;
  var SCROLL_THRESHOLD = 12;
  var SCROLL_TOP = 10;
  var SCROLL_HIDE_AFTER = 90;

  var SOCIALS =
    '<a class="social-circle" href="https://www.facebook.com/bicbisbodija" target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12.07C22 6.48 17.52 2 11.93 2S2 6.48 2 12.07C2 17.06 5.66 21.13 10.44 21.93v-6.85H8.08v-2.95h2.36V9.41c0-2.34 1.39-3.63 3.52-3.63 1.02 0 2.08.18 2.08.18v2.29h-1.17c-1.15 0-1.51.72-1.51 1.46v1.76h2.57l-.41 2.95h-2.16V21.9C18.34 21.13 22 17.06 22 12.07z"/></svg></a>' +
    '<a class="social-circle" href="https://www.instagram.com/bic_bis" target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zM12 8.8a3.2 3.2 0 100 6.4 3.2 3.2 0 000-6.4zM17.5 6.2a.9.9 0 11-1.8 0 .9.9 0 011.8 0z"/></svg></a>' +
    '<a class="social-circle" href="https://x.com/bic_bis" target="_blank" rel="noopener noreferrer" aria-label="X / Twitter" title="X / Twitter">' +
    '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z"/></svg></a>';


  var header = null, toggle = null, menu = null, mask = null, panel = null;
  var state = 'closed'; // closed | opening | open | closing | navigating
  var lastFocused = null;
  var timers = [];
  var downAcc = 0, upAcc = 0, lastY = 0, ticking = false;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function currentPath() {
    var p = location.pathname.replace(/\/+$/, '');
    if (p === '' || p === '/') p = '/index.html';
    return p;
  }
  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no-op */ }
  }
  var lockedY = 0;
  function preventScroll(on) {
    if (on) {
      lockedY = window.scrollY || window.pageYOffset || 0;
    }
    document.documentElement.style.overflow = on ? 'hidden' : '';
    document.body.style.overflow = on ? 'hidden' : '';
    /* Guard: if the browser clamped or lost the scroll position while
       locking (legacy pages pinned html/body to 100% height used to
       collapse the scroll range and snap the page to the top), put the
       reader back where they were. */
    if (!on && (window.scrollY || window.pageYOffset || 0) !== lockedY) {
      try { window.scrollTo(0, lockedY); } catch (e) { /* no-op */ }
    }
  }

  /* ── Menu construction ───────────────────────────────────── */
  function themeOf() {
    return (header && header.getAttribute('data-nav-theme')) || 'paper';
  }
  function readExtraLinks() {
    var raw = header.getAttribute('data-bic-extra-links');
    if (!raw) return [];
    try {
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list.filter(function (l) { return l && l.href && l.label; }) : [];
    } catch (e) { return []; }
  }

  function buildMenu(extras) {
    var path = currentPath();
    var i = 0, html = '';
    SITEMAP.forEach(function (item) {
      var active = item.href === path ? ' is-active' : '';
      html += '<a class="bic-menu__link' + active + '" href="' + item.href + '" style="--i:' + i + '">' +
        esc(item.label) + '</a>';
      i += 1;
    });
    var extraHtml = '';
    if (extras.length) {
      extraHtml += '<p class="bic-menu__group-title">On this page</p>';
      extras.forEach(function (item) {
        extraHtml += '<a class="bic-menu__link bic-menu__link--small" href="' + esc(item.href) + '" style="--i:' + i + '">' +
          esc(item.label) + '</a>';
        i += 1;
      });
    }
    var ctaHref = header.getAttribute('data-nav-cta-href') || '/contact.html';
    var ctaLabel = header.getAttribute('data-nav-cta-label') || 'Get In Touch';

    var el = document.createElement('div');
    el.className = 'bic-menu';
    el.id = 'bic-menu';
    el.setAttribute('aria-hidden', 'true');
    if (header.getAttribute('data-nav-theme')) {
      el.setAttribute('data-nav-theme', header.getAttribute('data-nav-theme'));
    }
    el.innerHTML =
      '<div class="bic-menu__mask"></div>' +
      '<div class="bic-menu__panel" role="dialog" aria-modal="true" aria-label="Site menu" tabindex="-1">' +
      '  <div class="bic-menu__inner">' +
      '    <div class="bic-menu__top">' +
      '      <span class="bic-menu__brand-text">Bodija International College</span>' +
      '    </div>' +
      '    <nav class="bic-menu__links" aria-label="Site">' + html + extraHtml + '</nav>' +
      '    <div class="bic-menu__foot">' +
      '      <div class="bic-menu__socials" aria-label="Follow us on social media">' + SOCIALS + '</div>' +
      '      <a class="bic-menu__cta" href="' + esc(ctaHref) + '">' + esc(ctaLabel) + '</a>' +
      '    </div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(el);
    menu = el;
    mask = el.querySelector('.bic-menu__mask');
    panel = el.querySelector('.bic-menu__panel');
  }

  function fillDesktopLinks(extras) {
    var box = header.querySelector('.bic-nav__links');
    if (!box) return;
    var path = currentPath();
    var items = extras.length ? extras : SITEMAP;
    box.innerHTML = items.map(function (l) {
      var active = l.href === path ? ' data-active' : '';
      return '<a href="' + esc(l.href) + '"' + active + '>' + esc(l.label) + '</a>';
    }).join('');
  }

  /* ── Focus management ────────────────────────────────────── */
  function getFocusable() {
    if (!panel) return [];
    var sel = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.prototype.slice.call(panel.querySelectorAll(sel))
      .filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
  }
  function onKeyDown(e) {
    if (state !== 'open' && state !== 'opening') return;
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
    if (e.key === 'Tab') {
      var f = getFocusable();
      if (!f.length) { e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function onFocusCapture(e) {
    if (state !== 'open' && state !== 'opening') return;
    if (panel && panel.contains(e.target)) return;
    if (toggle && toggle.contains(e.target)) return;
    e.stopPropagation();
    var f = getFocusable();
    if (f.length) f[0].focus();
    else if (panel) panel.focus();
  }

  /* ── Open / close ────────────────────────────────────────── */
  function openMenu() {
    if (state !== 'closed' || !menu) return;
    state = 'opening';
    lastFocused = document.activeElement;
    clearTimers();
    menu.classList.add('bic-menu--live');
    header.classList.add('bic-nav--open');
    header.classList.remove('bic-nav--hidden');
    menu.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { menu.classList.add('bic-menu--open'); });
    });
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    preventScroll(true);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focus', onFocusCapture, true);
    later(function () {
      state = 'open';
      var first = panel && panel.querySelector('.bic-menu__link');
      if (first) first.focus({ preventScroll: true });
    }, MASK_MS + PANEL_DELAY);
    vibrate(8);
  }

  function closeMenu() {
    if ((state !== 'open' && state !== 'opening') || !menu) return;
    clearTimers();
    state = 'closing';
    menu.classList.remove('bic-menu--open');
    menu.classList.add('bic-menu--closing');
    header.classList.remove('bic-nav--open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    preventScroll(false);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('focus', onFocusCapture, true);
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus({ preventScroll: true });
    }
    later(function () {
      menu.classList.remove('bic-menu--closing', 'bic-menu--live');
      menu.setAttribute('aria-hidden', 'true');
      state = 'closed';
    }, CLOSE_MS);
    vibrate(8);
  }

  /* ── Page-transition navigation ──────────────────────────── */
  function navigateUnderMask(href) {
    if (state === 'navigating') return;
    state = 'navigating';
    clearTimers();
    header.classList.remove('bic-nav--open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('focus', onFocusCapture, true);

    /* the blank mask wipes in again FROM THE LEFT over the open panel */
    menu.classList.add('bic-menu--covering');   // mask: no transition, back to -101%, above the panel
    void mask.offsetWidth;                      // commit the reset frame
    menu.classList.add('bic-menu--cover-go');   // mask wipes in to cover

    later(function () {
      try { sessionStorage.setItem(FLAG, themeOf()); } catch (e) { /* private mode */ }
      window.location.href = href;
    }, NAV_MS);
    // failsafe: if navigation never happens, restore the menu quietly
    later(function () {
      if (state !== 'navigating') return;
      menu.classList.remove('bic-menu--covering', 'bic-menu--cover-go', 'bic-menu--live');
      menu.setAttribute('aria-hidden', 'true');
      preventScroll(false);
      state = 'closed';
    }, 4000);
  }

  /* Arriving on a page with a transition in flight: the head snippet has
     already raised the full-screen cover (html.bic-is-transitioning::after,
     coloured per theme). Slide it away TO THE RIGHT to reveal this page. */
  function arrivalSequence() {
    var root = document.documentElement;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        root.classList.add('bic-transit-go');
        later(function () {
          root.className = root.className
            .replace(/\bbic-transit-go\b/g, '')
            .replace(/\bbic-is-transitioning\b/g, '')
            .replace(/\bbic-transit--[a-z-]+\b/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
        }, 720);
      });
    });
  }

  /* ── Same-page section jumps (e.g. landing-page anchors) ──
     The browser's native hash jump is unreliable right after the body
     scroll-lock is released (notably Safari/iOS), so we own the scroll:
     close the menu, then glide to the section once the sweep is underway. */
  function jumpToSection(hash) {
    var id = hash.slice(1);
    setTimeout(function () {
      var target = id ? document.getElementById(id) : null;
      var reduced = false;
      try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (err) { /* no-op */ }
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      }
      try { history.replaceState(null, '', hash); } catch (err) { /* no-op */ }
    }, 400);
  }

  /* ── Link interception inside the menu ───────────────────── */
  function onMenuLinkClick(e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!a || !menu.contains(a)) return;
    var href = a.getAttribute('href');
    if (!href) return;
    if (href.charAt(0) === '#') {                                   // same-page section
      e.preventDefault();
      closeMenu();
      jumpToSection(href);
      return;
    }
    if (/^(mailto:|tel:|https?:)/.test(href)) return;               // external/social: plain behaviour
    if (href.charAt(0) !== '/') return;
    e.preventDefault();
    navigateUnderMask(href);
  }

  /* ── Smart-scroll director ───────────────────────────────── */
  function onScrollFrame() {
    ticking = false;
    if (!header) return;
    var y = window.scrollY || window.pageYOffset || 0;
    var dy = y - lastY;
    lastY = y;
    header.classList.toggle('bic-nav--scrolled', y > 24);
    if (state !== 'closed' || y <= SCROLL_TOP) {
      header.classList.remove('bic-nav--hidden');
      downAcc = 0; upAcc = 0;
      return;
    }
    if (dy > 0) { downAcc += dy; upAcc = 0; }
    else if (dy < 0) { upAcc += -dy; downAcc = 0; }
    if (downAcc > SCROLL_THRESHOLD && y > SCROLL_HIDE_AFTER) {
      header.classList.add('bic-nav--hidden');
      downAcc = 0;
    } else if (upAcc > SCROLL_THRESHOLD) {
      header.classList.remove('bic-nav--hidden');
      upAcc = 0;
    }
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onScrollFrame);
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    header = document.querySelector('.bic-nav');
    if (!header) return; // admin.html and other non-nav pages
    toggle = header.querySelector('.bic-nav__toggle');
    var extras = readExtraLinks();
    buildMenu(extras);
    fillDesktopLinks(extras);

    /* arriving mid-transition? reveal from under the cover */
    var flagged = false;
    try {
      flagged = !!sessionStorage.getItem(FLAG);
      sessionStorage.removeItem(FLAG);
    } catch (e) { /* no-op */ }
    if (flagged) arrivalSequence();

    toggle.addEventListener('click', function () {
      if (state === 'closed') openMenu();
      else if (state === 'open' || state === 'opening') closeMenu();
    });
    menu.addEventListener('click', onMenuLinkClick);
    window.addEventListener('scroll', onScroll, { passive: true });
    /* bfcache: re-run the reveal if restored mid-transition */
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) {
        var f = false;
        try {
          f = !!sessionStorage.getItem(FLAG);
          sessionStorage.removeItem(FLAG);
        } catch (err) { /* no-op */ }
        if (f) arrivalSequence();
      }
    });
    onScrollFrame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.BIC_NAV = {
    open: openMenu,
    close: closeMenu,
    get state() { return state; },
    get element() { return menu; },
    /* QA hook: hard-reset the state machine (used by the jsdom suites) */
    _reset: function () {
      clearTimers();
      state = 'closed';
      if (menu) {
        menu.className = 'bic-menu';
        menu.setAttribute('aria-hidden', 'true');
      }
      if (header) header.classList.remove('bic-nav--open');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
      }
      preventScroll(false);
    }
  };
})();
