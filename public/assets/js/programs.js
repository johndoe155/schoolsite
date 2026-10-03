(function () {
(function () {
    'use strict';

    // ── Hero entrance ──────────────────────────────
    window.addEventListener('load', function () {
      var hero = document.querySelector('.hero');
      if (hero) {
        requestAnimationFrame(function () { hero.classList.add('loaded'); });
      }
    });

    // ── Nav scroll state ───────────────────────────
    var nav = document.getElementById('siteNav');
    if (nav) {
      var lastScroll = 0;
      window.addEventListener('scroll', function () {
        var y = window.scrollY;
        nav.classList.toggle('scrolled', y > 60);
        lastScroll = y;
      }, { passive: true });
    }

    // ── Scroll reveal ──────────────────────────────
    if ('IntersectionObserver' in window) {
      var revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

      document.querySelectorAll('.reveal, .reveal-left').forEach(function (el) {
        revealObserver.observe(el);
      });
    } else {
      document.querySelectorAll('.reveal, .reveal-left').forEach(function (el) {
        el.classList.add('is-visible');
      });
    }

    // ── Program cards: click to scroll ────────────
    document.querySelectorAll('.prog-card').forEach(function (card) {
      var href = card.querySelector('a[href]');
      if (!href) return;
      var target = href.getAttribute('href');
      card.addEventListener('click', function () { window.location.hash = target; });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.location.hash = target;
        }
      });
    });

    // ── Contact panel toggle ───────────────────────
    var contactBtn   = document.getElementById('contactBtn');
    var contactPanel = document.getElementById('contactPanel');
    var announcer    = document.getElementById('contactAnnouncer');

    function openPanel () {
      var h = contactPanel.scrollHeight;
      contactPanel.style.height = h + 'px';
      contactPanel.setAttribute('aria-hidden', 'false');
      contactBtn.setAttribute('aria-expanded', 'true');
      if (announcer) announcer.textContent = 'Contact details shown';
      contactPanel.addEventListener('transitionend', function onEnd () {
        contactPanel.style.height = 'auto';
        contactPanel.removeEventListener('transitionend', onEnd);
      });
    }
    function closePanel () {
      var h = contactPanel.scrollHeight;
      contactPanel.style.height = h + 'px';
      requestAnimationFrame(function () {
        contactPanel.style.transition = 'height .36s cubic-bezier(.22,.9,.37,1), opacity .3s ease';
        contactPanel.style.height = '0';
        contactPanel.style.opacity = '0';
      });
      contactPanel.setAttribute('aria-hidden', 'true');
      contactBtn.setAttribute('aria-expanded', 'false');
      if (announcer) announcer.textContent = 'Contact details hidden';
      contactPanel.addEventListener('transitionend', function onEnd () {
        contactPanel.style.transition = '';
        contactPanel.removeEventListener('transitionend', onEnd);
      });
    }

    if (contactBtn && contactPanel) {
      contactBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var open = contactPanel.getAttribute('aria-hidden') === 'false';
        if (open) {
          closePanel();
        } else {
          contactPanel.style.opacity = '1';
          contactPanel.style.transition = 'height .4s cubic-bezier(.22,.9,.37,1), opacity .35s ease';
          openPanel();
        }
      });
    }

    // ── Contact form ───────────────────────────────
    var form = document.getElementById('contact-form');
    var msg  = document.getElementById('contact-msg');
    if (form && msg) {
      function say(text, ok) {
        msg.textContent = text;
        msg.style.display = 'block';
        msg.style.color = ok ? '' : '#a11';
      }
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd       = new FormData(form);
        var name     = (fd.get('name')  || '').toString().trim();
        var email    = (fd.get('email') || '').toString().trim();
        var interest = (fd.get('interest') || '').toString().trim();

        if (!name || !email) { say('Please fill in your name and email address.', false); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say('That email address does not look right.', false); return; }

        var submit = form.querySelector('.form-submit');
        if (submit) { submit.disabled = true; submit.textContent = 'Sending…'; }

        fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name,
            email: email,
            subject: 'Admissions enquiry' + (interest ? ' — ' + interest : ''),
            message: 'Program of interest: ' + (interest || 'not specified') +
                     '\nSubmitted from: ' + window.location.pathname
          })
        })
          .then(function (res) {
            return res.json().catch(function () { return {}; })
              .then(function (data) { return { ok: res.ok, data: data }; });
          })
          .then(function (r) {
            if (r.ok) {
              say(r.data.message || 'Thank you — admissions will be in touch within one business day.', true);
              form.reset();
            } else {
              say(r.data.error || 'Something went wrong. Please try again.', false);
            }
          })
          .catch(function () { say('Could not reach the server. Please try again later.', false); })
          .finally(function () {
            if (submit) { submit.disabled = false; submit.textContent = 'Request information'; }
          });
      });
    }

    // ── Footer year ────────────────────────────────
    var yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();



  }());
})();
