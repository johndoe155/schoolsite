/*
  Bodija International College - Main Script
  Contains: Loader, CMS Hydration, Hero Logic (Video->Photo), Mobile Menu, Lightbox, Form Handling
*/

document.addEventListener('DOMContentLoaded', () => {
  
  // --- Global Constants ---
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  // --- 1. Loader Logic ---
  const loader = document.getElementById('loader');

  const hideLoader = () => {
    if (!loader) return;
    loader.style.opacity = '0';
    setTimeout(() => {
      loader.setAttribute('aria-hidden', 'true');
      loader.style.display = 'none';
    }, 600);
  };

  const showLoader = () => {
    if (!loader) return;
    // ensure the loader is visible (some setups might set display: none in CSS)
    loader.style.display = '';
    loader.setAttribute('aria-hidden', 'false');
    // force full opacity so the fade works predictably
    loader.style.opacity = '1';
  };

  // Wait for full page load, initialize hero, and only hide loader when hero is ready.
  window.addEventListener('load', () => {
    // Make sure loader is visible briefly to avoid flicker
    showLoader();

    // initHeroAnimation now returns a Promise that resolves when the hero (video or poster) is ready.
    Promise.resolve()
      .then(() => initHeroAnimation())
      .then(() => {
        // small buffer for a smooth transition
        setTimeout(hideLoader, 400);
      })
      .catch((err) => {
        // If something fails, log and still remove loader after a fallback delay
        console.error('Hero initialization failed:', err);
        setTimeout(hideLoader, 800);
      });
  });

  // --- 2. CMS Hydration ---
  const hydrateCMS = () => {
    const cms = window.__CMS__;
    if (!cms) return;

    // Text Content
    const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.innerHTML = val; };
    setTxt('heroEyebrow', cms.hero.eyebrow);
    setTxt('heroTitle', cms.hero.title);
    setTxt('heroKicker', cms.hero.kicker);
    
    const btn1 = document.getElementById('ctaPrimary');
    const btn2 = document.getElementById('ctaSecondary');
    if(btn1) btn1.querySelector('span').textContent = cms.hero.ctaPrimary;
    if(btn2) btn2.querySelector('span').textContent = cms.hero.ctaSecondary;

// Program Grid (Your existing code)
const progGrid = document.getElementById('programGrid');
if (progGrid && cms.programs) {
  progGrid.innerHTML = cms.programs.map((p, i) => `
    <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-md card-spring reveal-el" style="transition-delay: ${i * 150}ms;">
      <div class="w-2 h-2 rounded-full mb-6" style="background-color: ${p.color}"></div>
      <h3 class="text-xl font-bold font-display text-slate-900 mb-3">${p.title}</h3>
      <p class="text-slate-600 leading-relaxed">${p.description}</p>
    </div>
  `).join('');
}

// --- NEW: Intersection Observer to trigger the animation ---

// Set up the observer
const observerOptions = {
  root: null, // use viewport
  rootMargin: '0px',
  threshold: 0.1 // Trigger when 10% of the element is visible
};

const fadeObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      // Add the class to trigger the CSS transition
      entry.target.classList.add('is-visible');
      // Optional: Stop observing once animated so it only happens once
      observer.unobserve(entry.target); 
    }
  });
}, observerOptions);

// Grab all newly created elements and observe them
const revealElements = progGrid.querySelectorAll('.reveal-el');
revealElements.forEach(el => fadeObserver.observe(el));

  };
  hydrateCMS();

  // --- 3. Hero Video -> Photo Mechanism (Adaptive Desktop/Mobile) ---
  //
  // DESKTOP ASSET MANAGEMENT STRATEGY
  // ─────────────────────────────────
  // • Uses window.matchMedia('(min-width: 1024px)') to determine the correct
  //   asset (mobile vertical vs. desktop horizontal) BEFORE any network request.
  // • Only the asset matching the current viewport is ever downloaded — the
  //   other is never fetched, preserving performance on both device classes.
  // • A 'change' listener on the MediaQueryList detects resize crosses and
  //   swaps assets dynamically without a page reload, using the same lazy-load
  //   strategy: old video is torn down, new one is requested only on demand.
  // • Falls back gracefully to the poster image if video is unavailable or
  //   autoplay is blocked (existing behaviour preserved for mobile).
  // ─────────────────────────────────

  function initHeroAnimation() {
    return new Promise((resolve) => {
      const heroPoster    = document.getElementById('heroPoster');
      const videoContainer = document.getElementById('videoContainer');
      const cms           = window.__CMS__;

      // ── Media-query for the desktop breakpoint ──────────────────────────
      const desktopMQ = window.matchMedia('(min-width: 1024px)');

      // ── One-time "hero ready" resolver ──────────────────────────────────
      let resolved = false;
      const markReady = () => {
        if (resolved) return;
        resolved = true;
        if (heroPoster) heroPoster.style.opacity = '1';
        // Stagger hero text animations after assets are ready
        ['heroEyebrow', 'heroTitle', 'heroKicker', 'heroButtons'].forEach((id, idx) => {
          const el = document.getElementById(id);
          if (el) {
            setTimeout(() => {
              el.classList.remove('opacity-0', 'translate-y-8');
              el.classList.add('transition-all', 'duration-700', 'ease-out');
            }, 300 + idx * 150);
          }
        });
        resolve();
      };

      // ── Asset selector: choose sources based on viewport ─────────────────
      const getAssets = (isDesktop) => {
        const h = cms && cms.hero ? cms.hero : {};
        return {
          video : isDesktop && h.desktopVideo  ? h.desktopVideo  : (h.video  || null),
          poster: isDesktop && h.desktopPoster ? h.desktopPoster : (h.poster || null),
        };
      };

      // ── Core video loader: creates/replaces the <video> element ──────────
      //    Accepts current poster element so the swap is always coordinated.
      const loadVideo = (src, posterEl, container) => {
        // Tear down any existing video first (prevents double-download)
        const existing = container.querySelector('video');
        if (existing) {
          existing.pause();
          existing.removeAttribute('src');
          existing.load();          // abort pending network request
          existing.remove();
        }
        if (!src) return null;

        const vid = document.createElement('video');
        vid.src          = src;
        vid.muted        = true;
        vid.autoplay     = true;
        vid.playsInline  = true;
        vid.preload      = 'auto';
        vid.className    = 'absolute inset-0 w-full h-full object-cover transition-opacity duration-1000';
        vid.style.opacity = '0';     // hidden until canplay fires

        const onCanPlay = () => {
          vid.style.opacity = '1';
          if (posterEl) posterEl.style.opacity = '0';
          if (!resolved) markReady();
        };
        const onError = () => {
          if (posterEl) posterEl.style.opacity = '1';
          if (!resolved) markReady();
        };
        const onEnded = () => {
          vid.style.opacity = '0';
          if (posterEl) posterEl.style.opacity = '1';
          setTimeout(() => { if (vid.parentNode) vid.remove(); }, 1000);
        };

        vid.addEventListener('canplay', onCanPlay, { once: true });
        vid.addEventListener('error',   onError,   { once: true });
        vid.addEventListener('ended',   onEnded,   { once: true });

        container.appendChild(vid);

        vid.play().catch(() => {
          // Autoplay blocked (e.g. data-saver, aggressive browser policy)
          if (posterEl) posterEl.style.opacity = '1';
          if (!resolved) markReady();
        });

        // Safety net: resolve even if canplay/error never fires
        setTimeout(() => {
          if (!resolved) {
            vid.readyState >= 3 ? onCanPlay() : onError();
          }
        }, 3000);

        return vid;
      };

      // ── Initial load ─────────────────────────────────────────────────────
      const initAssets = getAssets(desktopMQ.matches);

      // Set poster immediately (zero-cost, prevents blank frame flash)
      if (heroPoster && initAssets.poster) {
        heroPoster.style.backgroundImage = `url('${initAssets.poster}')`;
      }

      if (!prefersReduced && videoContainer && initAssets.video) {
        loadVideo(initAssets.video, heroPoster, videoContainer);
      } else {
        // Reduced-motion or no video configured: show poster only
        if (heroPoster) heroPoster.style.opacity = '1';
        setTimeout(markReady, 80);
      }

      // ── Viewport-change handler: lazy-swap on breakpoint crossing ─────────
      // Only fires when the viewport actually crosses 1024 px — not on every
      // resize event — so the overhead is negligible.
      const onViewportChange = (e) => {
        if (!cms || !cms.hero) return;
        const swapAssets = getAssets(e.matches);

        // Update poster src for the new context
        if (heroPoster && swapAssets.poster) {
          heroPoster.style.backgroundImage = `url('${swapAssets.poster}')`;
        }

        if (!prefersReduced && videoContainer) {
          if (swapAssets.video) {
            // Fade poster back in briefly during the swap to avoid a black frame
            if (heroPoster) heroPoster.style.opacity = '1';
            loadVideo(swapAssets.video, heroPoster, videoContainer);
          } else {
            // No video for this context — remove any playing video, show poster
            const existing = videoContainer.querySelector('video');
            if (existing) {
              existing.style.opacity = '0';
              setTimeout(() => { if (existing.parentNode) existing.remove(); }, 1000);
            }
            if (heroPoster) heroPoster.style.opacity = '1';
          }
        }
      };

      // Use the modern addEventListener if available; fall back to addListener
      if (desktopMQ.addEventListener) {
        desktopMQ.addEventListener('change', onViewportChange);
      } else {
        // Safari < 14 legacy path
        desktopMQ.addListener(onViewportChange);
      }
    });
  }

  // --- 4. Mobile Menu ---

  // --- 5. Gallery Lightbox ---
  const lightbox = document.getElementById('lightbox');
  const lbImg = document.getElementById('lbImg');
  const lbTitle = document.getElementById('lbTitle');
  const lbCounter = document.getElementById('lbCounter');
  const lbLoader = document.getElementById('lbLoader');
  let currentArchive = [];
  let currentIndex = 0;

  const openLightbox = (archive, index, title) => {
    currentArchive = archive;
    currentIndex = index;
    
    lightbox.classList.remove('hidden');
    // small timeout to allow display:block to apply before opacity transition
    setTimeout(() => lightbox.classList.remove('opacity-0'), 10);
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    
    updateLightboxImage(title);
    document.getElementById('lbClose').focus();
  };

  const closeLightbox = () => {
    lightbox.classList.add('opacity-0');
    setTimeout(() => {
      lightbox.classList.add('hidden');
      lightbox.setAttribute('aria-hidden', 'true');
      lbImg.src = "";
    }, 300);
    document.body.style.overflow = '';
  };

  const updateLightboxImage = (overrideTitle) => {
    const src = currentArchive[currentIndex];
    
    // Show loader, hide img
    lbLoader.style.opacity = '1';
    lbImg.style.opacity = '0.5';

    const imgObj = new Image();
    imgObj.onload = () => {
      lbImg.src = src;
      lbImg.style.opacity = '1';
      lbLoader.style.opacity = '0';
    };
    imgObj.src = src;

    // Update text
    if (overrideTitle) lbTitle.textContent = overrideTitle;
    lbCounter.textContent = `${currentIndex + 1} / ${currentArchive.length}`;
  };

  // Event Listeners for Gallery Items
  document.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const rawArchive = item.dataset.archive;
      const title = item.dataset.title;
      // parse or fallback
      let archive = [];
      try { archive = JSON.parse(rawArchive); } catch(e) { archive = [item.dataset.src]; }
      
      openLightbox(archive, 0, title);
    });
  });

  // Lightbox Navigation
  const nextSlide = () => {
    currentIndex = (currentIndex + 1) % currentArchive.length;
    updateLightboxImage();
  };
  const prevSlide = () => {
    currentIndex = (currentIndex - 1 + currentArchive.length) % currentArchive.length;
    updateLightboxImage();
  };

  document.getElementById('lbNext').addEventListener('click', nextSlide);
  document.getElementById('lbPrev').addEventListener('click', prevSlide);
  document.getElementById('lbClose').addEventListener('click', closeLightbox);
  
  // Lightbox Keyboard & Click-Outside
  lightbox.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft') prevSlide();
    if (e.key === 'Escape') closeLightbox();
  });
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  // --- 6. Contact Form ---
  /* contact form JS (extracted from pra.html) */
(() => {
  // CONFIG
  const FORM_SELECTOR = '#contactForm';
  const SUBMIT_BTN_SELECTOR = 'button[type="submit"]';
  const MIN_NAME_LENGTH = 2;
  const MIN_MESSAGE_LENGTH = 10;
  const INPUT_DEBOUNCE_MS = 300;
  const SIMULATED_NETWORK_MS = 900;

  // Utilities
  const qs = (sel, ctx = document) => ctx.querySelector(sel);
  const qsa = (sel, ctx = document) => Array.from((ctx || document).querySelectorAll(sel));
  const createEl = (tag, attrs = {}, text = '') => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    });
    if (text) el.textContent = text;
    return el;
  };
  const debounce = (fn, wait = 200) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  // Basic validators
  const validators = {
    name: (value) => {
      if (!value) return 'Please enter your name.';
      if (value.length < MIN_NAME_LENGTH) return `Name must be at least ${MIN_NAME_LENGTH} characters.`;
      return '';
    },
    email: (value) => {
      if (!value) return 'Please enter your email address.';
      // simplified but practical email regex
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!re.test(value)) return 'Please enter a valid email address (e.g. you@domain.com).';
      return '';
    },
    message: (value) => {
      if (!value) return 'Please enter a message.';
      if (value.length < MIN_MESSAGE_LENGTH) return `Message is a bit short — try at least ${MIN_MESSAGE_LENGTH} characters.`;
      return '';
    },
  };

  // Form message (global) - improved accessibility
  const form = qs(FORM_SELECTOR);
  if (!form) return; // nothing to do

  // Ensure there is a global message container or create one.
  // It will be placed at the top of the form for assistive tech.
  let formMessage = qs('#formMessage', form);
  if (!formMessage) {
    formMessage = createEl('div', {
      id: 'formMessage',
      'aria-live': 'polite',
      'aria-atomic': 'true',
      role: 'status',
      class: 'form-message sr-only', // sr-only can hide visually while keeping for screen readers
    });
    form.prepend(formMessage);
  }

  const showFormMessage = (text, { isError = true, persistent = false } = {}) => {
    formMessage.classList.remove('sr-only', 'form-message--success', 'form-message--error');
    formMessage.classList.add(isError ? 'form-message--error' : 'form-message--success');
    formMessage.textContent = text;
    // keep visually presented message briefly unless persistent is true
    if (!persistent) {
      setTimeout(() => {
        // fade back to sr-only to avoid distracting users after a moment
        if (formMessage) formMessage.classList.add('sr-only');
      }, 5000);
    }
  };

  // Create inline error element for a field (if not present)
  const ensureErrorNode = (field) => {
    const name = field.getAttribute('name') || field.id;
    if (!name) return null;
    const id = `err-${name}`;
    let err = qs(`#${id}`, form);
    if (!err) {
      err = createEl('div', {
        id,
        class: 'field-error sr-only',
        role: 'alert',
        'aria-live': 'polite',
      });
      // place it just after the field for visual users
      field.insertAdjacentElement('afterend', err);
    }
    return err;
  };

  // Apply or clear field error state
  const setFieldError = (field, message) => {
    const err = ensureErrorNode(field);
    if (message) {
      field.classList.add('field--error'); // styling hook
      field.setAttribute('aria-invalid', 'true');
      if (err) {
        err.classList.remove('sr-only');
        err.textContent = message;
        field.setAttribute('aria-describedby', err.id);
      }
    } else {
      field.classList.remove('field--error');
      field.removeAttribute('aria-invalid');
      if (err) {
        err.classList.add('sr-only');
        err.textContent = '';
      }
      // remove aria-describedby if it points to our error node and it's empty
      const desc = field.getAttribute('aria-describedby');
      if (desc === (err && err.id)) field.removeAttribute('aria-describedby');
    }
  };

  // Validate a single field by name
  const validateByField = (field) => {
    if (!field) return '';
    const name = field.getAttribute('name');
    const val = (field.value || '').toString().trim();
    const validator = validators[name] || (() => '');
    const error = validator(val);
    setFieldError(field, error);
    return error;
  };

  // Validate all tracked fields: return array of invalid fields
  const validateAll = (fields) => {
    const invalids = [];
    fields.forEach((f) => {
      const err = validateByField(f);
      if (err) invalids.push(f);
    });
    return invalids;
  };

  // Collect fields we care about now (name, email, message)
  const trackedFields = ['name', 'email', 'message']
    .map((n) => qs(`[name="${n}"]`, form))
    .filter(Boolean);

  // Wire up events: input (debounced) + blur (immediate)
  trackedFields.forEach((field) => {
    const debouncedValidate = debounce(() => validateByField(field), INPUT_DEBOUNCE_MS);
    field.addEventListener('input', debouncedValidate, { passive: true });
    field.addEventListener('blur', () => validateByField(field));
    // mark touched to style differently if desired
    field.addEventListener('focus', () => field.classList.add('field--touched'));
  });

  // Submit handling
  const submitBtn = qs(SUBMIT_BTN_SELECTOR, form);
  const setSubmittingState = (isSubmitting) => {
    if (!submitBtn) return;
    submitBtn.disabled = isSubmitting;
    if (isSubmitting) {
      submitBtn.classList.add('btn--sending'); // CSS hook for subtle microinteraction
      submitBtn.setAttribute('aria-busy', 'true');
      submitBtn.dataset.origText = submitBtn.textContent;
      submitBtn.textContent = 'Sending…';
    } else {
      submitBtn.classList.remove('btn--sending');
      submitBtn.removeAttribute('aria-busy');
      if (submitBtn.dataset.origText) submitBtn.textContent = submitBtn.dataset.origText;
      delete submitBtn.dataset.origText;
    }
  };

  const focusFirstInvalid = (fields) => {
    if (fields && fields.length) {
      fields[0].focus({ preventScroll: true });
    }
  };

  const handleSuccess = (message = 'Thanks — your message has been sent.') => {
    setSubmittingState(false);
    form.reset();
    // clear field errors
    trackedFields.forEach((f) => setFieldError(f, ''));
    showFormMessage(message, { isError: false, persistent: false });
    // set focus to success message for screen reader users
    formMessage.classList.remove('sr-only');
    formMessage.focus?.();
  };

  const handleFailure = (message = 'Something went wrong. Please try again later.') => {
    setSubmittingState(false);
    showFormMessage(message, { isError: true, persistent: false });
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    // re-validate all fields synchronously
    const invalids = validateAll(trackedFields);
    if (invalids.length) {
      showFormMessage('Please review the highlighted fields and fix any errors.', { isError: true, persistent: false });
      focusFirstInvalid(invalids);
      return;
    }

    // pass validation -> submit
    setSubmittingState(true);

    // Build payload
    const data = new FormData(form);

    // If form.action exists, try a fetch POST (guarded)
    const action = form.getAttribute('action') || '';
    const method = (form.getAttribute('method') || 'POST').toUpperCase();

    try {
      if (action) {
        // Optional: send as JSON if preferred. Here we submit as form-encoded.
        const fetchOpts = {
          method: method,
          body: method === 'GET' ? undefined : data,
          headers: {}, // let browser set content-type for FormData
        };

        // Small timeout for microinteraction (still awaiting network)
        const controller = new AbortController();
        const signal = controller.signal;
        fetchOpts.signal = signal;

        // Optionally implement a client-side timeout (e.g. 12s); omitted for brevity
        const resp = await fetch(action, fetchOpts);
        if (!resp.ok) {
          // try to parse server message
          let serverMsg;
          try {
            const j = await resp.json();
            serverMsg = j && j.message;
          } catch (e) {
            serverMsg = null;
          }
          throw new Error(serverMsg || `Server returned ${resp.status}`);
        }
        // success
        handleSuccess('Thanks — your message has been sent.');
      } else {
        // no action provided — simulate network for demo/local testing
        await new Promise((r) => setTimeout(r, SIMULATED_NETWORK_MS));
        handleSuccess('Thanks — your message has been sent.');
      }
    } catch (err) {
      console.error('Contact form submit error:', err);
      handleFailure('We couldn’t send your message. Please try again or email us directly.');
    }
  });

  // Optional: keyboard "Enter" submit from multiline fields handled by native form
  // Extra: expose a small API on the form element for testing or custom behavior
  form.contactValidation = {
    validateField: (name) => {
      const fld = qs(`[name="${name}"]`, form);
      return fld ? validateByField(fld) : null;
    },
    validateAll: () => validateAll(trackedFields),
  };
})();

  // --- 7. Header Scroll Effect ---
  window.addEventListener('scroll', () => {
    const header = document.getElementById('mainHeader');
    const brandBtn = document.querySelector('.brand-btn');
    if (window.scrollY > 100) {
      header.classList.add('bg-white/90', 'backdrop-blur-md', 'shadow-sm');
      header.querySelectorAll('nav a, span.font-semibold').forEach(el => {
        el.classList.remove('text-white', 'mix-blend-difference');
        el.classList.add('text-slate-900');
      });
      brandBtn.classList.add('scrolled');
    } else {
      header.classList.remove('bg-white/90', 'backdrop-blur-md', 'shadow-sm');
      header.querySelectorAll('nav a, span.font-semibold').forEach(el => {
        el.classList.add('text-white', 'mix-blend-difference');
        el.classList.remove('text-slate-900');
      });
      brandBtn.classList.remove('scrolled');
    }
  });

  // --- 8. Footer Year ---
  document.getElementById('currentYear').textContent = new Date().getFullYear();

});

(function initBICReveal() {
  'use strict';

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.bic-reveal').forEach(el => observer.observe(el));

  // Timeline line draw
  const lineObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        lineObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05 });

  const tLine = document.getElementById('timelineLine');
  if (tLine) lineObserver.observe(tLine);

  // Gold rule shimmer: start after element is visible
  document.querySelectorAll('.gold-rule').forEach(el => {
    const rObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { el.classList.add('animate'); rObs.unobserve(el); }
      });
    }, { threshold: 0.5 });
    rObs.observe(el);
  });
})();
