/* ============================================================
   BIC — Shared layout layer
   ------------------------------------------------------------
   One place for the chrome every page repeats:
     • the shared site footer (injected at [data-bic-footer])
     • footer year injection

   Navigation + the dual-overlay menu live in assets/js/nav.js.
   ============================================================ */
(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(function () {
    injectFooters();
    fillYears();
  });
})();
