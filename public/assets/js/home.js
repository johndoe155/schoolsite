(function () {
window.__CMS__ = {
      siteTitle: "Bodija International College",
      hero: {
        eyebrow: "Welcome",
        title: "Success Through Labour",
        kicker: "Empowering future leaders through excellence in education and character.",
        ctaPrimary: "Explore Programs",
        ctaSecondary: "Admissions",
        video: "/assets/media/hero.mp4",
        poster: "/assets/media/heroo.jpg",
        videoDesktop: "/assets/media/hero-desktop.mp4",
        posterDesktop: "/assets/media/hero-desktop.jpg",
        // NEW: 5 images shown on an endless autonomous crossfade loop
        // once the hero video finishes playing. Replace with real filenames.
        slideshow: [
          "/assets/media/princi.jpg",
          "/assets/img/gallery/images__9_-1775131989808.jpg",
          "/assets/img/gallery/science1-1775132543527.jpg",
          "/assets/img/gallery/programs1-1775123425922.jpg",
          "/assets/img/bifa.jpg"
        ]
      },
      programs: [
        { title: "Science & Technology", description: "State-of-the-art STEM labs, robotics, and coding bootcamps.", color: "#05014a" },
        { title: "Arts & Humanities", description: "Fostering creative expression through visual arts, music, and literature.", color: "#857dfc" },
        { title: "Business & Economics", description: "Entrepreneurship programs designed to build financial literacy.", color: "#d97706" }
      ]
    };
})();

(function () {
(function loadPublicGallery() {
  fetch('/api/gallery')
    .then(r => r.ok ? r.json() : Promise.reject('fetch failed'))
    .then(items => {
      const grid = document.getElementById('publicGalleryGrid');
      const loader = document.getElementById('galleryLoader');
      if (!items || !items.length) {
        if (loader) loader.textContent = 'No gallery items yet.';
        return;
      }
      if (loader) loader.remove();

      items.forEach(item => {
        const cover   = item.images && item.images[0] ? item.images[0] : '/assets/img/logo.png';
        const count   = item.images ? item.images.length : 0;
        const archive = JSON.stringify(item.images || []);

        const div = document.createElement('div');
        div.className = 'flex flex-col w-full';
        div.innerHTML = `
          <button
            class="gallery-item group relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-800 focus:outline-none focus:ring-4 focus:ring-brand-yellow/50"
            data-src="${esc(cover)}"
            data-archive='${archive.replace(/'/g,"&#39;")}'
            data-title="${esc(item.title)}"
            data-sub="${esc(item.subtitle)}"
            aria-label="View the ${esc(item.title)} gallery — ${count} photo${count !== 1 ? 's' : ''}">
            <img src="${esc(cover)}" alt="" loading="lazy" decoding="async" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
              <div class="text-left translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                <h3 class="text-xl font-bold font-serif text-white">${esc(item.title)}</h3>
                <p class="text-sm text-brand-yellow">View ${count} Photo${count !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </button>
          <figcaption class="gallery-caption">
            <span class="gallery-caption__rule" aria-hidden="true"></span>
            <h3 class="gallery-caption__title">${esc(item.title)}</h3>
            <p class="gallery-caption__sub">${esc(item.subtitle)}</p>
          </figcaption>`;
        grid.appendChild(div);
      });

      if (typeof initGallery === 'function') initGallery();
    })
    .catch(() => {
      const loader = document.getElementById('galleryLoader');
      if (loader) loader.textContent = '';
    });

  function esc(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
})();

(function () {
/* ══════════════════════════════════════════════════════════════════════════
   Gallery viewer

   One implementation, one state machine. The portal previously shipped two
   competing lightboxes (one here, one in main.js); they both bound the same
   buttons, and the removed one computed its index as
   `(currentIndex + 1) % currentArchive.length`, which is NaN the moment the
   archive is empty — the "NaN / 0" the count indicator used to show. It also
   latched a module-level `isLoading` flag: one slow or failed image left the
   spinner running forever and swallowed every later Next/Prev click.

   The rules this version follows, so neither bug can come back:

   1. An index is only ever produced by `normalizeIndex()`, which clamps a
      finite integer into 0..n-1 with n ≥ 1. No arithmetic on possibly-empty
      arrays, ever.
   2. Nothing is latched globally. A monotonically increasing token identifies
      the current request; stale callbacks compare tokens and drop out.
   3. Every image load settles — success, error, or a timeout guard — and each
      of those clears the loading state. A hung request can no longer hold the
      UI.
   4. Failures degrade to a placeholder frame instead of an empty stage, and
      navigation stays available throughout.
   5. An empty or malformed archive never opens the viewer at all.
   ══════════════════════════════════════════════════════════════════════════ */
    (function () {
      'use strict';

      const root = document.getElementById('lightbox');
      if (!root || !root.classList.contains('lb')) return;   // some other page's dialog

      const els = {
        frameA: document.getElementById('lbImg'),
        frameB: document.getElementById('lbImgNext'),
        title: document.getElementById('lbTitle'),
        subtitle: document.getElementById('lbSubtitle'),
        counter: document.getElementById('lbCounter'),
        status: document.getElementById('lbStatus'),
        close: document.getElementById('lbClose'),
        prev: document.getElementById('lbPrev'),
        next: document.getElementById('lbNext'),
      };
      if (!els.frameA || !els.frameB || !els.close) return;

      /* Every load settles: onload, onerror, or this guard. Read from the
         dialog so a slow connection (or the test harness) can lengthen it
         without editing the script. */
      const LOAD_GUARD_MS = Number(root.getAttribute('data-load-guard')) || 12000;
      const PLACEHOLDER =
        'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">' +
          '<rect width="1200" height="800" fill="#161519"/>' +
          '<text x="600" y="392" fill="#7d7a85" font-family="system-ui, sans-serif" ' +
          'font-size="26" text-anchor="middle">Image unavailable</text>' +
          '<text x="600" y="428" fill="#565360" font-family="system-ui, sans-serif" ' +
          'font-size="18" text-anchor="middle">It may have been removed from the gallery</text>' +
          '</svg>'
        );

      const state = {
        archive: [],
        index: 0,
        token: 0,
        open: false,
        frontIsA: true,
        invoker: null,
        guard: 0,
        // Strong references to in-flight preloads: a garbage-collected Image
        // can have its request dropped, and its handlers never fire.
        preloads: [],
      };

      /* ── small, total helpers ───────────────────────────────────────────── */

      function normalizeIndex(value, length) {
        const n = Math.max(1, Math.floor(length) || 1);
        const i = Math.floor(Number(value));
        if (!Number.isFinite(i)) return 0;
        return ((i % n) + n) % n;
      }

      function cleanArchive(archive) {
        if (!Array.isArray(archive)) return [];
        return archive
          .filter((src) => typeof src === 'string' && src.trim() !== '')
          .map((src) => src.trim());
      }

      /** The two stacked frames: the front one is what the visitor sees. */
      function front() { return state.frontIsA ? els.frameA : els.frameB; }
      function back() { return state.frontIsA ? els.frameB : els.frameA; }

      function setLoading(on) { root.classList.toggle('is-loading', !!on); }

      function lockScroll(on) {
        document.documentElement.style.overflow = on ? 'hidden' : '';
        document.body.style.overflow = on ? 'hidden' : '';
      }

      function closeNavMenu() {
        const nav = document.querySelector('.bic-nav');
        if (nav) nav.classList.remove('bic-nav--open');
        const menu = document.querySelector('.bic-menu');
        if (menu) menu.classList.remove('bic-menu--open', 'bic-menu--live');
      }

      /** Every write to the counter goes through here: integers only. */
      function writeCount(index, length) {
        const n = Math.max(0, Math.floor(length) || 0);
        if (!els.counter) return;
        if (n === 0) { els.counter.textContent = '\u2014'; return; }
        els.counter.textContent = (normalizeIndex(index, n) + 1) + ' / ' + n;
      }

      function announce(index, length, label) {
        if (!els.status) return;
        const n = Math.max(0, Math.floor(length) || 0);
        els.status.textContent = !n ? '' :
          label + ': image ' + (normalizeIndex(index, n) + 1) + ' of ' + n;
      }

      /* ── rendering ──────────────────────────────────────────────────────── */

      /* Warm the neighbours so the next click is instant. Kept in `preloads`. */
      function precache(index, length) {
        [index + 1, index - 1].forEach((i) => {
          const src = state.archive[normalizeIndex(i, length)];
          if (!src) return;
          const img = new Image();
          img.decoding = 'async';
          img.src = src;
          state.preloads.push(img);
          if (state.preloads.length > 6) state.preloads.splice(0, state.preloads.length - 6);
        });
      }

      function render(nextIndex) {
        const length = state.archive.length;
        if (length === 0) { writeCount(0, 0); return; }

        state.index = normalizeIndex(nextIndex, length);
        const src = state.archive[state.index];
        const label = (els.title && els.title.textContent) || 'Gallery';
        const alt = label + ' \u2014 image ' + (state.index + 1) + ' of ' + length;

        writeCount(state.index, length);
        announce(state.index, length, label);
        root.setAttribute('data-count', String(length));

        const token = ++state.token;
        const target = back();
        const previous = front();
        setLoading(true);

        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          clearTimeout(state.guard);
          if (token !== state.token) return;     // a newer navigation owns the stage
          target.src = ok ? src : PLACEHOLDER;
          target.alt = ok ? alt : alt + ' (unavailable)';
          // Promote on the next frame so the browser paints the decoded image
          // and the crossfade has two states to move between.
          requestAnimationFrame(() => {
            target.classList.add('is-front');
            target.setAttribute('aria-hidden', 'false');
            previous.classList.remove('is-front');
            previous.setAttribute('aria-hidden', 'true');
            state.frontIsA = !state.frontIsA;
            setLoading(false);
          });
          precache(state.index, length);
        };

        const probe = new Image();
        probe.decoding = 'async';
        state.preloads.push(probe);
        probe.onload = () => finish(true);
        probe.onerror = () => finish(false);
        state.guard = setTimeout(() => finish(false), LOAD_GUARD_MS);
        probe.src = src;
      }

      /* ── open / close ───────────────────────────────────────────────────── */

      function open(archive, index, meta) {
        const list = cleanArchive(archive);
        if (list.length === 0) return false;      // nothing to show: stay closed
        const info = meta || {};
        state.archive = list;
        state.index = normalizeIndex(index, list.length);
        state.invoker = info.invoker || document.activeElement;
        if (els.title) els.title.textContent = info.title || '';
        if (els.subtitle) els.subtitle.textContent = info.subtitle || '';
        writeCount(state.index, list.length);
        closeNavMenu();
        document.documentElement.classList.add('lb-open');
        root.setAttribute('data-count', String(list.length));
        root.classList.add('is-open');
        root.setAttribute('aria-hidden', 'false');
        lockScroll(true);
        state.open = true;
        render(state.index);
        if (els.close.focus) els.close.focus();
        return true;
      }

      function close() {
        if (!state.open) return;
        state.open = false;
        state.token += 1;                          // cancel anything in flight
        clearTimeout(state.guard);
        setLoading(false);
        root.classList.remove('is-open');
        root.setAttribute('aria-hidden', 'true');
        document.documentElement.classList.remove('lb-open');
        lockScroll(false);
        writeCount(0, 0);
        if (els.status) els.status.textContent = '';
        const backTo = state.invoker;
        state.invoker = null;
        if (backTo && typeof backTo.focus === 'function') backTo.focus();
      }

      function step(delta) {
        if (!state.open || state.archive.length < 2) return;
        render(state.index + delta);
      }

      /* ── events ─────────────────────────────────────────────────────────── */

      if (els.close) els.close.addEventListener('click', close);
      if (els.prev) els.prev.addEventListener('click', () => step(-1));
      if (els.next) els.next.addEventListener('click', () => step(1));
      root.addEventListener('click', (e) => {
        if (e.target && e.target.dataset && e.target.dataset.lbClose !== undefined) close();
      });

      document.addEventListener('keydown', (e) => {
        if (!state.open) return;
        switch (e.key) {
          case 'Escape': e.preventDefault(); close(); break;
          case 'ArrowLeft': e.preventDefault(); step(-1); break;
          case 'ArrowRight': e.preventDefault(); step(1); break;
          case 'Home': e.preventDefault(); render(0); break;
          case 'End': e.preventDefault(); render(state.archive.length - 1); break;
          case 'Tab': {
            /* Keep focus inside the dialog: it is the only thing on screen.
               getClientRects() also filters out the nav arrows when a category
               has a single image and CSS has hidden them — a display:none
               button cannot take focus, so including it would let Tab escape
               to the page behind the dialog. */
            const focusables = [].slice
              .call(root.querySelectorAll('button:not([disabled])'))
              .filter((el) => el.getClientRects().length > 0);
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            break;
          }
          default: break;
        }
      });

      let touchStart = null;
      root.addEventListener('touchstart', (e) => {
        touchStart = e.touches && e.touches.length === 1 ? e.touches[0].clientX : null;
      }, { passive: true });
      root.addEventListener('touchend', (e) => {
        if (touchStart === null) return;
        const end = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : touchStart;
        const dx = touchStart - end;
        touchStart = null;
        if (Math.abs(dx) < 45) return;
        step(dx > 0 ? 1 : -1);
      }, { passive: true });

      /** Gallery cards call in here. Exposed for the lightbox test harness. */
      window.openGallery = function (archive, index, meta) { return open(archive, index, meta); };
      window.closeGallery = close;
      window.galleryState = state;

      window.initGallery = function () {
        document.querySelectorAll('.gallery-item').forEach((item) => {
          if (item.dataset.lbBound === '1') return;
          item.dataset.lbBound = '1';
          item.addEventListener('click', (e) => {
            e.preventDefault();
            let archive = null;
            try {
              archive = JSON.parse(item.getAttribute('data-archive') || '[]');
            } catch (err) {
              console.warn('Gallery: could not read this category', err);
              return;
            }
            open(archive, 0, {
              title: item.getAttribute('data-title') || '',
              subtitle: item.getAttribute('data-sub') || '',
              invoker: item,
            });
          });
        });
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initGallery);
      } else {
        window.initGallery();
      }
    })();
})();

(function () {
// Scroll Reveal Observer
      const revealElements = document.querySelectorAll('.reveal-el');
      const observerOptions = {
        root: null,
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
      };

      const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const parent = entry.target.parentElement;
            if(parent && (parent.classList.contains('grid') || parent.id === 'programGrid')) {
                const index = Array.from(parent.children).indexOf(entry.target);
                entry.target.style.transitionDelay = `${index * 150}ms`;
            }
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, observerOptions);

      revealElements.forEach(el => revealObserver.observe(el));

      // Parallax Scroll Effect
      const parallaxLayers = document.querySelectorAll('.parallax-layer');
      window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        parallaxLayers.forEach(layer => {
          const speed = layer.dataset.speed || 0.3;
          const yPos = -(scrolled * speed);
          layer.style.transform = `translateY(${yPos}px)`;
        });
      });

      // Microinteraction: Heart/Like Toggle
      const heartBtns = document.querySelectorAll('.heart-btn');
      heartBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          btn.classList.toggle('liked');
        });
      });

      // Form Submission
      const form = document.getElementById('contactForm');
      const submitBtn = document.getElementById('submitBtn');
      const btnText = document.getElementById('btnText');
      const btnSpinner = document.getElementById('btnSpinner');
      const formStatus = document.getElementById('formStatus');

      if(form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();

          const name = document.getElementById('name').value.trim();
          const email = document.getElementById('email').value.trim();
          const message = document.getElementById('message').value.trim();

          if (!name || !email || !message) {
            formStatus.textContent = 'Please fill in all fields.';
            formStatus.classList.remove('sr-only');
            return;
          }

          submitBtn.classList.add('pointer-events-none', 'opacity-90');
          btnText.textContent = 'Sending...';
          btnSpinner.classList.remove('hidden');
          formStatus.textContent = '';

          try {
            const response = await fetch('/api/contact', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name,
                email,
                subject: `New website enquiry from ${name}`,
                message
              })
            });

            const data = await response.json();

            if (!response.ok) {
              throw new Error(data.error || 'Could not send your message.');
            }

            btnSpinner.classList.add('hidden');
            btnText.textContent = 'Message Sent!';
            formStatus.textContent = 'Thank you — your message has been sent. ' +
              ((window.BIC_INFO && window.BIC_INFO.replySentence) || 'We reply within 2\u20133 business days.');
            formStatus.classList.remove('sr-only');

            setTimeout(() => {
              submitBtn.classList.remove('pointer-events-none', 'opacity-90');
              btnText.textContent = 'Send Message';
              form.reset();
              document.activeElement.blur();
            }, 3500);

          } catch (err) {
            btnSpinner.classList.add('hidden');
            btnText.textContent = 'Send Message';
            submitBtn.classList.remove('pointer-events-none', 'opacity-90');
            formStatus.textContent = err.message || 'Something went wrong. Please try again later.';
            formStatus.classList.remove('sr-only');
          }
        });
      }
})();

(function () {
const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-fadeIn');
        entry.target.classList.remove('opacity-0');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
})();

(function () {
const items = document.querySelectorAll('.slide-in-on-scroll');
const io = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

items.forEach(i => io.observe(i));
})();
