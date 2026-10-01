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
            aria-label="View ${esc(item.title)} Gallery">
            <img src="${esc(cover)}" alt="${esc(item.title)}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
              <div class="text-left translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                <h3 class="text-xl font-bold font-serif text-white">${esc(item.title)}</h3>
                <p class="text-sm text-brand-yellow">View ${count} Photo${count !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </button>
          <div style="font-family: Montserrat;" class="px-2">
            <h3 class="text-xl md:text-2xl text-center text-white mt-6">${esc(item.title)}</h3>
            <p class="text-center text-indigo-300/80 mt-2">${esc(item.subtitle)}</p>
          </div>`;
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
// Gallery Lightbox Script
    (function() {
      'use strict';

      const lightbox = document.getElementById('lightbox');
      const lbImg = document.getElementById('lbImg');
      const lbTitle = document.getElementById('lbTitle');
      const lbCounter = document.getElementById('lbCounter');
      const lbClose = document.getElementById('lbClose');
      const lbPrev = document.getElementById('lbPrev');
      const lbNext = document.getElementById('lbNext');
      const lbLoader = document.getElementById('lbLoader');

      let currentArchive = [];
      let currentIndex = 0;
      let isLoading = false;
      let touchStartX = 0;
      let touchEndX = 0;

      function toggleBodyScroll(disable) {
        if (disable) {
          document.documentElement.style.overflow = 'hidden';
          document.body.style.overflow = 'hidden';
        } else {
          document.documentElement.style.overflow = '';
          document.body.style.overflow = '';
        }
      }

      function showLoader() {
        if (lbLoader) {
          lbLoader.classList.remove('opacity-0');
          lbLoader.classList.add('opacity-100');
        }
        isLoading = true;
      }

      function hideLoader() {
        if (lbLoader) {
          lbLoader.classList.add('opacity-0');
          lbLoader.classList.remove('opacity-100');
        }
        isLoading = false;
      }

      function updateImage(index) {
        if (!currentArchive || currentArchive.length === 0) return;

        currentIndex = (index + currentArchive.length) % currentArchive.length;
        const src = currentArchive[currentIndex];

        if (!src) return;

        showLoader();

        const img = new Image();
        img.onload = () => {
          lbImg.src = src;
          lbImg.alt = 'Gallery image ' + (currentIndex + 1);
          hideLoader();
        };
        img.onerror = () => {
          lbImg.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23333%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22Arial%22 font-size=%2220%22 fill=%22%23999%22%3EImage failed to load%3C/text%3E%3C/svg%3E';
          hideLoader();
        };
        img.src = src;

        if (lbCounter) {
          lbCounter.textContent = (currentIndex + 1) + ' / ' + currentArchive.length;
        }
      }

      function openLightbox(archive, index = 0) {
        if (!lightbox || !archive || archive.length === 0) return;

        currentArchive = archive;
        currentIndex = index;

        lightbox.classList.remove('hidden');
        lightbox.setAttribute('aria-hidden', 'false');
        toggleBodyScroll(true);

        void lightbox.offsetWidth;
        lightbox.classList.remove('opacity-0');
        lightbox.classList.add('opacity-100');

        updateImage(index);
        lbClose.focus();
      }

      function closeLightbox() {
        if (!lightbox) return;

        lightbox.classList.add('opacity-0');
        lightbox.classList.remove('opacity-100');

        setTimeout(() => {
          lightbox.classList.add('hidden');
          lightbox.setAttribute('aria-hidden', 'true');
          toggleBodyScroll(false);
        }, 300);
      }

      function nextImage() {
        if (isLoading) return;
        updateImage(currentIndex + 1);
      }

      function prevImage() {
        if (isLoading) return;
        updateImage(currentIndex - 1);
      }

      function handleTouchStart(e) {
        touchStartX = e.changedTouches[0].screenX;
      }

      function handleTouchEnd(e) {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
      }

      function handleSwipe() {
        const diff = touchStartX - touchEndX;
        const threshold = 50;

        if (Math.abs(diff) > threshold) {
          if (diff > 0) {
            nextImage();
          } else {
            prevImage();
          }
        }
      }

      if (lbClose) lbClose.addEventListener('click', closeLightbox);
      if (lbPrev) lbPrev.addEventListener('click', prevImage);
      if (lbNext) lbNext.addEventListener('click', nextImage);

      if (lightbox) {
        lightbox.addEventListener('click', (e) => {
          if (e.target === lightbox) {
            closeLightbox();
          }
        });
      }

      document.addEventListener('keydown', (e) => {
        if (lightbox.classList.contains('hidden')) return;

        switch (e.key) {
          case 'Escape':
            e.preventDefault();
            closeLightbox();
            break;
          case 'ArrowLeft':
            e.preventDefault();
            prevImage();
            break;
          case 'ArrowRight':
            e.preventDefault();
            nextImage();
            break;
        }
      });

      if (lightbox) {
        lightbox.addEventListener('touchstart', handleTouchStart, false);
        lightbox.addEventListener('touchend', handleTouchEnd, false);
      }

      window.initGallery = function() {
        const galleryItems = document.querySelectorAll('.gallery-item');
        galleryItems.forEach(item => {
          const clone = item.cloneNode(true);
          item.parentNode.replaceChild(clone, item);
        });

        document.querySelectorAll('.gallery-item').forEach(item => {
          item.addEventListener('click', (e) => {
            e.preventDefault();
            const archiveStr = item.getAttribute('data-archive');
            const title = item.getAttribute('data-title');
            const subtitle = item.getAttribute('data-sub');

            try {
              const archive = JSON.parse(archiveStr);
              if (lbTitle) lbTitle.textContent = title;
              openLightbox(archive, 0);
            } catch (err) {
              console.error('Failed to parse gallery archive:', err);
            }
          });

          item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              item.click();
            }
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
            formStatus.textContent = 'Thank you — your message has been sent.';
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
