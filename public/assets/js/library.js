(function () {
/**
     * MOCK DATA
     * Updated: Now pointing to unique /assets/ locations for all items.
     */
    
    const MOCK_DB = [

    ];

    /**
     * APP LOGIC
     */
    const App = (() => {
      /* title/author/subject/type come from an upload endpoint, so they are
         attacker-controlled. Everything interpolated into HTML goes through
         esc() (text) or attr() (attribute), and URLs are checked too. */
      function esc(v) {
        return String(v ?? '').replace(/[&<>"']/g, c => (
          { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
      }
      const attr = esc;
      function safeUrl(u) {
        const s = String(u ?? '');
        // block javascript:/data: and friends in href/src
        return /^(https?:|\/|\.\/|assets\/)/i.test(s) ? s : '#';
      }

      // Core Elements
      const grid = document.getElementById('results-grid');
      const countLabel = document.getElementById('results-count');
      const announcer = document.getElementById('aria-announcer');
      const searchInput = document.getElementById('q');
      const typeFilter = document.getElementById('filter-type');
      const subjectFilter = document.getElementById('filter-subject');
      const activeFiltersContainer = document.getElementById('active-filters');
      const noFiltersMsg = document.getElementById('no-filters-msg');
      const clearBtn = document.getElementById('clear-all');

      // Lightbox & PDF Elements
      const lightbox = document.getElementById('lightbox');
      const lightboxContent = document.getElementById('lightbox-content');
      const lightboxTitle = document.getElementById('lightbox-title');
      const lightboxClose = document.getElementById('lightbox-close');
      const downloadBtn = document.getElementById('download-btn');
      
      // PDF Viewer Logic Elements
      const pdfWrapper = document.getElementById('pdf-wrapper');
      const pdfScrollContainer = document.getElementById('pdf-scroll-container');
      const pdfLoader = document.getElementById('pdf-loader');
      const pdfError = document.getElementById('pdf-error');
      const errorDownloadLink = document.getElementById('error-download');
      
      // Sidebar / Controls
      const sidebar = document.getElementById('pdf-sidebar');
      const sidebarToggle = document.getElementById('toggle-sidebar');
      const thumbContainer = document.getElementById('thumbnail-container');
      const pageNumDisplay = document.getElementById('page-num');
      const pageCountDisplay = document.getElementById('page-count');
      const btnNext = document.getElementById('next-page');
      const btnPrev = document.getElementById('prev-page');
      const zoomInBtn = document.getElementById('zoom-in');
      const zoomOutBtn = document.getElementById('zoom-out');
      const zoomLevelDisplay = document.getElementById('zoom-level');

      // State
      let state = {
        query: '',
        filters: { type: '', subject: '' },
        items: [...MOCK_DB]
      };

      // PDF State
      let pdfState = {
        doc: null,
        scale: 1.2,
        currentPage: 1,
        isRendering: false,
        pageObserver: null
      };

      // --- Rendering Resources ---

      function createSkeleton() {
        return `
          <div class="resource-card bg-lux-surface border border-lux-border rounded-xl overflow-hidden p-4 space-y-4 animate-pulse">
            <div class="aspect-[3/4] bg-white/5 rounded-lg w-full"></div>
            <div class="space-y-2">
              <div class="h-4 bg-white/10 rounded w-3/4"></div>
              <div class="h-3 bg-white/10 rounded w-1/2"></div>
            </div>
          </div>
        `;
      }

      function renderItems(items) {
        if (items.length === 0) {
          grid.innerHTML = `
            <div class="col-span-full py-16 text-center">
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/5 mb-4">
                <svg class="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <h3 class="text-xl font-serif text-white mb-2">No resources found</h3>
              <p class="text-white/50">Try adjusting your filters or search terms.</p>
            </div>
          `;
          countLabel.textContent = `0 items`;
          return;
        }

        grid.innerHTML = items.map((item, index) => {
          const delay = index * 50; 
          return `
            <article 
              class="resource-card group relative bg-lux-surface border border-lux-border rounded-2xl overflow-hidden flex flex-col h-full animate-fade-up opacity-0"
              style="animation-delay: ${delay}ms"
            >
              <div class="relative aspect-[4/3] overflow-hidden bg-lux-navy">
                <img 
                  src="${attr(safeUrl(item.thumb))}" 
                  alt="Cover of ${esc(item.title)}" 
                  loading="lazy"
                  class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-90 group-hover:opacity-100"
                >
                <div class="absolute inset-0 bg-gradient-to-t from-lux-charcoal via-transparent to-transparent opacity-60"></div>
                <span class="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-white/10">
                  ${esc(item.type)}
                </span>
              </div>
              <div class="p-5 flex flex-col flex-grow">
                <div class="mb-4 flex-grow">
                  <h3 class="font-serif text-lg leading-snug text-lux-cream group-hover:text-lux-gold transition-colors line-clamp-2 mb-2" title="${attr(item.title)}">
                    ${esc(item.title)}
                  </h3>
                  <p class="text-sm text-white/50">${esc(item.author)} • ${esc(item.year)}</p>
                  <p class="text-xs text-white/30 mt-1">${esc(item.subject)}</p>
                </div>
                <div class="flex items-center gap-3 mt-auto pt-4 border-t border-white/5">
                  <button 
                    data-preview data-preview-pdf="${attr(safeUrl(item.pdf))}"
                    class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                    Preview
                  </button>
                  <a 
                    href="${attr(safeUrl(item.pdf))}"
                    download
                    data-download
                    class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-bold bg-lux-gold text-lux-navy hover:bg-lux-gold-light shadow-lg shadow-amber-900/20 transition-all hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    Download
                  </a>
                </div>
              </div>
            </article>
          `;
        }).join('');

        countLabel.textContent = `${items.length} result${items.length !== 1 ? 's' : ''}`;
        announcer.textContent = `${items.length} results found.`;
      }

      // --- PDF Rendering Logic ---

      async function loadPdfDocument(url) {
        resetPdfState();
        pdfLoader.classList.remove('hidden');
        pdfError.classList.add('hidden');
        
        try {
          /* isEvalSupported:false is the documented mitigation for
             CVE-2024-4367: pdf.js otherwise runs arbitrary JS embedded in a
             PDF's glyph data while rendering. Library PDFs are user-uploaded,
             so a crafted file would otherwise execute script in a reader's
             browser on the school's own origin. The cost is slightly slower
             rendering of some fonts. */
          const loadingTask = pdfjsLib.getDocument({ url, isEvalSupported: false });
          pdfState.doc = await loadingTask.promise;
          
          pageCountDisplay.textContent = pdfState.doc.numPages;
          
          setupPagesDOM();
          renderThumbnails(); // Optional: Render first few thumbnails
          setupIntersectionObserver();
          
          pdfLoader.classList.add('hidden');
        } catch (error) {
          console.error("PDF Load Error:", error);
          pdfLoader.classList.add('hidden');
          pdfError.classList.remove('hidden');
          errorDownloadLink.href = url;
        }
      }

      function resetPdfState() {
        if (pdfState.pageObserver) pdfState.pageObserver.disconnect();
        pdfWrapper.innerHTML = '';
        thumbContainer.innerHTML = '';
        pdfState.doc = null;
        pdfState.currentPage = 1;
        pageNumDisplay.textContent = '1';
        pageCountDisplay.textContent = '--';
      }

      function setupPagesDOM() {
        // Create skeleton divs for all pages to establish scroll height
        for (let i = 1; i <= pdfState.doc.numPages; i++) {
          const pageContainer = document.createElement('div');
          pageContainer.id = `page-container-${i}`;
          pageContainer.className = 'pdf-page-container';
          pageContainer.dataset.pageNumber = i;
          
          // Set aspect ratio if available (mocked for now, updated on first render)
          pageContainer.style.width = '100%';
          
          pdfWrapper.appendChild(pageContainer);
        }
      }

      function setupIntersectionObserver() {
        const options = {
          root: pdfScrollContainer,
          rootMargin: '200px', // Pre-load pages before they appear
          threshold: 0.1
        };

        pdfState.pageObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const pageNum = parseInt(entry.target.dataset.pageNumber);
              renderPageIntoContainer(pageNum, entry.target);
            }
          });
          
          // Update current page display based on center-most element
          updateCurrentPageIndicator();
        }, options);

        const pages = document.querySelectorAll('.pdf-page-container');
        pages.forEach(p => pdfState.pageObserver.observe(p));
      }

      async function renderPageIntoContainer(pageNum, container) {
        if (container.dataset.loaded === 'true') return;
        
        try {
          const page = await pdfState.doc.getPage(pageNum);
          const viewport = page.getViewport({ scale: pdfState.scale * 1.5 }); // High Res for sharpness
          
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          // Scale down visually using CSS for sharpness
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          
          container.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
          container.style.minHeight = 'auto';
          container.innerHTML = ''; // Clear skeleton
          container.appendChild(canvas);
          
          const renderContext = {
            canvasContext: context,
            viewport: viewport
          };
          
          await page.render(renderContext).promise;
          container.dataset.loaded = 'true';
        } catch (err) {
          console.error("Page render error:", err);
        }
      }

      // --- Interaction & Controls ---

      function updateCurrentPageIndicator() {
        // Find the page closest to the center of the scroll container
        const pages = document.querySelectorAll('.pdf-page-container');
        let closestPage = 1;
        let minDistance = Infinity;
        const containerCenter = pdfScrollContainer.clientHeight / 2;

        pages.forEach(page => {
          const rect = page.getBoundingClientRect();
          const containerRect = pdfScrollContainer.getBoundingClientRect();
          const pageCenter = rect.top - containerRect.top + (rect.height / 2);
          const distance = Math.abs(containerCenter - pageCenter);
          
          if (distance < minDistance) {
            minDistance = distance;
            closestPage = parseInt(page.dataset.pageNumber);
          }
        });

        if (closestPage !== pdfState.currentPage) {
          pdfState.currentPage = closestPage;
          pageNumDisplay.textContent = closestPage;
          
          // Update active thumbnail
          document.querySelectorAll('.thumbnail-btn').forEach(btn => btn.classList.remove('active'));
          const activeThumb = document.getElementById(`thumb-${closestPage}`);
          if (activeThumb) {
            activeThumb.classList.add('active');
            activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      }

      function renderThumbnails() {
        // Only render generic placeholders for list for performance
        // Real renders would happen if we wanted high fidelity thumbnails
        for (let i = 1; i <= pdfState.doc.numPages; i++) {
          const btn = document.createElement('button');
          btn.id = `thumb-${i}`;
          btn.className = 'thumbnail-btn w-full aspect-[3/4] bg-white/5 border border-white/10 hover:border-white/30 rounded mb-4 transition-all opacity-50 relative flex items-center justify-center group';
          btn.innerHTML = `
             <span class="text-white/30 font-mono text-sm group-hover:text-white">${i}</span>
          `;
          btn.onclick = () => scrollToPage(i);
          thumbContainer.appendChild(btn);
        }
      }

      function scrollToPage(num) {
        if (num < 1 || num > pdfState.doc.numPages) return;
        const target = document.getElementById(`page-container-${num}`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }

      function handleZoom(direction) {
        const newScale = direction === 'in' 
          ? Math.min(pdfState.scale + 0.2, 3.0) 
          : Math.max(pdfState.scale - 0.2, 0.5);
          
        if (newScale === pdfState.scale) return;
        
        pdfState.scale = newScale;
        zoomLevelDisplay.textContent = `${Math.round(pdfState.scale * 100)}%`;
        
        // CSS Transform Zoom for performance
        // This is a "preview" zoom, real re-rendering would require clearing all canvases
        pdfWrapper.style.transform = `scale(${pdfState.scale})`;
        
        // Adjust container width to prevent horizontal overflow mess if zooming out
        if(pdfState.scale < 1) {
            pdfWrapper.style.width = '100%';
        }
      }

      // --- Core UI Logic ---

      function filterItems() {
        const { query, filters } = state;
        const sourceData = state.items;
        const q = query.toLowerCase().trim();
        
        const filtered = sourceData.filter(item => {
          const matchesQuery = !q || 
                               (item.title && item.title.toLowerCase().includes(q)) || 
                               (item.subject && item.subject.toLowerCase().includes(q)) ||
                               (item.author && item.author.toLowerCase().includes(q));
          const matchesType = !filters.type || String(item.type) === String(filters.type);
          const matchesSubject = !filters.subject || String(item.subject) === String(filters.subject);
          return matchesQuery && matchesType && matchesSubject;
        });

        // Smooth transition: fade out, show skeletons, then render new items
        grid.style.opacity = '0.5';
        grid.style.transition = 'opacity 0.2s ease';
        
        setTimeout(() => {
          renderItems(filtered);
          grid.style.opacity = '1';
        }, 200);
      }

      function updateActiveChips() {
        const chips = [];
        if (state.filters.type) chips.push({ key: 'type', value: state.filters.type });
        if (state.filters.subject) chips.push({ key: 'subject', value: state.filters.subject });

        activeFiltersContainer.innerHTML = '';

        if (chips.length === 0) {
          activeFiltersContainer.appendChild(noFiltersMsg);
          clearBtn.classList.add('hidden');
        } else {
          clearBtn.classList.remove('hidden');
          chips.forEach(chip => {
            const btn = document.createElement('button');
            btn.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-lux-gold text-lux-navy hover:bg-white hover:text-lux-navy transition-colors animate-fade-up';
            btn.innerHTML = `<span>${chip.value}</span><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
            btn.onclick = () => {
              const selectId = chip.key === 'type' ? 'filter-type' : 'filter-subject';
              document.getElementById(selectId).value = "";
              handleFilterChange(chip.key, "");
            };
            activeFiltersContainer.appendChild(btn);
          });
        }
      }

      function handleFilterChange(key, value) {
        state.filters[key] = value;
        updateActiveChips();
        filterItems();
      }

      // --- Toast Notification ---
      function showToast(message) {
        const toast = document.getElementById('toast');
        const msg = document.getElementById('toast-msg');
        msg.textContent = message;
        toast.classList.remove('translate-y-20', 'opacity-0');
        setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3000);
      }

      // --- Lightbox Open/Close ---
      function openPreview(title, pdfUrl) {
        lightboxTitle.textContent = title;
        downloadBtn.href = pdfUrl;
        
        lightbox.classList.remove('hidden');
        // Force reflow
        void lightbox.offsetWidth;
        
        lightbox.classList.remove('opacity-0');
        lightboxContent.classList.remove('scale-95');
        lightboxContent.classList.add('scale-100', 'animate-in-dialog');
        
        document.body.style.overflow = 'hidden';
        
        loadPdfDocument(pdfUrl);
      }

      function closePreview() {
        lightbox.classList.add('opacity-0');
        lightboxContent.classList.remove('scale-100', 'animate-in-dialog');
        lightboxContent.classList.add('scale-95');
        
        setTimeout(() => {
          lightbox.classList.add('hidden');
          document.body.style.overflow = '';
          resetPdfState();
        }, 300);
      }

      // --- Event Listeners ---
      searchInput.addEventListener('input', (e) => {
        state.query = e.target.value;
        filterItems();
      });

      document.getElementById('search-form').addEventListener('submit', (e) => {
        e.preventDefault();
        filterItems();
      });

      [typeFilter, subjectFilter].forEach(sel => {
        sel.addEventListener('change', (e) => {
          const key = e.target.id === 'filter-type' ? 'type' : 'subject';
          handleFilterChange(key, e.target.value);
        });
      });

      clearBtn.addEventListener('click', () => {
        state.filters = { type: '', subject: '' };
        typeFilter.value = "";
        subjectFilter.value = "";
        updateActiveChips();
        filterItems();
      });

      lightboxClose.addEventListener('click', closePreview);
      
      lightbox.addEventListener('click', (e) => {
        const backdrop = document.getElementById('lightbox-backdrop');
        if (e.target === backdrop) closePreview();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) closePreview();
      });

      // PDF Toolbar Listeners
      sidebarToggle.addEventListener('click', () => {
        const isHidden = sidebar.classList.contains('w-0');
        if (isHidden) {
          sidebar.classList.remove('w-0', 'border-none');
          sidebar.classList.add('w-64');
          sidebarToggle.classList.add('text-lux-gold', 'bg-white/10');
        } else {
          sidebar.classList.add('w-0', 'border-none');
          sidebar.classList.remove('w-64');
          sidebarToggle.classList.remove('text-lux-gold', 'bg-white/10');
        }
      });

      btnNext.addEventListener('click', () => scrollToPage(pdfState.currentPage + 1));
      btnPrev.addEventListener('click', () => scrollToPage(pdfState.currentPage - 1));
      
      zoomInBtn.addEventListener('click', () => handleZoom('in'));
      zoomOutBtn.addEventListener('click', () => handleZoom('out'));

      // Public API
      return {
        downloadItem: (title) => showToast(`Starting download: ${title}`),
        openPreview,
        addItem(asset) {
          // Prepend a newly uploaded asset to the live state and re-render
          state.items.unshift(asset);
          MOCK_DB.unshift(asset);
          filterItems();
        },
        init: async () => {
          // Restore the staff UI from the session cookie (survives a reload).
          restoreStaffSession();

          /* Delegated handlers. These replaced inline onclick="...('${item.title}')"
             attributes, which broke on any title containing an apostrophe
             ("O'Level", "Children's…") and were an injection point for the
             upload-supplied title. */
          grid.addEventListener('click', (e) => {
            const prev = e.target.closest('[data-preview]');
            if (prev) {
              const card = prev.closest('article');
              const title = card ? (card.querySelector('h3')?.getAttribute('title') || '') : '';
              openPreview(title, prev.getAttribute('data-preview-pdf'));
              return;
            }
            const dl = e.target.closest('[data-download]');
            if (dl) {
              const card = dl.closest('article');
              showToast(`Starting download: ${card ? (card.querySelector('h3')?.getAttribute('title') || '') : ''}`);
            }
          });

          // Show skeleton while loading
          grid.innerHTML = Array(4).fill(createSkeleton()).join('');
          try {
            const res = await fetch('/api/assets');
            if (res.ok) {
              const serverAssets = await res.json();
              if (Array.isArray(serverAssets) && serverAssets.length > 0) {
                // Merge: server assets first, then any MOCK_DB items not already present
                const serverIds = new Set(serverAssets.map(a => String(a.id)));
                const mockOnly = MOCK_DB.filter(m => !serverIds.has(String(m.id)));
                state.items = [...serverAssets, ...mockOnly];
              } else {
                state.items = [...MOCK_DB];
              }
            } else {
              state.items = [...MOCK_DB];
            }
          } catch {
            // Server not running — fall back to MOCK_DB silently
            state.items = [...MOCK_DB];
          }
          renderItems(state.items);
        }
      };
    })();

    // Init on load
    document.addEventListener('DOMContentLoaded', () => App.init());
})();

(function () {
const AdminSystem = (() => {
      'use strict';

      // ── State ────────────────────────────────────────────────────────
      let authToken = null;

      // ── DOM refs ─────────────────────────────────────────────────────
      const loginModal  = document.getElementById('admin-login-modal');
      const uploadModal = document.getElementById('admin-upload-modal');

      // ── Modal helpers ────────────────────────────────────────────────
      function openModal(modal) {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
        void modal.offsetWidth; // force reflow for transition
        modal.classList.add('visible');
      }

      function closeModal(modal, onClosed) {
        modal.classList.remove('visible');
        setTimeout(() => {
          modal.classList.remove('open');
          document.body.style.overflow = '';
          if (onClosed) onClosed();
        }, 320);
      }

      // ── Backdrop clicks ──────────────────────────────────────────────
      document.getElementById('login-modal-backdrop').addEventListener('click', () => closeLogin());
      document.getElementById('upload-modal-backdrop').addEventListener('click', () => closeUpload());

      // Escape key closes whichever modal is open
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (loginModal.classList.contains('open'))  closeLogin();
        if (uploadModal.classList.contains('open')) closeUpload();
      });

      // ── Login ─────────────────────────────────────────────────────────
      function openLogin() {
        openModal(loginModal);
        setTimeout(() => document.getElementById('admin-passcode').focus(), 350);
      }

      function closeLogin() {
        closeModal(loginModal, () => {
          document.getElementById('login-form').reset();
          hideError('login-error');
        });
      }

      function togglePasscodeVisibility() {
        const input = document.getElementById('admin-passcode');
        const icon  = document.getElementById('eye-icon-login');
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        icon.innerHTML = isHidden
          ? `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>`
          : `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>`;
      }

      async function handleLogin(e) {
        e.preventDefault();
        const passcode = document.getElementById('admin-passcode').value;
        const btn      = document.getElementById('login-submit-btn');
        const btnText  = document.getElementById('login-btn-text');

        hideError('login-error');
        setLoading(btn, btnText, 'Verifying…', true);

        try {
          const res  = await fetch('/api/staff/login', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ passcode })
          });
          const data = await res.json();

          if (!res.ok || !data.ok) throw new Error(data.error || 'Login failed.');

          // The server authenticates with the httpOnly session cookie, so there
          // is no token to hold. This flag only drives which UI is shown.
          authToken = true;
          setAuthUI(true);
          closeLogin();
          // Small delay so the modal close animation completes first
          setTimeout(() => openUpload(), 400);

        } catch (err) {
          showError('login-error', 'login-error-text', err.message);
        } finally {
          setLoading(btn, btnText, 'Log in', false);
        }
      }

      // ── Upload ────────────────────────────────────────────────────────
      function openUpload() {
        if (!authToken) { openLogin(); return; }
        resetUploadForm();
        openModal(uploadModal);
      }

      function closeUpload() {
        closeModal(uploadModal, resetUploadForm);
      }

      function handleFileSelect(input) {
        const file = input.files && input.files[0];
        if (!file) return;
        document.getElementById('dropzone-idle').classList.add('hidden');
        document.getElementById('dropzone-selected').classList.remove('hidden');
        document.getElementById('selected-filename').textContent = file.name;
        document.getElementById('selected-filesize').textContent = formatBytes(file.size);
      }

      function clearFileSelection(e) {
        e.stopPropagation();
        document.getElementById('file-upload-input').value = '';
        document.getElementById('dropzone-idle').classList.remove('hidden');
        document.getElementById('dropzone-selected').classList.add('hidden');
      }

      async function handleUpload(e) {
        e.preventDefault();
        const fileInput = document.getElementById('file-upload-input');
        const btn       = document.getElementById('upload-submit-btn');
        const btnText   = document.getElementById('upload-btn-text');

        if (!fileInput.files || fileInput.files.length === 0) {
          showError('upload-error', 'upload-error-text', 'Please select a PDF file first.');
          return;
        }

        const file = fileInput.files[0];

        // Client-side validation
        if (file.type !== 'application/pdf') {
          showError('upload-error', 'upload-error-text', 'Only PDF files are accepted.');
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          showError('upload-error', 'upload-error-text', 'File exceeds the 10 MB limit.');
          return;
        }

        const formData = new FormData();
        formData.append('file',    file);
        formData.append('title',   document.getElementById('upload-title').value.trim());
        formData.append('subject', document.getElementById('upload-subject').value.trim());
        formData.append('type',    document.getElementById('upload-type').value);
        formData.append('year',    document.getElementById('upload-year').value);
        formData.append('author',  document.getElementById('upload-author').value.trim());

        hideError('upload-error');
        setLoading(btn, btnText, 'Uploading…', true);
        showProgress(true);

        // Animate progress bar (XHR gives real progress; fetch does not — we simulate)
        let fakeProgress = 0;
        const progressBar = document.getElementById('upload-progress-bar');
        const progressPct = document.getElementById('upload-progress-pct');
        const progressTick = setInterval(() => {
          fakeProgress = Math.min(fakeProgress + Math.random() * 15, 88);
          progressBar.style.width  = fakeProgress + '%';
          progressPct.textContent  = Math.round(fakeProgress) + '%';
        }, 250);

        try {
          const res  = await fetch('/api/library/upload', { method: 'POST', body: formData });
          const data = await res.json();

          clearInterval(progressTick);
          progressBar.style.width = '100%';
          progressPct.textContent = '100%';

          if (!res.ok || data.message !== 'File uploaded successfully') {
            throw new Error(data.error || 'Upload failed.');
          }

          // Show success panel
          document.getElementById('upload-form-container').classList.add('hidden');
          document.getElementById('upload-success-container').classList.remove('hidden');
          document.getElementById('success-filename').textContent = data.asset._filename;
          document.getElementById('success-view-link').href       = data.asset.pdf;

          // Inject the new item into the live catalog
          App.addItem(data.asset);

        } catch (err) {
          clearInterval(progressTick);
          showProgress(false);
          showError('upload-error', 'upload-error-text', err.message);
        } finally {
          setLoading(btn, btnText, 'Upload PDF', false);
        }
      }

      function resetUploadForm() {
        const form = document.getElementById('upload-form');
        if (form) form.reset();
        document.getElementById('dropzone-idle').classList.remove('hidden');
        document.getElementById('dropzone-selected').classList.add('hidden');
        document.getElementById('upload-form-container').classList.remove('hidden');
        document.getElementById('upload-success-container').classList.add('hidden');
        showProgress(false);
        hideError('upload-error');
        const bar = document.getElementById('upload-progress-bar');
        if (bar) bar.style.width = '0%';
      }

      // ── Drag-and-drop on the dropzone ────────────────────────────────
      const dropzone = document.getElementById('upload-dropzone');
      dropzone.addEventListener('dragover',  (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
      dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('drag-over'));
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) {
          const input = document.getElementById('file-upload-input');
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          handleFileSelect(input);
        }
      });

      // ── Auth UI toggle ───────────────────────────────────────────────
      function setAuthUI(loggedIn) {
        const guest = document.getElementById('auth-nav-guest');
        const staff = document.getElementById('auth-nav-staff');
        if (loggedIn) {
          guest.style.display = 'none';
          staff.classList.add('visible');
        } else {
          guest.style.display = '';
          staff.classList.remove('visible');
        }
      }

      function logout() {
        fetch('/api/staff/logout', { method: 'POST' }).catch(() => {});
        authToken = null;
        setAuthUI(false);
      }

      /* The session outlives the page, so restore the staff UI after a reload
         instead of making staff sign in again to reach a button that would
         401 on save. */
      async function restoreStaffSession() {
        try {
          const res = await fetch('/api/library/auth');
          const data = await res.json();
          if (data.authenticated) { authToken = true; setAuthUI(true); }
        } catch (e) { /* offline / not signed in */ }
      }

      // ── Helpers ──────────────────────────────────────────────────────
      function showError(containerId, textId, msg) {
        const el = document.getElementById(containerId);
        document.getElementById(textId).textContent = msg;
        el.classList.add('visible');
      }
      function hideError(containerId) {
        document.getElementById(containerId).classList.remove('visible');
      }
      function setLoading(btn, textEl, label, isLoading) {
        textEl.textContent = label;
        btn.disabled = isLoading;
        btn.style.opacity = isLoading ? '0.7' : '';
        btn.style.cursor  = isLoading ? 'not-allowed' : '';
      }
      function showProgress(show) {
        document.getElementById('upload-progress-wrap').classList.toggle('hidden', !show);
      }
      function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
      }

      // ── Public API ───────────────────────────────────────────────────
      return {
        openLogin,
        closeLogin,
        openUpload,
        closeUpload,
        handleLogin,
        handleUpload,
        handleFileSelect,
        clearFileSelection,
        resetUploadForm,
        togglePasscodeVisibility,
        logout
      };
    })();
})();

(function () {
// /scripts/carousel.js  (defensive non-module version — improved: pointer-only + early reentrancy guard)
(function (global) {
  function initCarousel(rootEl) {
    if (!rootEl) return null;

    const slidesEl = rootEl.querySelector('.slides');
    const slides = Array.from(rootEl.querySelectorAll('.slide'));
    const imgs = Array.from(rootEl.querySelectorAll('img'));
    const overlay = rootEl.querySelector('.image-overlay');
    const overlayHeadline = overlay ? overlay.querySelector('#carousel-overlay-headline') : null;
    const overlaySubtitle = overlay ? overlay.querySelector('#carousel-overlay-subtitle') : null;
    const overlayContent = rootEl.querySelector('.image-overlay__content');
    const dotsContainer = rootEl.querySelector('.carousel-dots');
    const controls = rootEl.querySelector('.carousel-controls');
    const liveRegion = rootEl.querySelector('.carousel-live');

    let current = 0;
    let isAnimating = false;
    let inView = false;
    let lastSwipeAt = 0;

    if (!slidesEl || !slides.length) {
      console.warn('Carousel init aborted: missing slides container or slides.');
      return null;
    }

    // Activate carousel mode
    rootEl.classList.add('carousel-enabled');

    // Defensive inline layout so the carousel shows even if CSS hasn't loaded yet
    slidesEl.style.display = 'flex';
    slidesEl.style.flexWrap = 'nowrap';
    slidesEl.style.boxSizing = 'border-box';
    slidesEl.style.width = `${slides.length * 100}%`;
    slidesEl.style.willChange = slidesEl.style.willChange || 'transform';
    // Do not forcibly set transition (leave to CSS), but ensure a sensible fallback only if none exists:
    if (!slidesEl.style.transition) {
      slidesEl.style.transition = 'transform 360ms cubic-bezier(.2,.9,.3,1)';
    }
    slidesEl.style.transform = `translate3d(-${current * 100}%, 0, 0)`;
    slidesEl.style.alignItems = 'stretch';

    slides.forEach((s) => {
      s.style.minWidth = '100%';
      s.style.flex = '0 0 100%';
      s.style.boxSizing = 'border-box';
      s.style.position = s.style.position || 'relative';
      const caption = s.querySelector('.slide-caption');
      if (caption) caption.style.display = 'none';
    });

    imgs.forEach(img => {
      img.style.display = 'block';
      img.style.width = '100%';
      img.style.height = 'auto';
      if (!img.style.objectFit) img.style.objectFit = 'cover';
      img.style.opacity = img.style.opacity || '';
      img.style.visibility = img.style.visibility || '';
    });

    if (controls) controls.setAttribute('aria-hidden', 'false');
    if (dotsContainer) dotsContainer.setAttribute('aria-hidden', 'false');
    if (overlay) overlay.setAttribute('aria-hidden', 'false');

    // Build dots
    if (dotsContainer) {
      dotsContainer.innerHTML = '';
      slides.forEach((s, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'carousel-dot';
        btn.setAttribute('aria-pressed', i === current ? 'true' : 'false');
        btn.setAttribute('aria-label', `Go to slide ${i + 1}`);
        btn.dataset.index = String(i);
        btn.addEventListener('click', () => goTo(i));
        dotsContainer.appendChild(btn);
      });
    }

    // Prev / Next
    const prevBtn = rootEl.querySelector('.carousel-btn.prev');
    const nextBtn = rootEl.querySelector('.carousel-btn.next');
    if (prevBtn) prevBtn.addEventListener('click', () => goTo(current - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => goTo(current + 1));

    // Keyboard
    rootEl.tabIndex = 0;
    rootEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); goTo(current - 1); }
      if (ev.key === 'ArrowRight') { ev.preventDefault(); goTo(current + 1); }
    });

    // Swipe handling: use Pointer Events if supported (avoid double-firing)
    let startX = 0, deltaX = 0, isPointerDown = false;
    const supportsPointer = !!window.PointerEvent;

    if (supportsPointer) {
      slidesEl.addEventListener('pointerdown', (e) => {
        isPointerDown = true;
        startX = e.clientX;
        deltaX = 0;
        if (e.pointerId && slidesEl.setPointerCapture) slidesEl.setPointerCapture(e.pointerId);
      }, { passive: true });

      slidesEl.addEventListener('pointermove', (e) => {
        if (!isPointerDown) return;
        deltaX = e.clientX - startX;
      }, { passive: true });

      slidesEl.addEventListener('pointerup', () => {
        isPointerDown = false;
        handleSwipe();
      });

      slidesEl.addEventListener('pointercancel', () => {
        isPointerDown = false;
        deltaX = 0;
      });
    } else {
      // fallback to touch events only (no pointer events)
      slidesEl.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        deltaX = 0;
      }, { passive: true });

      slidesEl.addEventListener('touchmove', (e) => {
        deltaX = e.touches[0].clientX - startX;
      }, { passive: true });

      slidesEl.addEventListener('touchend', handleSwipe, { passive: true });
    }

    function handleSwipe() {
      // debounce quick repeated ups (protect against weird duplicate events)
      const now = Date.now();
      if (now - lastSwipeAt < 200) { deltaX = 0; return; }
      lastSwipeAt = now;

      const threshold = Math.min(100, window.innerWidth * 0.12);
      if (deltaX > threshold) goTo(current - 1);
      else if (deltaX < -threshold) goTo(current + 1);
      deltaX = 0;
    }

    // IntersectionObserver to toggle inView
    const io = ('IntersectionObserver' in window) ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === rootEl) {
          inView = entry.isIntersecting && entry.intersectionRatio > 0.25;
          if (inView) rootEl.classList.add('in-view');
          else rootEl.classList.remove('in-view');
        }
      });
    }, { threshold: [0, 0.25, 0.5] }) : null;
    if (io) io.observe(rootEl);
    else rootEl.classList.add('in-view');

    slides.forEach((s, i) => s.setAttribute('aria-hidden', i === current ? 'false' : 'true'));

    // initial render
    updateUI(true);

    // IMPORTANT: Prevent reentrancy by setting isAnimating immediately when we start a navigation.
    function goTo(idx) {
      if (isAnimating) return;
      const target = ((idx % slides.length) + slides.length) % slides.length;
      if (target === current) return;

      // lock reentrancy now
      isAnimating = true;
      current = target;
      updateUI(false);
      // updateUI will schedule the unlock timeout
    }

    function updateUI(initial = false) {
      // GPU-accelerated transform
      // Use requestAnimationFrame to ensure the browser applies styles before transform for smoother transition
      requestAnimationFrame(() => {
        slidesEl.style.transform = `translate3d(-${current * 100}%, 0, 0)`;
      });

      // accessibility updates
      slides.forEach((s, i) => s.setAttribute('aria-hidden', i === current ? 'false' : 'true'));
      if (dotsContainer) {
        const dotButtons = Array.from(dotsContainer.children || []);
        dotButtons.forEach((b, i) => b.setAttribute('aria-pressed', i === current ? 'true' : 'false'));
      }

      // overlay content
      const active = slides[current];
      const title = active && active.dataset ? (active.dataset.title || '') : '';
      const subtitle = active && active.dataset ? (active.dataset.subtitle || '') : '';
      if (overlayHeadline) overlayHeadline.textContent = title;
      if (overlaySubtitle) overlaySubtitle.textContent = subtitle;
      if (liveRegion) liveRegion.textContent = `${title}. ${subtitle}`;

      // caption animation replay
      if (overlayContent) {
        overlayContent.classList.remove('is-animate');
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!prefersReduced && inView) {
          void overlayContent.offsetWidth; // force reflow
          overlayContent.classList.add('is-animate');
          overlayContent.style.opacity = '';
        } else {
          overlayContent.style.opacity = '1';
        }
      }

      // release isAnimating after transition time (give small buffer)
      if (!initial) {
        const releaseAfter = 420; // should match CSS transition/animation durations
        window.setTimeout(() => { isAnimating = false; }, releaseAfter);
      } else {
        // initial render should not block interaction
        isAnimating = false;
      }

      console.debug('carousel update', { current, title, subtitle });
    }

    // Public API
    const api = {
      goTo,
      next() { goTo(current + 1); },
      prev() { goTo(current - 1); },
      get index() { return current; },
      destroy() {
        if (io) io.disconnect();
        rootEl.classList.remove('carousel-enabled');
        if (controls) controls.setAttribute('aria-hidden', 'true');
        if (dotsContainer) dotsContainer.setAttribute('aria-hidden', 'true');
        if (overlay) overlay.setAttribute('aria-hidden', 'true');
        // full listener cleanup is omitted for brevity
      }
    };

    return api;
  }

  // expose for classic usage
  global.initCarousel = initCarousel;
})(window);
})();
