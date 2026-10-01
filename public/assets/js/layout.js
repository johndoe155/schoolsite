/* ============================================================
   BIC — Shared layout layer
   ------------------------------------------------------------
   One place for the chrome every page repeats:
     • the site map (all cross-page links)
     • the full-screen / side-panel mobile menu markup
     • the menu open/close behaviour (focus trap, scroll lock,
       Escape, overlay click)
     • footer year injection

   Usage: add a placeholder where the menu belongs —
     <div data-bic-menu="home"></div>   (dark full-screen variant)
     <div data-bic-menu="lux"></div>    (parchment side-panel variant)
   and a trigger element with aria-controls="mobileMenu".
   ============================================================ */
(function () {
  'use strict';

  /* ── Site map: the single source for all internal links ── */
  var BIC_SITEMAP = [
    { href: '/index.html',     label: 'Home' },
    { href: '/news.html',      label: 'Updates' },
    { href: '/programs.html',  label: 'Our Programs' },
    { href: '/contact.html',   label: 'Get In Touch' },
    { href: '/library.html',   label: 'Digital Library' },
    { href: '/academies.html', label: 'BIMA/BIFA' }
  ];
  window.BIC_SITEMAP = BIC_SITEMAP;

  function currentPath() {
    var p = location.pathname.replace(/\/+$/, '');
    if (p === '' || p === '/') p = '/index.html';
    return p;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Menu markup injection ─────────────────────────────── */
  var CLOSE_ICON_LUX =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M18 6L6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '<path d="M6 6L18 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '</svg>';

  var CLOSE_ICON_HOME =
    '<svg width="82" height="82" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M18 6L6 18" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M6 6L18 18" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  var SOCIALS =
    '<a class="social-circle" href="https://www.facebook.com/bicbisbodija" target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M22 12.07C22 6.48 17.52 2 11.93 2S2 6.48 2 12.07C2 17.06 5.66 21.13 10.44 21.93v-6.85H8.08v-2.95h2.36V9.41c0-2.34 1.39-3.63 3.52-3.63 1.02 0 2.08.18 2.08.18v2.29h-1.17c-1.15 0-1.51.72-1.51 1.46v1.76h2.57l-.41 2.95h-2.16V21.9C18.34 21.13 22 17.06 22 12.07z" fill="currentColor"/></svg></a>' +
    '<a class="social-circle" href="https://www.instagram.com/bic_bis?igsh=MXdxMGFubnpteTEzeg==" target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zM12 8.8a3.2 3.2 0 100 6.4 3.2 3.2 0 000-6.4zM17.5 6.2a.9.9 0 11-1.8 0 .9.9 0 011.8 0z" fill="currentColor"/></svg></a>' +
    '<a class="social-circle" target="_blank" rel="noopener noreferrer" aria-label="Dribbble" title="Dribbble">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.3 16.1c-1.64-1.9-3.95-3.1-6.6-3.47 1.01-2.47 2.37-4.6 3.27-5.77 2.22 1.39 3.8 3.63 3.86 6.24.01.35-.25.66-.53.99zM7.9 6.1c1.27 1.02 2.44 3.22 3.19 5.3-2.86.25-5.29 1.2-6.99 2.7A7.96 7.96 0 017.9 6.1z" fill="currentColor"/></svg></a>' +
    '<a class="social-circle" href="https://x.com/bic_bis" target="_blank" rel="noopener noreferrer" aria-label="Twitter" title="Twitter">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M22 5.92c-.63.28-1.3.48-2 .56.72-.43 1.28-1.12 1.54-1.95-.67.4-1.42.69-2.22.85A3.5 3.5 0 0016.5 4c-1.93 0-3.5 1.6-3.5 3.57 0 .28.03.55.09.81-2.9-.15-5.48-1.6-7.2-3.8-.3.5-.47 1.09-.47 1.72 0 1.22.6 2.3 1.52 2.93-.56-.02-1.09-.18-1.55-.44v.05c0 1.66 1.19 3.04 2.77 3.35-.29.08-.59.12-.9.12-.22 0-.44-.02-.65-.06.45 1.36 1.76 2.36 3.31 2.39A7.03 7.03 0 014 19.54c1.96 1.26 4.3 2 6.82 2 8.18 0 12.66-7.3 12.66-13.64v-.62c.86-.63 1.6-1.4 2.18-2.3-.78.36-1.62.62-2.5.73z" fill="currentColor"/></svg></a>';

  function navLinksHtml() {
    var here = currentPath();
    return BIC_SITEMAP.map(function (item) {
      var active = item.href === here;
      return '<a href="' + item.href + '" class="menu-item' + (active ? ' is-active' : '') + '"' +
        (active ? ' aria-current="page"' : '') + '>' + esc(item.label) + '</a>';
    }).join('\n        ');
  }

  function menuHtml(variant) {
    if (variant === 'lux') {
      return '' +
        '<div id="mobileMenu" class="mobile-menu" aria-hidden="true" role="dialog" aria-label="Mobile navigation menu">' +
        '  <div class="mobile-menu__overlay" data-overlay></div>' +
        '  <aside class="mobile-menu__panel" role="document" aria-hidden="true">' +
        '    <div class="mobile-menu__inner">' +
        '      <header class="mobile-menu__header">' +
        '        <span class="bic-logo-mark">BIC</span>' +
        '        <button class="mobile-menu__close" aria-label="Close menu" type="button">' + CLOSE_ICON_LUX + '</button>' +
        '      </header>' +
        '      <nav class="mobile-menu__nav" role="navigation" aria-label="Main navigation">' +
        navLinksHtml() +
        '      </nav>' +
        '      <p class="bic-menu-footer-text">Bodija International College &middot; Ibadan, Oyo State</p>' +
        '    </div>' +
        '  </aside>' +
        '</div>';
    }
    /* default: "home" dark full-screen variant */
    return '' +
      '<div id="mobileMenu" class="mobile-menu" aria-hidden="true" role="dialog" aria-label="Mobile menu">' +
      '  <div class="mobile-menu__overlay" data-overlay></div>' +
      '  <aside class="mobile-menu__panel" role="document" aria-hidden="true">' +
      '    <div class="mobile-menu__inner">' +
      '      <header class="mobile-menu__header">' +
      '        <div class="logo"></div>' +
      '        <button class="mobile-menu__close" aria-label="Close menu" type="button">' + CLOSE_ICON_HOME + '</button>' +
      '      </header>' +
      '      <nav class="mobile-menu__nav" role="navigation" aria-label="Main menu">' +
      navLinksHtml() +
      '      </nav>' +
      '      <div class="mobile-menu__footer">' +
      '        <div class="flex items-center mt-6 gap-3">' + SOCIALS + '</div>' +
      '      </div>' +
      '    </div>' +
      '  </aside>' +
      '</div>';
  }

  function injectMenus() {
    var placeholders = document.querySelectorAll('[data-bic-menu]');
    Array.prototype.forEach.call(placeholders, function (ph) {
      var wrapper = document.createElement('div');
      wrapper.innerHTML = menuHtml(ph.getAttribute('data-bic-menu'));
      var menu = wrapper.firstChild;
      ph.parentNode.replaceChild(menu, ph);
    });
  }

  /* ── Shared site footer ────────────────────────────────── */
  function footerHtml(sub, adminHref, adminId, theme) {
    var cls = 'bic-site-footer' + (theme ? ' bic-site-footer--' + theme : '');
    return '' +
      '<footer class="' + cls + '" role="contentinfo" aria-label="Site footer">' +
      '  <div class="bic-footer-wrap">' +
      '    <div class="bic-footer-identity">' +
      '      <div class="bic-footer-logo"><img src="/assets/img/logo.png" alt="Bodija International College" loading="lazy" /></div>' +
      '      <div>' +
      '        <h2 class="bic-footer-wordmark">Bodija Int\u2019l College</h2>' +
      '        <p class="bic-footer-sub">' + esc(sub || 'Success through Labor') + '</p>' +
      '      </div>' +
      '    </div>' +
      '    <p class="bic-footer-kicker">How we make it happen</p>' +
      '    <p class="bic-footer-statement">Building<br>deep human<br>connection<br>that sparks<br>success</p>' +
      '    <div class="bic-footer-prose">' +
      '      <p>We see childhood as a launchpad. Through hands-on STEAM, project-based learning, and personalized instruction, we blend joyful discovery with high expectations so every child is known, challenged, and supported to build curiosity, resilience, collaboration, and ethical leadership.</p>' +
      '      <p>Our vision is confident, adaptable learners who succeed academically and as responsible citizens. With measurable progress, clear communication, and strong family partnerships, we balance joy and excellence to turn potential into practice.</p>' +
      '    </div>' +
      '    <div class="bic-footer-social" aria-label="Follow us on social media">' +
      '      <a class="social-circle" href="https://www.facebook.com/bicbisbodija" target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook">' +
      '        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 12.07C22 6.48 17.52 2 11.93 2S2 6.48 2 12.07C2 17.06 5.66 21.13 10.44 21.93v-6.85H8.08v-2.95h2.36V9.41c0-2.34 1.39-3.63 3.52-3.63 1.02 0 2.08.18 2.08.18v2.29h-1.17c-1.15 0-1.51.72-1.51 1.46v1.76h2.57l-.41 2.95h-2.16V21.9C18.34 21.13 22 17.06 22 12.07z" fill="currentColor"/></svg></a>' +
      '      <a class="social-circle" href="https://www.instagram.com/bic_bis?igsh=MXdxMGFubnpteTEzeg==" target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram">' +
      '        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zM12 8.8a3.2 3.2 0 100 6.4 3.2 3.2 0 000-6.4zM17.5 6.2a.9.9 0 11-1.8 0 .9.9 0 011.8 0z" fill="currentColor"/></svg></a>' +
      '      <a class="social-circle" target="_blank" rel="noopener noreferrer" aria-label="Dribbble" title="Dribbble">' +
      '        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.3 16.1c-1.64-1.9-3.95-3.1-6.6-3.47 1.01-2.47 2.37-4.6 3.27-5.77 2.22 1.39 3.8 3.63 3.86 6.24.01.35-.25.66-.53.99zM7.9 6.1c1.27 1.02 2.44 3.22 3.19 5.3-2.86.25-5.29 1.2-6.99 2.7A7.96 7.96 0 017.9 6.1z" fill="currentColor"/></svg></a>' +
      '      <a class="social-circle" href="https://x.com/bic_bis" target="_blank" rel="noopener noreferrer" aria-label="X / Twitter" title="X / Twitter">' +
      '        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 5.92c-.63.28-1.3.48-2 .56.72-.43 1.28-1.12 1.54-1.95-.67.4-1.42.69-2.22.85A3.5 3.5 0 0016.5 4c-1.93 0-3.5 1.6-3.5 3.57 0 .28.03.55.09.81-2.9-.15-5.48-1.6-7.2-3.8-.3.5-.47 1.09-.47 1.72 0 1.22.6 2.3 1.52 2.93-.56-.02-1.09-.18-1.55-.44v.05c0 1.66 1.19 3.04 2.77 3.35-.29.08-.59.12-.9.12-.22 0-.44-.02-.65-.06.45 1.36 1.76 2.36 3.31 2.39A7.03 7.03 0 014 19.54c1.96 1.26 4.3 2 6.82 2 8.18 0 12.66-7.3 12.66-13.64v-.62c.86-.63 1.6-1.4 2.18-2.3-.78.36-1.62.62-2.5.73z" fill="currentColor"/></svg></a>' +
      '    </div>' +
      '    <div class="bic-footer-contact">' +
      '      <div class="bic-footer-email">We\u2019d love to hear from you \u2014 <a href="mailto:bicbis95@gmail.com">bicbis95@gmail.com</a></div>' +
      '      <div class="bic-footer-tagline" aria-label="Success Through Labor">Success<br>Through<br>Labor</div>' +
      '    </div>' +
      '    <div class="bic-footer-bottom">' +
      '      <span class="bic-footer-copy">&copy; <span id="year">' + new Date().getFullYear() + '</span> Bodija International College. All rights reserved.</span>' +
      '      <a class="bic-adm-trigger" href="' + (adminHref || '/admin.html') + '"' + (adminId ? ' id="' + adminId + '"' : '') + '>Staff Login</a>' +
      '    </div>' +
      '  </div>' +
      '</footer>';
  }

  function injectFooters() {
    var placeholders = document.querySelectorAll('[data-bic-footer]');
    Array.prototype.forEach.call(placeholders, function (ph) {
      var wrapper = document.createElement('div');
      wrapper.innerHTML = footerHtml(
        ph.getAttribute('data-bic-sub'),
        ph.getAttribute('data-bic-admin-href'),
        ph.getAttribute('data-bic-admin-id'),
        ph.getAttribute('data-bic-footer-theme')
      );
      ph.parentNode.replaceChild(wrapper.firstChild, ph);
    });
  }

  /* ── Footer year(s) ────────────────────────────────────── */
  function fillYears() {
    var year = String(new Date().getFullYear());
    ['year', 'currentYear'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = year;
    });
  }

  /* ── Menu open/close behaviour ─────────────────────────── */
  function qs(selector, ctx) { return (ctx || document).querySelector(selector); }
  function qsa(selector, ctx) { return Array.from((ctx || document).querySelectorAll(selector)); }

  function getFocusable(container) {
    if (!container) return [];
    return qsa("a[href], button:not([disabled]), textarea, input:not([type=hidden]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex=\"-1\"])", container)
      .filter(function (el) { return el.offsetParent !== null || el.getClientRects().length; });
  }

  function initMenuBehaviour() {
    var menu = document.getElementById('mobileMenu');
    if (!menu) return;

    var overlay = menu.querySelector('[data-overlay]');
    var panel = menu.querySelector('.mobile-menu__panel');
    var closeBtns = Array.prototype.slice.call(menu.querySelectorAll('.mobile-menu__close'));
    var openButtons = Array.prototype.slice.call(document.querySelectorAll('[aria-controls="mobileMenu"], [data-mobile-open], .mobile-open, .mobile-toggle, #mobileOpenBtn'));
    var externalCloseButtons = Array.prototype.slice.call(document.querySelectorAll('[data-mobile-close], .mobile-close, .mobile-menu__close, [data-mobile-toggle="close"]'));

    function parseTime(s) {
      if (!s) return 0;
      var str = String(s).trim();
      if (str.indexOf('ms', str.length - 2) !== -1) return parseFloat(str);
      if (str.indexOf('s', str.length - 1) !== -1) return parseFloat(str) * 1000;
      var n = parseFloat(str);
      return isFinite(n) ? n : 0;
    }

    var rootStyles = getComputedStyle(document.documentElement);
    var OVERLAY_DUR = parseTime(rootStyles.getPropertyValue('--overlay-duration')) || 220;
    var PANEL_DUR = parseTime(rootStyles.getPropertyValue('--panel-duration')) || 340;
    var PANEL_DELAY = parseTime(rootStyles.getPropertyValue('--panel-delay')) || 120;
    var OVERLAY_HOLD = parseTime(rootStyles.getPropertyValue('--overlay-hold')) || 0;

    var timeouts = [];
    var lastFocused = null;

    function clearAllTimeouts() { timeouts.forEach(function (i) { clearTimeout(i); }); timeouts = []; }

    function preventScroll(enable) {
      if (enable) { document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden'; }
      else { document.documentElement.style.overflow = ''; document.body.style.overflow = ''; }
    }

    function onKeyDown(e) {
      if (!menu.classList.contains('open')) return;
      if (e.key === 'Escape') { e.preventDefault(); closeMobileMenu(); return; }
      if (e.key === 'Tab') {
        if (!panel) return;
        var focusable = getFocusable(panel);
        if (!focusable.length) { e.preventDefault(); return; }
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    function focusTrap(e) {
      if (!menu.classList.contains('open')) return;
      if (!panel) return;
      if (panel.contains(e.target)) return;
      e.stopPropagation();
      var f = getFocusable(panel);
      if (f.length) f[0].focus(); else panel.focus();
    }

    if (menu.parentElement !== document.body) {
      document.body.appendChild(menu);
      overlay = menu.querySelector('[data-overlay]');
      panel = menu.querySelector('.mobile-menu__panel');
    }

    var openerStateMap = new WeakMap();

    function disableOpenButtons() {
      openButtons.forEach(function (b) {
        if (!b) return;
        var prev = {
          tabindex: b.hasAttribute('tabindex') ? b.getAttribute('tabindex') : null,
          pointerEvents: b.style.pointerEvents || null,
          ariaHidden: b.hasAttribute('aria-hidden') ? b.getAttribute('aria-hidden') : null
        };
        openerStateMap.set(b, prev);
        b.setAttribute('tabindex', '-1');
        b.style.pointerEvents = 'none';
        b.setAttribute('aria-hidden', 'true');
      });
    }

    function restoreOpenButtons() {
      openButtons.forEach(function (b) {
        if (!b) return;
        var prev = openerStateMap.get(b) || {};
        if (prev.tabindex === null || prev.tabindex === undefined) b.removeAttribute('tabindex');
        else b.setAttribute('tabindex', prev.tabindex);
        if (prev.pointerEvents === null || prev.pointerEvents === undefined) b.style.removeProperty('pointer-events');
        else b.style.pointerEvents = prev.pointerEvents;
        if (prev.ariaHidden === null || prev.ariaHidden === undefined) b.removeAttribute('aria-hidden');
        else b.setAttribute('aria-hidden', prev.ariaHidden);
        openerStateMap.delete(b);
      });
    }

    function overlayClick() { closeMobileMenu(); }

    function openMobileMenu() {
      if (menu.classList.contains('open')) return;
      lastFocused = document.activeElement;
      menu.classList.add('open');
      menu.setAttribute('aria-hidden', 'false');
      if (panel) panel.setAttribute('aria-hidden', 'false');

      disableOpenButtons();

      if (overlay) overlay.classList.remove('overlay-in');
      if (panel) panel.classList.remove('panel-in');
      void (overlay && overlay.offsetWidth);
      if (overlay) overlay.classList.add('overlay-in');

      var t = setTimeout(function () {
        if (panel) {
          panel.classList.add('panel-in');
          var closeBtn = panel.querySelector('.mobile-menu__close');
          if (closeBtn) closeBtn.focus({ preventScroll: true });
        }
      }, PANEL_DELAY);
      timeouts.push(t);

      document.addEventListener('focus', focusTrap, true);
      document.addEventListener('keydown', onKeyDown);
      if (overlay) overlay.addEventListener('click', overlayClick);
      preventScroll(true);
      openButtons.forEach(function (b) { if (b && b.setAttribute) b.setAttribute('aria-expanded', 'true'); });
    }

    function closeMobileMenu() {
      if (!menu.classList.contains('open')) return;
      clearAllTimeouts();
      if (panel) panel.classList.remove('panel-in');

      var t1 = setTimeout(function () {
        var tHold = setTimeout(function () {
          if (overlay) overlay.classList.remove('overlay-in');
          var tHide = setTimeout(function () {
            menu.classList.remove('open');
            menu.setAttribute('aria-hidden', 'true');
            if (panel) panel.setAttribute('aria-hidden', 'true');

            restoreOpenButtons();

            preventScroll(false);
            if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus({ preventScroll: true });
          }, OVERLAY_DUR);
          timeouts.push(tHide);
        }, OVERLAY_HOLD);
        timeouts.push(tHold);
      }, PANEL_DUR);
      timeouts.push(t1);

      document.removeEventListener('focus', focusTrap, true);
      document.removeEventListener('keydown', onKeyDown);
      if (overlay) overlay.removeEventListener('click', overlayClick);
      openButtons.forEach(function (b) { if (b && b.setAttribute) b.setAttribute('aria-expanded', 'false'); });
    }

    openButtons.forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function (ev) { ev.preventDefault(); openMobileMenu(); });
      btn.addEventListener('keydown', function (ev) {
        var k = ev.key;
        if (k === 'Enter' || k === ' ' || k === 'Spacebar') { ev.preventDefault(); openMobileMenu(); }
      });
    });

    externalCloseButtons.concat(closeBtns).forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function (ev) { ev.preventDefault(); closeMobileMenu(); });
    });

    window.openMobileMenu = openMobileMenu;
    window.closeMobileMenu = closeMobileMenu;
    window.toggleMobileMenu = function () { if (menu.classList.contains('open')) closeMobileMenu(); else openMobileMenu(); };

    (function preloadBg() {
      if (!panel) return;
      var style = getComputedStyle(panel);
      var bg = style.getPropertyValue('background-image') || '';
      var url = '';
      var start = bg.indexOf('url(');
      var end = bg.lastIndexOf(')');
      if (start !== -1 && end !== -1 && end > start) {
        url = bg.slice(start + 4, end).replace(/['"]/g, '');
      }
      if (url) { var img = new Image(); img.src = url; }
    })();
  }

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(function () {
    injectMenus();
    initMenuBehaviour();
    injectFooters();
    fillYears();
  });
})();
