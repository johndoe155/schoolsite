(function () {
// Data (replace with your API/CMS data)
  // All articles are managed by the admin — loaded from the server via /api/posts on boot
  window.posts = window.posts || [];

  window.categories = ['All','Science & Technology','Arts & Humanities','Business & Economics','Campus Life','Sports','Announcements'];
  const perPage = 6;

  // State (exposed globally so admin JS can reset it)
  window.state = { query:'', category:'All', page:1 };
  let state = window.state;

  // Elements
  const newsGrid = document.getElementById('newsGrid');
  const searchInput = document.getElementById('searchInput');
  const categoryChips = document.getElementById('categoryChips');
  const pageInfo = document.getElementById('pageInfo');
  const pageCounter = document.getElementById('pageCounter');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const searchForm = document.getElementById('searchForm');
  const mainContent = document.getElementById('mainContent');

  // Init
  function init(){
    // render chips
    categories.forEach(cat=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (cat==='All' ? ' active' : '');
      btn.textContent = cat;
      btn.setAttribute('role','tab');
      btn.setAttribute('aria-selected', cat==='All' ? 'true' : 'false');
      btn.addEventListener('click', ()=>{
        state.category = cat;
        state.page = 1;
        updateChips();
        render();
        if(location.hash && !location.hash.startsWith('#/post/')) history.replaceState(null,'',location.pathname+location.search);
      });
      categoryChips.appendChild(btn);
    });

    // Search input handler
    searchInput.addEventListener('input', (e)=>{
      state.query = e.target.value;
      state.page = 1;
      render();
    });

    searchForm.addEventListener('submit', function(e){
      e.preventDefault();
      state.query = searchInput.value.trim();
      state.page = 1;
      render();
    });

    prevBtn.addEventListener('click', ()=>{
      if(state.page > 1){ state.page--; render(); }
    });

    nextBtn.addEventListener('click', ()=>{
      const total = filteredPosts().length;
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      if(state.page < totalPages){ state.page++; render(); }
    });

    // newsletter
    const newsletter = document.getElementById('newsletterForm');
    newsletter.addEventListener('submit', function(e){
      e.preventDefault();
      const email = document.getElementById('newsletterEmail').value.trim();
      const btn = newsletter.querySelector('button');
      const status = document.getElementById('newsletterStatus');
      function say(t, ok){ if (status) { status.textContent = t; status.style.color = ok ? '' : '#a11'; } }
      if(!email || !email.includes('@')){ alert('Please enter a valid email address'); return; }

      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Subscribing…';

      /* This used to print "Subscribed ✓" and discard the address. It now posts to
         /api/newsletter and only claims success when the server confirms it. */
      fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
        .then(r => r.json().catch(() => ({})).then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
          if (ok) {
            btn.textContent = 'Subscribed ✓';
            say(d.message || 'Thank you — you are on the list.', true);
            document.getElementById('newsletterEmail').value = '';
            setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 2500);
          } else {
            say(d.error || 'Something went wrong. Please try again.', false);
            btn.disabled = false; btn.textContent = original;
          }
        })
        .catch(() => {
          say('Could not reach the server. Please try again later.', false);
          btn.disabled = false; btn.textContent = original;
        });
    });

    // hash routing
    window.addEventListener('hashchange', handleHash);
    window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeArticle(); });

    render();
    handleHash();
  }

  function updateChips(){
    Array.from(categoryChips.children).forEach(btn=>{
      const isActive = btn.textContent === state.category;
      if(isActive) btn.classList.add('active'); else btn.classList.remove('active');
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.tabIndex = isActive ? 0 : -1;
    });
  }

  function filteredPosts(){
    const q = String(state.query || '').trim().toLowerCase();
    return (window.posts || []).filter(p=>{
      if(state.category !== 'All' && p.category !== state.category) return false;
      if(!q) return true;
      return (p.title && p.title.toLowerCase().includes(q))
        || (p.excerpt && p.excerpt.toLowerCase().includes(q))
        || (p.category && p.category.toLowerCase().includes(q));
    });
  }

  function render(){
    const all = filteredPosts();
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    if(state.page > totalPages) state.page = totalPages;
    const start = (state.page-1)*perPage;
    const pageItems = all.slice(start, start+perPage);

    const from = total === 0 ? 0 : start+1;
    const to = Math.min(start+perPage, total);
    pageInfo.textContent = `Showing ${from}–${to} of ${total} stories`;
    pageCounter.textContent = `${state.page} / ${totalPages}`;
    prevBtn.disabled = state.page === 1;
    nextBtn.disabled = state.page === totalPages;

    // sync bottom pageInfo if present
    var pageInfoBottom = document.getElementById('pageInfoBottom');
    if(pageInfoBottom) pageInfoBottom.textContent = `Showing ${from}–${to} of ${total}`;

    // render cards
    newsGrid.innerHTML = '';
    if(pageItems.length === 0){
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.setAttribute('role','status');
      empty.innerHTML = `<p class="empty-state-title">No stories found.</p><p class="empty-state-sub">Try a different keyword or category.</p>`;
      newsGrid.appendChild(empty);
      return;
    }

    pageItems.forEach((p, idx)=>{
      const article = document.createElement('article');
      article.className = 'card fade-up';
      const mod = idx % 3;
      if(mod === 1) article.classList.add('delay-1');
      else if(mod === 2) article.classList.add('delay-2');

      const titleId = `article-title-${p.id}`;
      article.setAttribute('aria-labelledby', titleId);

      const safeTitle    = escapeHtml(p.title || '');
      const safeExcerpt  = escapeHtml(p.excerpt || '');
      const safeCategory = escapeHtml(p.category || '');

      const dateStr = (p.date) ? new Date(p.date).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) : '';

      article.innerHTML = ''
        + `<div class="media" aria-hidden="true"><img src="${escapeHtml(p.image || '')}" alt="" loading="lazy"></div>`
        + `<div class="card-body">`
        +   `<div class="card-top-row">`
        +     `<span class="tag">${safeCategory}</span>`
        +     `<time class="card-time" datetime="${escapeHtml(p.date || '')}">${escapeHtml(dateStr)}</time>`
        +   `</div>`
        +   `<h3 id="${titleId}" class="card-title">${safeTitle}</h3>`
        +   `<p class="card-excerpt">${safeExcerpt}</p>`
        +   `<div class="card-footer">`
        +     `<a class="read-more" href="#/post/${p.id}" data-id="${p.id}" aria-labelledby="${titleId}">Read article <span class="read-more-arrow" aria-hidden="true"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span></a>`
        +   `</div>`
        + `</div>`;

      newsGrid.appendChild(article);
    });

    // attach click handlers
    newsGrid.querySelectorAll('a.read-more').forEach(a=>{
      a.addEventListener('click', function(e){
        e.preventDefault();
        const id = this.dataset.id;
        if(!id) return;
        location.hash = `/post/${id}`;
      });
    });
  }

  function escapeHtml(input){
    return String(input)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- Article overlay handling ---
  let currentArticleEl = null;
  let overlayPrevFooterDisplay = '';

  function handleHash(){
    const h = location.hash || '';
    const match = h.match(/^#\/post\/(\d+)$/);
    if(match){
      const id = Number(match[1]);
      renderArticle(id);
    } else {
      closeArticle();
    }
  }

  function renderArticle(id){
    const post = (window.posts || []).find(p => p.id === id);
    if(!post){ showTemporaryMessage('Article not found.'); return; }

    if(currentArticleEl && Number(currentArticleEl.dataset.id) === id) return;

    closeArticle(true);

    // lock body scroll and remember previous position
    window.__prevScroll = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.top = `-${window.__prevScroll}px`;
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';

    // hide footer to make overlay own the viewport
    const footerEl = document.querySelector('footer.site-footer');
    if(footerEl){ overlayPrevFooterDisplay = footerEl.style.display || ''; footerEl.style.display = 'none'; }

    const prevFocus = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'article-overlay fade-up';
    overlay.dataset.id = id;
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-labelledby','article-page-title');

    const dateStr = post.date ? new Date(post.date).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) : '';

    overlay.innerHTML = `
      <div class="overlay-topbar" role="banner">
        <div class="overlay-breadcrumb">
          <span>BIC News</span>
          <span class="overlay-breadcrumb-sep" aria-hidden="true">›</span>
          <span>${escapeHtml(post.category)}</span>
        </div>
        <div class="overlay-actions">
          <button class="btn-ghost" id="shareLink" type="button" aria-label="Copy article link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>
          <button class="btn-close" id="closeOverlay" type="button" aria-label="Close article">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Close
          </button>
        </div>
      </div>

      <div class="container-inner">
        <div class="meta">
          <span class="tag">${escapeHtml(post.category)}</span>
          <time datetime="${escapeHtml(post.date || '')}" style="font-size:13px;color:var(--ink-45);font-weight:300;">${escapeHtml(dateStr)}</time>
        </div>
        <h1 id="article-page-title">${escapeHtml(post.title)}</h1>

        ${post.image ? `<div class="hero-media" aria-hidden="false"><img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}"></div>` : ''}

        <div class="article-content">${post.content}</div>
      </div>
    `;

    document.body.appendChild(overlay);

    mainContent.setAttribute('aria-hidden','true');
    if(footerEl) footerEl.setAttribute('aria-hidden','true');

    // focus trap
    const focusableSelector = 'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const focusable = overlay.querySelectorAll(focusableSelector);
    let firstFocusable = focusable[0] || overlay;
    let lastFocusable = focusable[focusable.length -1] || overlay;

    function onKeyDown(e){
      if(e.key === 'Escape'){ e.preventDefault(); if(location.hash && location.hash.startsWith('#/post/')){ if(history.length > 1) history.back(); else location.hash = ''; } else { closeArticle(); } }
      if(e.key === 'Tab'){
        if(focusable.length === 0){ e.preventDefault(); return; }
        if(e.shiftKey){
          if(document.activeElement === firstFocusable){ e.preventDefault(); lastFocusable.focus(); }
        } else {
          if(document.activeElement === lastFocusable){ e.preventDefault(); firstFocusable.focus(); }
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);

    const closeBtn = overlay.querySelector('#closeOverlay');
    closeBtn.focus();

    closeBtn.addEventListener('click', function(){
      if(location.hash && location.hash.startsWith('#/post/')){ if(history.length > 1) history.back(); else location.hash = ''; } else { closeArticle(); }
    });

    const share = overlay.querySelector('#shareLink');
    share.addEventListener('click', function(e){
      e.preventDefault();
      const url = location.origin + location.pathname + location.search + '#/post/' + id;
      if(navigator.clipboard){
        navigator.clipboard.writeText(url).then(()=>{ showTemporaryMessage('Link copied to clipboard'); }).catch(()=>{ prompt('Copy this link', url); });
      } else {
        prompt('Copy this link', url);
      }
    });

    currentArticleEl = overlay;
    currentArticleEl._onKeyDown = onKeyDown;
    currentArticleEl._prevFocus = prevFocus;
    currentArticleEl._footerEl = footerEl;
    currentArticleEl._overlayPrevFooterDisplay = overlayPrevFooterDisplay;

    document.title = post.title + ' — Bodija International College';
    overlay.scrollIntoView({behavior:'smooth', block:'start'});
  }

  function closeArticle(force){
    if(!currentArticleEl) return;

    if(currentArticleEl._onKeyDown) window.removeEventListener('keydown', currentArticleEl._onKeyDown);

    if(document.body.style.position === 'fixed'){
      const prev = window.__prevScroll || 0;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, prev);
      window.__prevScroll = 0;
    }

    const footerEl = currentArticleEl._footerEl;
    if(footerEl){
      footerEl.style.display = currentArticleEl._overlayPrevFooterDisplay || '';
      footerEl.removeAttribute('aria-hidden');
    }

    mainContent.removeAttribute('aria-hidden');

    try{ if(currentArticleEl._prevFocus && currentArticleEl._prevFocus.focus) currentArticleEl._prevFocus.focus(); }catch(e){}

    currentArticleEl.remove();
    currentArticleEl = null;

    document.title = 'Bodija International College — School News';

    if(!force && location.hash && location.hash.startsWith('#/post/')){ history.replaceState(null,'',location.pathname+location.search); }
  }

  function showTemporaryMessage(msg){
    const tmp = document.createElement('div');
    tmp.style.position='fixed'; tmp.style.right='20px'; tmp.style.bottom='30px'; tmp.style.background='#111827'; tmp.style.color='#fff'; tmp.style.padding='10px 14px'; tmp.style.borderRadius='10px'; tmp.style.boxShadow='0 10px 30px rgba(0,0,0,0.3)'; tmp.style.zIndex=9999;
    tmp.textContent = msg;
    document.body.appendChild(tmp);
    setTimeout(()=>{ tmp.remove(); }, 2200);
  }

  // Expose key functions globally for admin JS
  window.render = render;
  window.updateChips = updateChips;
  window.renderArticle = renderArticle;

  // start
  init();
})();

(function () {
(function(){
    'use strict';

    // ── Session flag (UI only — real auth lives server-side) ──────────
    var SESSION_AUTH = 'bic_admin_auth';
    function isAuth(){ return sessionStorage.getItem(SESSION_AUTH) === '1'; }
    function setAuth(v){ v ? sessionStorage.setItem(SESSION_AUTH,'1') : sessionStorage.removeItem(SESSION_AUTH); }

    // ── Holds the File object chosen in the dropzone ──────────────────
    var _selectedFile = null;

    // ── API wrapper (JSON endpoints) ──────────────────────────────────
    function api(method, url, body){
      var opts = {
        method:      method,
        credentials: 'same-origin',
        headers:     { 'Content-Type': 'application/json' }
      };
      if(body !== undefined) opts.body = JSON.stringify(body);
      return fetch(url, opts).then(function(res){
        return res.json().then(function(data){
          if(!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
          return data;
        });
      });
    }

    // ── HTML escape ───────────────────────────────────────────────────
    function escHtml(s){
      return String(s||'')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    // ── Featured section updater ──────────────────────────────────────
    window.updateFeaturedSection = function(){
      var fp = (window.posts||[]).find(function(p){ return p.id === window.featuredId; })
            || (window.posts && window.posts[0]);
      if(!fp) return;
      var exc = document.getElementById('featuredExcerpt');
      var lnk = document.getElementById('featuredLink');
      if(exc) exc.textContent = fp.excerpt || '';
      if(lnk){
        lnk.setAttribute('href','#/post/'+fp.id);
        lnk.setAttribute('aria-label','Read featured story: '+escHtml(fp.title));
        var fresh = lnk.cloneNode(true);
        lnk.parentNode.replaceChild(fresh, lnk);
        fresh.addEventListener('click', function(e){
          e.preventDefault();
          location.hash = '/post/'+fp.id;
          if(typeof window.renderArticle === 'function'){
            try{ window.renderArticle(fp.id); }catch(_){}
          }
        }, {passive:false});
      }
    };

    // ── Admin Login ───────────────────────────────────────────────────
    function showLogin(){
      document.getElementById('adminLogin').classList.add('adm-visible');
      document.getElementById('adminLoginError').style.display = 'none';
      document.getElementById('adminPasswordInput').value = '';
      setTimeout(function(){ document.getElementById('adminPasswordInput').focus(); }, 80);
    }
    function hideLogin(){
      document.getElementById('adminLogin').classList.remove('adm-visible');
    }

    // ── Admin Panel ───────────────────────────────────────────────────
    function showPanel(){
      renderAdminPanel();
      document.getElementById('adminPanel').classList.add('adm-visible');
    }
    function hidePanel(){
      document.getElementById('adminPanel').classList.remove('adm-visible');
    }

    // ── Render article list ───────────────────────────────────────────
    function renderAdminPanel(){
      var list  = document.getElementById('adminArticleList');
      if(!list) return;
      var posts = window.posts || [];
      var fid   = window.featuredId;

      if(posts.length === 0){
        list.innerHTML = '<div class="adm-empty-state">No articles yet.</div>';
        return;
      }

      list.innerHTML = '';
      posts.forEach(function(p){
        var isFeat = p.id === fid;
        var row    = document.createElement('div');
        row.className = 'adm-article-row';

        var badge = isFeat ? '<span class="adm-featured-badge">FEATURED</span>' : '';
        var date  = p.date ? new Date(p.date).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}) : '';

        row.innerHTML =
          '<div class="adm-article-info">'
          + '<div class="adm-article-title-text" title="'+escHtml(p.title)+'">'
          +   escHtml(p.title)+badge
          + '</div>'
          + '<div class="adm-article-meta-text">'+escHtml(p.category)+' · '+escHtml(date)+'</div>'
          + '</div>'
          + '<button class="adm-btn adm-btn-star'+(isFeat?' adm-is-featured':'')+'" title="'+(isFeat?'Currently featured':'Set as featured')+'" data-id="'+p.id+'">★</button>'
          + '<button class="adm-btn adm-btn-del" title="Delete article" data-id="'+p.id+'">🗑</button>';

        // ★ Set featured → PUT /api/config/featured
        row.querySelector('.adm-btn-star').addEventListener('click', function(){
          var btn = this; btn.disabled = true;
          api('PUT', '/api/config/featured', { featuredId: p.id })
            .then(function(){
              window.featuredId = p.id;
              window.updateFeaturedSection();
              renderAdminPanel();
              showToast('★ "'+p.title+'" is now the featured story.');
            })
            .catch(function(e){ showToast('Error: '+e.message); btn.disabled = false; });
        });

        // 🗑 Delete → DELETE /api/posts/:id
        row.querySelector('.adm-btn-del').addEventListener('click', function(){
          if(!confirm('Delete "'+p.title+'"?\n\nThis cannot be undone.')) return;
          var btn = this; btn.disabled = true;
          api('DELETE', '/api/posts/'+p.id)
            .then(function(){
              var idx = window.posts.findIndex(function(x){ return x.id === p.id; });
              if(idx !== -1) window.posts.splice(idx, 1);
              if(window.featuredId === p.id){
                window.featuredId = window.posts[0] ? window.posts[0].id : null;
                window.updateFeaturedSection();
              }
              if(typeof window.render === 'function') try{ window.render(); }catch(_){}
              renderAdminPanel();
              showToast('Article deleted.');
            })
            .catch(function(e){ showToast('Error: '+e.message); btn.disabled = false; });
        });

        list.appendChild(row);
      });
    }

    // ── Image dropzone ────────────────────────────────────────────────
    function setupImageDropzone(){
      var dropzone   = document.getElementById('imageDropzone');
      var fileInput  = document.getElementById('newImage');
      var idleEl     = document.getElementById('dropzoneIdle');
      var previewEl  = document.getElementById('dropzonePreview');
      var previewImg = document.getElementById('previewImg');
      var filenameEl = document.getElementById('previewFilename');
      var removeBtn  = document.getElementById('removeImageBtn');
      var sizeErr    = document.getElementById('dzSizeError');
      if(!dropzone || !fileInput) return;

      var MAX_BYTES = 5 * 1024 * 1024; // 5 MB

      function showPreview(file){
        // Size guard
        if(file.size > MAX_BYTES){
          dropzone.classList.add('adm-dz-error');
          sizeErr.textContent = 'File is too large (' + (file.size/1024/1024).toFixed(1) + ' MB). Maximum is 5 MB.';
          sizeErr.classList.add('visible');
          fileInput.value = '';
          _selectedFile = null;
          return;
        }
        dropzone.classList.remove('adm-dz-error');
        sizeErr.classList.remove('visible');

        var reader = new FileReader();
        reader.onload = function(e){
          previewImg.src = e.target.result;
          if(filenameEl) filenameEl.textContent = file.name;
          idleEl.style.display  = 'none';
          previewEl.style.display = 'block';
        };
        reader.readAsDataURL(file);
        _selectedFile = file;
      }

      function clearPreview(){
        previewImg.src = '';
        if(filenameEl) filenameEl.textContent = '';
        idleEl.style.display    = '';
        previewEl.style.display = 'none';
        fileInput.value = '';
        dropzone.classList.remove('adm-dz-error');
        sizeErr.classList.remove('visible');
        _selectedFile = null;
      }

      // Click anywhere in the dropzone opens the picker
      dropzone.addEventListener('click', function(e){
        // Don't re-open picker when clicking the Remove button
        if(removeBtn && (e.target === removeBtn || removeBtn.contains(e.target))) return;
        fileInput.click();
      });

      // Keyboard activation
      dropzone.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          fileInput.click();
        }
      });

      // File input change
      fileInput.addEventListener('change', function(){
        var file = this.files && this.files[0];
        if(file) showPreview(file);
      });

      // Drag-and-drop
      dropzone.addEventListener('dragover', function(e){
        e.preventDefault(); e.stopPropagation();
        dropzone.classList.add('adm-dz-over');
      });
      ['dragleave','dragend'].forEach(function(evt){
        dropzone.addEventListener(evt, function(){
          dropzone.classList.remove('adm-dz-over');
        });
      });
      dropzone.addEventListener('drop', function(e){
        e.preventDefault(); e.stopPropagation();
        dropzone.classList.remove('adm-dz-over');
        var files = e.dataTransfer && e.dataTransfer.files;
        var file  = files && files[0];
        if(file && file.type.startsWith('image/')) showPreview(file);
      });

      // Remove button
      removeBtn.addEventListener('click', function(e){
        e.stopPropagation();
        clearPreview();
      });

      // Expose clearPreview so form reset can call it
      dropzone._clear = clearPreview;
    }

    // ── Add article form ──────────────────────────────────────────────
    function setupAddForm(){
      var form = document.getElementById('adminAddForm');
      if(!form) return;

      var dateInput = document.getElementById('newDate');
      if(dateInput) dateInput.valueAsDate = new Date();

      form.addEventListener('submit', function(e){
        e.preventDefault();

        var title   = (document.getElementById('newTitle').value||'').trim();
        var cat     = document.getElementById('newCategory').value;
        var date    = document.getElementById('newDate').value;
        var excerpt = (document.getElementById('newExcerpt').value||'').trim();
        var body    = (document.getElementById('newContent').value||'').trim();
        var setFeat = document.getElementById('newSetFeatured').checked;

        if(!title || !excerpt || !body){
          alert('Please fill in all required fields (Headline, Excerpt, Body).');
          return;
        }

        // Build HTML from plain paragraphs
        var contentHtml = '<p>' + body.split(/\n{2,}/).map(function(chunk){
          return chunk.replace(/\n/g,'<br>');
        }).join('</p><p>') + '</p>';

        var submitBtn = form.querySelector('.adm-submit');
        if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Publishing…'; }

        // ── POST /api/posts  ──────────────────────────────────────────
        // Use FormData so we can attach the image file in a single request
        var fd = new FormData();
        fd.append('title',       title);
        fd.append('category',    cat);
        fd.append('date',        date);
        fd.append('excerpt',     excerpt);
        fd.append('content',     contentHtml);
        fd.append('setFeatured', setFeat ? '1' : '0');
        if(_selectedFile) fd.append('image', _selectedFile, _selectedFile.name);

        // NOTE: Do NOT set Content-Type — the browser sets the multipart boundary automatically
        fetch('/api/posts', {
          method:      'POST',
          credentials: 'same-origin',
          body:        fd
        })
        .then(function(res){
          return res.json().then(function(data){
            if(!res.ok) throw new Error(data.error || 'HTTP '+res.status);
            return data;
          });
        })
        .then(function(newPost){
          if(!window.posts) window.posts = [];
          window.posts.unshift(newPost);

          // Add new category chip if needed
          if(window.categories && !window.categories.includes(cat)){
            window.categories.push(cat);
            var chips = document.getElementById('categoryChips');
            if(chips){
              var chip = document.createElement('button');
              chip.type='button'; chip.className='chip'; chip.textContent=cat;
              chip.setAttribute('role','tab'); chip.setAttribute('aria-selected','false');
              chip.addEventListener('click', function(){
                window.state.category=cat; window.state.page=1;
                if(typeof window.updateChips==='function') window.updateChips();
                if(typeof window.render==='function') try{ window.render(); }catch(_){}
              });
              chips.appendChild(chip);
            }
          }

          if(newPost.isFeatured){
            window.featuredId = newPost.id;
            window.updateFeaturedSection();
          }

          if(typeof window.render === 'function') try{ window.render(); }catch(_){}
          renderAdminPanel();

          form.reset();
          if(dateInput) dateInput.valueAsDate = new Date();

          // Clear the dropzone preview
          var dz = document.getElementById('imageDropzone');
          if(dz && dz._clear) dz._clear();

          var msg = document.getElementById('adminSuccessMsg');
          if(msg){ msg.style.display='block'; setTimeout(function(){ msg.style.display='none'; }, 3000); }
        })
        .catch(function(e){ alert('Failed to publish: '+e.message); })
        .finally(function(){
          if(submitBtn){ submitBtn.disabled=false; submitBtn.textContent='Publish Article'; }
        });
      });
    }

    // ── Toast ─────────────────────────────────────────────────────────
    function showToast(msg){
      var t = document.createElement('div');
      t.style.cssText = 'position:fixed;right:20px;bottom:30px;background:#111827;color:#fff;padding:11px 16px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.3);z-index:40000;font-size:13px;font-family:Montserrat,sans-serif;font-weight:600;max-width:280px';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function(){ t.remove(); }, 2400);
    }

    // ── Newsletter → /api/newsletter* ─────────────────────────────────
    /* The subscriber list was collected for months with no way to send to it.
       Sending is deliberately two-step: "Check audience" fetches the count and
       enables the send button; the send button is disabled again the moment
       the message is edited, so the number on screen always belongs to the
       message about to go out. Delivery is chunked by the server (400 per
       request) and this screen loops until `remaining` is zero, showing
       progress — a single request for a 20,000-person list would time out
       somewhere and nobody would know what had been delivered. */
    function setupNewsletter(){
      var form = document.getElementById('adminNewsletterForm');
      if(!form) return;

      var countEl    = document.getElementById('newsletterCount');
      var statusEl   = document.getElementById('nlStatus');
      var errEl      = document.getElementById('nlError');
      var sendBtn    = document.getElementById('nlSendBtn');
      var previewBtn = document.getElementById('nlPreviewBtn');
      var testBtn    = document.getElementById('nlTestBtn');
      var progressEl = document.getElementById('nlProgress');
      var barEl      = document.getElementById('nlProgressBar');
      var progTextEl = document.getElementById('nlProgressText');

      var audience      = null;   // null = "not checked yet, or edited since"
      var resumeId      = null;   // an interrupted campaign with this subject
      var sending       = false;

      function subject(){ return (document.getElementById('nlSubject').value||'').trim(); }
      function body(){ return (document.getElementById('nlBody').value||'').trim(); }

      function showStatus(msg){
        statusEl.textContent = msg ? '✓ ' + msg : '';
        statusEl.style.display = msg ? 'block' : 'none';
      }
      function showError(msg){
        errEl.textContent = msg || '';
        errEl.style.display = msg ? 'block' : 'none';
      }
      function setProgress(sent, total){
        if(!total) return;
        progressEl.hidden = false;
        var pct = Math.min(100, Math.round((sent/total)*100));
        barEl.style.width = pct + '%';
        progTextEl.textContent = 'Sent ' + sent + ' of ' + total + ' …';
      }

      /* Load the list size, and pick up an interrupted send of the same
         subject so a retry continues instead of mailing the top of the list
         twice. */
      function refreshAudienceList(){
        api('GET', '/api/newsletter')
          .then(function(data){
            countEl.textContent = data.count + (data.count === 1 ? ' subscriber' : ' subscribers');
            var last = (data.campaigns || [])[0];
            if(last && !last.completedAt && last.subject === subject()){
              resumeId = last.id;
            } else {
              resumeId = null;
            }
          })
          .catch(function(e){
            countEl.textContent = 'Subscriber count unavailable';
            console.error('[BIC] newsletter list:', e.message);
          });
      }

      function invalidateAudience(){
        audience = null;
        sendBtn.disabled = true;
        sendBtn.textContent = 'Send newsletter';
        showStatus('');
        if(!progressEl.hidden && !sending) progressEl.hidden = true;
      }

      // Any edit means the checked audience no longer describes this message.
      form.addEventListener('input', invalidateAudience);

      previewBtn.addEventListener('click', function(){
        if(!subject() || !body()){ showError('Add a subject and a message first.'); return; }
        showError('');
        previewBtn.disabled = true;
        previewBtn.textContent = 'Checking…';
        api('POST', '/api/newsletter/send', { subject: subject(), text: body(), preview: true })
          .then(function(data){
            audience = data;
            var msg = 'This will send to ' + data.recipients +
              (data.recipients === 1 ? ' subscriber.' : ' subscribers.');
            if(!data.recipients){
              sendBtn.disabled = true;
              showStatus('');
              showError('There is nobody on the list yet, so there is nothing to send.');
              return;
            }
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send to ' + data.recipients +
              (data.recipients === 1 ? ' subscriber' : ' subscribers');
            showError('');
            showStatus(msg + (resumeId
              ? ' An earlier send of this subject stopped part-way; this continues it.'
              : ' Press the button to send — it cannot be called back.'));
          })
          .catch(function(e){ showError(e.message); })
          .finally(function(){
            previewBtn.disabled = false;
            previewBtn.textContent = 'Check audience';
          });
      });

      testBtn.addEventListener('click', function(){
        var to = (document.getElementById('nlTestTo').value||'').trim();
        if(!subject() || !body()){ showError('Add a subject and a message first.'); return; }
        if(!to){ showError('Enter the address to send the test to.'); return; }
        showError(''); showStatus('');
        testBtn.disabled = true;
        testBtn.textContent = 'Sending…';
        api('POST', '/api/newsletter/send', { subject: subject(), text: body(), test_to: to })
          .then(function(){ showStatus('Test message sent to ' + to + '. Check it before sending for real.'); })
          .catch(function(e){ showError('Test failed: ' + e.message); })
          .finally(function(){
            testBtn.disabled = false;
            testBtn.textContent = 'Send test';
          });
      });

      /* One chunk per request. The server decides the chunk size; we only stop
         when it reports nothing left. */
      function sendChunk(campaignId){
        var payload = { subject: subject(), text: body(), confirm: true };
        if(campaignId) payload.campaign_id = campaignId;
        return api('POST', '/api/newsletter/send', payload).then(function(res){
          setProgress(res.sent, res.recipients);
          if(res.remaining > 0 && res.campaign_id) return sendChunk(res.campaign_id);
          return res;
        });
      }

      form.addEventListener('submit', function(e){
        e.preventDefault();
        if(sending) return;
        if(!audience){ showError('Press “Check audience” first.'); return; }

        sending = true;
        showError(''); showStatus('');
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending…';
        progressEl.hidden = false;
        barEl.style.width = '0';

        sendChunk(resumeId)
          .then(function(res){
            var failed = (res.failed || []).length;
            setProgress(res.sent, res.recipients);
            progTextEl.textContent = 'Sent ' + res.sent + ' of ' + res.recipients +
              (failed ? ' · ' + failed + ' could not be delivered' : '');
            showStatus(failed
              ? 'Finished. ' + failed + ' address(es) could not be delivered — see the server log.'
              : 'Newsletter sent to ' + res.sent +
                (res.sent === 1 ? ' subscriber.' : ' subscribers.'));
            sendBtn.textContent = 'Send newsletter';
            /* Nothing left to send for this message: leave the button disabled
               until the next edit + audience check. */
            audience = null;
            resumeId = null;
            refreshAudienceList();
          })
          .catch(function(err){
            showError(err.message + (sendBtn.disabled
              ? ' Some messages may already have gone out — press “Check audience” again to continue where it stopped.' : ''));
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send newsletter';
          })
          .finally(function(){ sending = false; });
      });

      refreshAudienceList();
      /* A subject typed on an empty form should reveal any interrupted send
         for that same subject as soon as it matches. */
      document.getElementById('nlSubject').addEventListener('blur', refreshAudienceList);
    }

    // ── Logout → POST /api/logout ─────────────────────────────────────
    function logout(){
      api('POST', '/api/logout').finally(function(){
        setAuth(false);
        hidePanel();
        hideLogin();
        if(location.hash === '#admin') history.replaceState(null,'',location.pathname+location.search);
        if(typeof window.render === 'function') try{ window.render(); }catch(_){}
        showToast('Logged out.');
      });
    }

    // ── Hash routing ──────────────────────────────────────────────────
    function checkAdminHash(){
      if(location.hash === '#admin'){
        if(isAuth()) showPanel();
        else showLogin();
      }
    }

    // ── Boot ──────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function(){

      // Load posts + config from the server in parallel
      Promise.all([
        api('GET', '/api/posts'),
        api('GET', '/api/config')
      ])
      .then(function(results){
        var posts  = results[0];
        var config = results[1];

        if(Array.isArray(posts) && posts.length){
          window.posts.length = 0;
          posts.forEach(function(p){ window.posts.push(p); });
        }

        if(config && config.featuredId != null){
          window.featuredId = config.featuredId;
        } else if(window.posts.length){
          window.featuredId = window.posts[0].id;
        }

        window.updateFeaturedSection();
        if(typeof window.render === 'function') try{ window.render(); }catch(_){}
      })
      .catch(function(e){ console.error('[BIC] Could not load data from server:', e.message); });

      // Staff Login link
      var trigger = document.getElementById('adminTrigger');
      if(trigger){
        trigger.addEventListener('click', function(e){
          e.preventDefault();
          if(isAuth()) showPanel();
          else { history.pushState(null,'',location.pathname+location.search+'#admin'); showLogin(); }
        });
      }

      // Back link on login screen
      var backLink = document.getElementById('adminBackLink');
      if(backLink){
        backLink.addEventListener('click', function(e){
          e.preventDefault();
          hideLogin();
          history.replaceState(null,'',location.pathname+location.search);
        });
      }

      // Login form → POST /api/login
      var loginForm = document.getElementById('adminLoginForm');
      if(loginForm){
        loginForm.addEventListener('submit', function(e){
          e.preventDefault();
          var pw     = document.getElementById('adminPasswordInput').value;
          var errEl  = document.getElementById('adminLoginError');
          var submit = loginForm.querySelector('.adm-login-submit');
          if(submit){ submit.disabled=true; submit.textContent='Checking…'; }

          api('POST', '/api/login', { password: pw })
            .then(function(){
              setAuth(true);
              hideLogin();
              history.replaceState(null,'',location.pathname+location.search);
              showPanel();
            })
            .catch(function(){
              errEl.style.display = 'block';
              document.getElementById('adminPasswordInput').value = '';
              document.getElementById('adminPasswordInput').focus();
            })
            .finally(function(){
              if(submit){ submit.disabled=false; submit.textContent='Sign In →'; }
            });
        });
      }

      // Logout button
      var logoutBtn = document.getElementById('adminLogoutBtn');
      if(logoutBtn) logoutBtn.addEventListener('click', logout);

      // Hash routing
      window.addEventListener('hashchange', checkAdminHash);
      checkAdminHash();

      setupImageDropzone();
      setupAddForm();
      setupNewsletter();

      // Footer year
      var yearEl = document.getElementById('year');
      if(yearEl) yearEl.textContent = new Date().getFullYear();
    });

    window.featuredId = window.featuredId || null;

  })();
})();

(function () {
(function(){
    'use strict';

    /* ── Scroll-reveal via IntersectionObserver ── */
    function initReveal(){
      var els = document.querySelectorAll('.reveal');
      if(!els.length) return;

      if(!('IntersectionObserver' in window)){
        els.forEach(function(el){ el.classList.add('revealed'); });
        return;
      }

      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){
            entry.target.classList.add('revealed');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

      els.forEach(function(el){ io.observe(el); });
    }

    /* ── Stagger hero card children on load ── */
    function initHeroStagger(){
      var heroCard = document.querySelector('.hero-card');
      if(!heroCard) return;
      var children = heroCard.children;
      Array.prototype.forEach.call(children, function(child, i){
        child.style.opacity = '0';
        child.style.transform = 'translateY(20px)';
        child.style.transition = 'opacity 700ms cubic-bezier(0.16,1,0.3,1), transform 700ms cubic-bezier(0.16,1,0.3,1)';
        child.style.transitionDelay = (i * 120 + 80) + 'ms';
        requestAnimationFrame(function(){
          requestAnimationFrame(function(){
            child.style.opacity = '1';
            child.style.transform = 'none';
          });
        });
      });
    }

    /* ── Magnetic chip hover (subtle pull) ── */
    function initChipMagnet(){
      document.addEventListener('mousemove', function(e){
        var chips = document.querySelectorAll('.chip');
        chips.forEach(function(chip){
          var rect = chip.getBoundingClientRect();
          var cx = rect.left + rect.width / 2;
          var cy = rect.top + rect.height / 2;
          var dx = e.clientX - cx;
          var dy = e.clientY - cy;
          var dist = Math.sqrt(dx*dx + dy*dy);
          if(dist < 60){
            var pull = (1 - dist / 60) * 4;
            chip.style.transform = 'translate(' + (dx/dist*pull) + 'px,' + (dy/dist*pull) + 'px)';
          } else {
            chip.style.transform = '';
          }
        });
      }, { passive: true });
    }

    /* ── Smooth page-change scroll ── */
    function initPaginationScroll(){
      var grid = document.getElementById('newsGrid');
      if(!grid) return;
      var observer = new MutationObserver(function(){
        var mainEl = document.getElementById('mainContent');
        if(mainEl){
          var top = mainEl.getBoundingClientRect().top + window.scrollY - 100;
          window.scrollTo({ top: top, behavior: 'smooth' });
        }
      });
      observer.observe(grid, { childList: true });
    }

    /* ── Card tilt on hover (subtle 3-D depth) ── */
    function initCardTilt(){
      document.addEventListener('mousemove', function(e){
        var cards = document.querySelectorAll('.card');
        cards.forEach(function(card){
          var rect = card.getBoundingClientRect();
          var inside = e.clientX >= rect.left && e.clientX <= rect.right
                    && e.clientY >= rect.top  && e.clientY <= rect.bottom;
          if(inside){
            var rx = ((e.clientY - rect.top)  / rect.height - 0.5) * -5;
            var ry = ((e.clientX - rect.left) / rect.width  - 0.5) *  5;
            card.style.transform = 'translateY(-4px) perspective(600px) rotateX('+rx+'deg) rotateY('+ry+'deg)';
          } else {
            card.style.transform = '';
          }
        });
      }, { passive: true });
    }

    /* ── Run on DOM ready ── */
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    function init(){
      initReveal();
      initHeroStagger();
      initChipMagnet();
      initPaginationScroll();
      initCardTilt();
    }
  }());
})();
