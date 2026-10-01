(function () {
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  const API_BASE = '/api/gallery';
  let PASS = '';                 
  const SESSION_KEY = 'bic_admin_auth';

  // ── State ─────────────────────────────────────────────────────────────────
  let galleryData  = [];   // [{id, title, subtitle, images:[]}]
  let currentItem  = null; // item being edited/created
  let editMode     = false;
  let dragSrcEl    = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const authOverlay   = document.getElementById('authOverlay');
  const adminApp      = document.getElementById('adminApp');
  const loginForm     = document.getElementById('loginForm');
  const passwordInput = document.getElementById('passwordInput');
  const authError     = document.getElementById('authError');
  const logoutBtn     = document.getElementById('logoutBtn');
  const togglePw      = document.getElementById('togglePw');

  const galleryGrid   = document.getElementById('galleryGrid');
  const emptyState    = document.getElementById('emptyState');
  const loadingState  = document.getElementById('loadingState');
  const searchBar     = document.getElementById('searchBar');
  const newItemBtn    = document.getElementById('newItemBtn');
  const emptyNewBtn   = document.getElementById('emptyNewBtn');

  const editPanel     = document.getElementById('editPanel');
  const panelOverlay  = document.getElementById('panelOverlay');
  const panelTitle    = document.getElementById('panelTitle');
  const closePanel    = document.getElementById('closePanel');
  const cancelPanel   = document.getElementById('cancelPanel');
  const saveItemBtn   = document.getElementById('saveItemBtn');
  const saveBtnText   = document.getElementById('saveBtnText');
  const saveBtnSpinner= document.getElementById('saveBtnSpinner');
  const deleteItemBtn = document.getElementById('deleteItemBtn');
  const dangerZone    = document.getElementById('dangerZone');

  const itemTitle     = document.getElementById('itemTitle');
  const itemSubtitle  = document.getElementById('itemSubtitle');
  const titleError    = document.getElementById('titleError');
  const sequenceError = document.getElementById('sequenceError');
  const dropZone      = document.getElementById('dropZone');
  const dropHint      = document.getElementById('dropHint');
  const imageCount    = document.getElementById('imageCount');
  const imageUpload   = document.getElementById('imageUploadInput');

  const uploadProgress    = document.getElementById('uploadProgress');
  const uploadProgressText= document.getElementById('uploadProgressText');
  const uploadBar         = document.getElementById('uploadBar');

  const previewSection = document.getElementById('previewSection');
  const coverPreview   = document.getElementById('coverPreview');
  const previewTitle   = document.getElementById('previewTitle');
  const previewSub     = document.getElementById('previewSub');

  const statItems  = document.getElementById('statItems');
  const statImages = document.getElementById('statImages');
  const statSaved  = document.getElementById('statSaved');

  const toast = document.getElementById('toast');

  // ════════════════════════════════════════════════════════════
  // AUTH
  // ════════════════════════════════════════════════════════════
  function isAuthed() { return sessionStorage.getItem(SESSION_KEY) === '1'; }

  if (isAuthed()) { showApp(); }

  loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const val = passwordInput.value.trim();
  if (!val) return;

  // Test the token against the server before granting access
  try {
    const res = await fetch(`${API_BASE}?action=get_gallery`, {
      headers: { 'X-Admin-Token': val }
    });
    if (res.ok) {
      PASS = val;   // store only in memory, never in sessionStorage
      sessionStorage.setItem(SESSION_KEY, '1');
      authError.classList.add('hidden');
      showApp();
    } else {
      authError.classList.remove('hidden');
      passwordInput.value = '';
      passwordInput.focus();
    }
  } catch {
    authError.textContent = 'Server unreachable. Please try again.';
    authError.classList.remove('hidden');
  }
});  

  togglePw.addEventListener('click', () => {
    const t = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = t;
  });

  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });

  function showApp() {
    authOverlay.style.display = 'none';
    adminApp.classList.remove('hidden');
    loadGallery();
  }

  // ════════════════════════════════════════════════════════════
  // API HELPERS
  // ════════════════════════════════════════════════════════════
  async function apiFetch(action, options = {}) {
    const url = `${API_BASE}?action=${action}`;
    const headers = { 'X-Admin-Token': PASS, ...(options.headers || {}) };
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ════════════════════════════════════════════════════════════
  // LOAD GALLERY
  // ════════════════════════════════════════════════════════════
  async function loadGallery() {
    loadingState.classList.remove('hidden');
    galleryGrid.classList.add('hidden');
    emptyState.classList.add('hidden');
    try {
      const data = await apiFetch('get_gallery');
      galleryData = Array.isArray(data) ? data : [];
    } catch (err) {
      // Fallback: read the gallery through the public (unauthenticated) endpoint
      try {
        const r = await fetch('/api/gallery');
        if (r.ok) galleryData = await r.json();
      } catch (_) { galleryData = []; }
      if (!galleryData.length) {
        showToast('Could not load gallery data from the gallery API.', 'error', 6000);
      }
    }
    loadingState.classList.add('hidden');
    galleryGrid.classList.remove('hidden');
    renderGrid(galleryData);
    updateStats();
  }

  // ════════════════════════════════════════════════════════════
  // RENDER GRID
  // ════════════════════════════════════════════════════════════
  function renderGrid(items) {
    galleryGrid.innerHTML = '';
    if (!items || !items.length) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');
    items.forEach((item, i) => {
      const cover = item.images && item.images[0] ? item.images[0] : '';
      const count = item.images ? item.images.length : 0;
      const card = document.createElement('div');
      card.className = 'gallery-card fade-up';
      card.style.animationDelay = `${i * 60}ms`;
      card.innerHTML = `
        <div class="relative aspect-[4/3] bg-slate-800 overflow-hidden">
          ${cover
            ? `<img src="${escHtml(cover)}" alt="${escHtml(item.title)}" class="w-full h-full object-cover">`
            : `<div class="w-full h-full flex items-center justify-center"><svg class="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>`
          }
          <div class="absolute top-2 right-2 flex gap-1.5">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-black/60 text-slate-300">${count} img${count !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="p-4">
          <h3 class="text-white font-semibold text-base truncate">${escHtml(item.title) || '<span class="text-slate-500 italic">Untitled</span>'}</h3>
          <p class="text-slate-400 text-xs mt-0.5 truncate">${escHtml(item.subtitle) || '—'}</p>
          <div class="flex gap-2 mt-3">
            <button class="edit-btn flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300 hover:bg-brand-yellow/10 hover:border-brand-yellow/30 hover:text-brand-yellow transition-colors flex items-center justify-center gap-1.5" data-id="${escHtml(item.id)}">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              Edit
            </button>
            <button class="dupe-btn py-1.5 px-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-400 hover:bg-white/10 transition-colors" data-id="${escHtml(item.id)}" title="Duplicate item">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          </div>
        </div>`;
      galleryGrid.appendChild(card);
    });

    // Bind edit buttons
    galleryGrid.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditPanel(btn.dataset.id));
    });
    galleryGrid.querySelectorAll('.dupe-btn').forEach(btn => {
      btn.addEventListener('click', () => duplicateItem(btn.dataset.id));
    });
  }

  // ════════════════════════════════════════════════════════════
  // SEARCH / FILTER
  // ════════════════════════════════════════════════════════════
  let searchTimer;
  searchBar.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = searchBar.value.trim().toLowerCase();
      const filtered = q
        ? galleryData.filter(it =>
            (it.title||'').toLowerCase().includes(q) ||
            (it.subtitle||'').toLowerCase().includes(q))
        : galleryData;
      renderGrid(filtered);
    }, 200);
  });

  // ════════════════════════════════════════════════════════════
  // PANEL — OPEN / CLOSE
  // ════════════════════════════════════════════════════════════
  newItemBtn.addEventListener('click', openNewPanel);
  emptyNewBtn.addEventListener('click', openNewPanel);
  closePanel.addEventListener('click', closePanelFn);
  cancelPanel.addEventListener('click', closePanelFn);
  panelOverlay.addEventListener('click', closePanelFn);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanelFn(); });

  function openNewPanel() {
    editMode  = false;
    currentItem = { id: 'item-' + Date.now(), title: '', subtitle: '', images: [] };
    panelTitle.textContent = 'New Gallery Item';
    saveBtnText.textContent = 'Create Item';
    dangerZone.classList.add('hidden');
    populatePanel();
    slideIn();
  }

  function openEditPanel(id) {
    const item = galleryData.find(i => i.id === id);
    if (!item) return;
    editMode  = true;
    currentItem = JSON.parse(JSON.stringify(item)); // deep copy
    panelTitle.textContent = 'Edit Gallery Item';
    saveBtnText.textContent = 'Save Changes';
    dangerZone.classList.remove('hidden');
    populatePanel();
    slideIn();
  }

  function slideIn() {
    panelOverlay.classList.add('show');
    editPanel.classList.add('open');
    itemTitle.focus();
  }

  function closePanelFn() {
    editPanel.classList.remove('open');
    panelOverlay.classList.remove('show');
    currentItem = null;
  }

  // ════════════════════════════════════════════════════════════
  // POPULATE PANEL FIELDS
  // ════════════════════════════════════════════════════════════
  function populatePanel() {
    titleError.classList.add('hidden');
    sequenceError.classList.add('hidden');
    itemTitle.value    = currentItem.title    || '';
    itemSubtitle.value = currentItem.subtitle || '';
    rebuildDropZone();
    updatePreview();
  }

  // ════════════════════════════════════════════════════════════
  // DROP ZONE — REBUILD THUMBNAILS
  // ════════════════════════════════════════════════════════════
  function rebuildDropZone() {
    // Remove all thumbs
    dropZone.querySelectorAll('.img-thumb').forEach(el => el.remove());
    const imgs = currentItem.images || [];
    dropHint.style.display = imgs.length ? 'none' : 'block';
    imgs.forEach((src, idx) => addThumb(src, idx));
    imageCount.textContent = `${imgs.length} image${imgs.length !== 1 ? 's' : ''}`;
  }

  function addThumb(src, idx) {
    const thumb = document.createElement('div');
    thumb.className = 'img-thumb w-20 h-20 rounded-lg overflow-hidden border border-white/10 hover:border-brand-yellow/40 transition-colors';
    thumb.draggable = true;
    thumb.dataset.src = src;
    thumb.dataset.idx = idx;
    thumb.innerHTML = `
      <img src="${escHtml(src)}" alt="" class="w-full h-full object-cover pointer-events-none" loading="lazy">
      <button class="remove-img" aria-label="Remove image" title="Remove">✕</button>
      <div class="drag-handle absolute inset-x-0 bottom-0 bg-black/50 text-center text-white text-[9px] leading-4">⠿ drag</div>`;
    thumb.style.position = 'relative';

    // Remove
    thumb.querySelector('.remove-img').addEventListener('click', (e) => {
      e.stopPropagation();
      const i = currentItem.images.indexOf(src);
      if (i !== -1) {
        currentItem.images.splice(i, 1);
        rebuildDropZone();
        updatePreview();
      }
    });

    // Preview on click
    thumb.querySelector('img').addEventListener('click', () => openLightbox(src));

    // Drag events
    thumb.addEventListener('dragstart', handleDragStart);
    thumb.addEventListener('dragover',  handleDragOver);
    thumb.addEventListener('dragleave', handleDragLeave);
    thumb.addEventListener('drop',      handleDrop);
    thumb.addEventListener('dragend',   handleDragEnd);

    dropZone.appendChild(thumb);
    dropHint.style.display = 'none';
  }

  // Drag to reorder
  function handleDragStart(e) {
    dragSrcEl = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.src);
  }
  function handleDragOver(e) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    this.classList.add('drag-over');
  }
  function handleDragLeave() { this.classList.remove('drag-over'); }
  function handleDragEnd() {
    this.classList.remove('dragging');
    dropZone.querySelectorAll('.img-thumb').forEach(t => t.classList.remove('drag-over','dragging'));
  }
  function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    if (dragSrcEl === this) return;
    const srcPath = dragSrcEl.dataset.src;
    const dstPath = this.dataset.src;
    const srcIdx  = currentItem.images.indexOf(srcPath);
    const dstIdx  = currentItem.images.indexOf(dstPath);
    if (srcIdx !== -1 && dstIdx !== -1) {
      currentItem.images.splice(srcIdx, 1);
      currentItem.images.splice(dstIdx, 0, srcPath);
      rebuildDropZone();
      updatePreview();
    }
  }

  // Drop zone accepts file drops too
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) uploadFiles(files);
  });

  // ════════════════════════════════════════════════════════════
  // IMAGE UPLOAD
  // ════════════════════════════════════════════════════════════
  imageUpload.addEventListener('change', () => {
    const files = Array.from(imageUpload.files);
    if (files.length) uploadFiles(files);
    imageUpload.value = '';
  });

  async function uploadFiles(files) {
    uploadProgress.classList.remove('hidden');
    let done = 0;
    for (const file of files) {
      uploadProgressText.textContent = `Uploading ${file.name}…`;
      uploadBar.style.width = `${Math.round((done / files.length) * 100)}%`;
      try {
        const fd = new FormData();
        fd.append('image', file);
        fd.append('token', PASS);
        const res = await fetch(`${API_BASE}?action=upload_image`, {
          method: 'POST',
          headers: { 'X-Admin-Token': PASS },
          body: fd
        });
        const json = await res.json();
        if (json.ok && json.path) {
          currentItem.images.push(json.path);
          addThumb(json.path, currentItem.images.length - 1);
          imageCount.textContent = `${currentItem.images.length} image${currentItem.images.length !== 1 ? 's' : ''}`;
          dropHint.style.display = 'none';
          updatePreview();
        } else {
          showToast(`Upload failed: ${json.error || 'Unknown error'}`, 'error');
        }
      } catch (err) {
        showToast(`Upload error: ${err.message}`, 'error');
      }
      done++;
    }
    uploadBar.style.width = '100%';
    setTimeout(() => {
      uploadProgress.classList.add('hidden');
      uploadBar.style.width = '0%';
    }, 800);
  }

  // ════════════════════════════════════════════════════════════
  // LIVE PREVIEW
  // ════════════════════════════════════════════════════════════
  itemTitle.addEventListener('input', updatePreview);
  itemSubtitle.addEventListener('input', updatePreview);

  function updatePreview() {
    const imgs = currentItem ? currentItem.images : [];
    if (imgs.length) {
      previewSection.classList.remove('hidden');
      coverPreview.src = imgs[0];
      previewTitle.textContent = itemTitle.value || 'Untitled';
      previewSub.textContent   = `View ${imgs.length} Photo${imgs.length !== 1 ? 's' : ''}`;
    } else {
      previewSection.classList.add('hidden');
    }
  }

  // ════════════════════════════════════════════════════════════
  // SAVE ITEM
  // ════════════════════════════════════════════════════════════
  saveItemBtn.addEventListener('click', async () => {
    // Validation
    let valid = true;
    if (!itemTitle.value.trim()) {
      titleError.classList.remove('hidden'); valid = false;
    } else { titleError.classList.add('hidden'); }
    if (!currentItem.images.length) {
      sequenceError.classList.remove('hidden'); valid = false;
    } else { sequenceError.classList.add('hidden'); }
    if (!valid) return;

    currentItem.title    = itemTitle.value.trim();
    currentItem.subtitle = itemSubtitle.value.trim();

    // Update galleryData
    if (editMode) {
      const idx = galleryData.findIndex(i => i.id === currentItem.id);
      if (idx !== -1) galleryData[idx] = currentItem;
    } else {
      galleryData.push(currentItem);
    }

    // Save to server
    saveBtnText.textContent = 'Saving…';
    saveBtnSpinner.classList.remove('hidden');
    saveItemBtn.disabled = true;

    try {
      const res = await apiFetch('save_gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': PASS },
        body: JSON.stringify(galleryData)
      });
      if (res.ok) {
        showToast(editMode ? 'Changes saved successfully!' : 'New item created!', 'success');
        statSaved.textContent = 'Just now';
        closePanelFn();
        renderGrid(galleryData);
        updateStats();
      } else {
        showToast(`Save failed: ${res.error}`, 'error');
        // Roll back if new
        if (!editMode) galleryData.pop();
      }
    } catch (err) {
      showToast(`Server error: ${err.message}. Is the gallery API running?`, 'error', 7000);
      if (!editMode) galleryData.pop();
    } finally {
      saveBtnText.textContent = editMode ? 'Save Changes' : 'Create Item';
      saveBtnSpinner.classList.add('hidden');
      saveItemBtn.disabled = false;
    }
  });

  // ════════════════════════════════════════════════════════════
  // DELETE ITEM
  // ════════════════════════════════════════════════════════════
  deleteItemBtn.addEventListener('click', async () => {
    if (!currentItem) return;
    const confirmed = confirm(`Delete "${currentItem.title || 'this item'}"?\n\nThis removes it from the gallery. Uploaded image files are NOT deleted.`);
    if (!confirmed) return;

    galleryData = galleryData.filter(i => i.id !== currentItem.id);
    try {
      await apiFetch('save_gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': PASS },
        body: JSON.stringify(galleryData)
      });
      showToast('Item deleted.', 'info');
    } catch (err) {
      showToast('Could not save after delete: ' + err.message, 'error');
    }
    closePanelFn();
    renderGrid(galleryData);
    updateStats();
  });

  // ════════════════════════════════════════════════════════════
  // DUPLICATE ITEM
  // ════════════════════════════════════════════════════════════
  function duplicateItem(id) {
    const src = galleryData.find(i => i.id === id);
    if (!src) return;
    const dupe = JSON.parse(JSON.stringify(src));
    dupe.id    = 'item-' + Date.now();
    dupe.title = src.title + ' (copy)';
    galleryData.push(dupe);
    apiFetch('save_gallery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': PASS },
      body: JSON.stringify(galleryData)
    }).then(() => {
      showToast('Item duplicated.', 'success');
      renderGrid(galleryData);
      updateStats();
    }).catch(err => showToast('Duplication failed: ' + err.message, 'error'));
  }

  // ════════════════════════════════════════════════════════════
  // STATS
  // ════════════════════════════════════════════════════════════
  function updateStats() {
    statItems.textContent  = galleryData.length;
    statImages.textContent = galleryData.reduce((s, i) => s + (i.images||[]).length, 0);
  }

  // ════════════════════════════════════════════════════════════
  // LIGHTBOX
  // ════════════════════════════════════════════════════════════
  function openLightbox(src) {
    document.getElementById('lightboxImg').src = src;
    document.getElementById('lightbox').classList.remove('hidden');
  }
  window.closeLightbox = function() {
    document.getElementById('lightbox').classList.add('hidden');
    document.getElementById('lightboxImg').src = '';
  };

  // ════════════════════════════════════════════════════════════
  // TOAST
  // ════════════════════════════════════════════════════════════
  let toastTimer;
  function showToast(msg, type = 'info', dur = 3500) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className   = `show ${type}`;
    document.getElementById('toast').style.cssText = '';  // re-apply
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), dur);
  }

  // ════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════
  function escHtml(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
})();
